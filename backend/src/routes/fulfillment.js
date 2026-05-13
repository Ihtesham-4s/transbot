import express from "express";
import { z } from "zod";

import { mongoose } from "../db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Order } from "../models/Order.js";
import { PickList } from "../models/PickList.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();
router.use(authMiddleware);

const objectIdSchema = z
  .string()
  .trim()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), "Invalid id.");

const createOrderSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required.").max(200),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dueDate: z.union([z.string().max(40), z.literal(""), z.null()]).optional(),
  items: z
    .array(
      z.object({
        productId: objectIdSchema,
        quantity: z.coerce.number().int("Quantity must be a whole number.").positive("Quantity must be at least 1.")
      })
    )
    .min(1, "Add at least one product line.")
});

function getUserId(req) {
  return req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null;
}

function formatValidationError(error) {
  return error.flatten ? error.flatten() : { formErrors: error.issues || [] };
}

function mergeLineItems(items) {
  const map = new Map();
  for (const row of items) {
    const id = String(row.productId);
    map.set(id, (map.get(id) || 0) + row.quantity);
  }
  return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

async function generateUniqueOrderNo() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
    const orderNo = `ORD-${Date.now().toString(36).toUpperCase()}-${suffix}`;
    const exists = await Order.exists({ orderNo });
    if (!exists) return orderNo;
  }
  throw new Error("Could not allocate a unique order number.");
}

async function generateUniquePickNo() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
    const pickNo = `PICK-${Date.now().toString(36).toUpperCase()}-${suffix}`;
    const exists = await PickList.exists({ pickNo });
    if (!exists) return pickNo;
  }
  throw new Error("Could not allocate a unique pick list number.");
}

function parseDueDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** POST /api/orders */
router.post("/orders", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: formatValidationError(parsed.error) });
  }

  const merged = mergeLineItems(parsed.data.items);
  const userId = getUserId(req);

  try {
    const productIds = merged.map((row) => row.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    const insufficientItems = [];

    for (const line of merged) {
      const product = byId.get(line.productId);
      if (!product) {
        return res.status(400).json({ message: `Product not found: ${line.productId}.` });
      }

      const available = Number(product.currentStock || 0);
      const requested = line.quantity;

      orderItems.push({
        productId: product._id,
        sku: product.sku,
        name: product.name,
        quantity: requested,
        location: product.location || "",
        availableStockAtCreation: available
      });

      if (available < requested) {
        insufficientItems.push({
          productId: product._id,
          sku: product.sku,
          name: product.name,
          requestedQty: requested,
          availableQty: available,
          shortageQty: requested - available
        });
      }
    }

    const totalItems = orderItems.reduce((sum, row) => sum + row.quantity, 0);
    const allAvailable = insufficientItems.length === 0;
    const status = allAvailable ? "READY_TO_PICK" : "INSUFFICIENT_STOCK";
    const orderNo = await generateUniqueOrderNo();

    const order = await Order.create({
      orderNo,
      customerName: parsed.data.customerName,
      priority: parsed.data.priority || "NORMAL",
      status,
      items: orderItems,
      totalItems,
      insufficientItems: allAvailable ? [] : insufficientItems,
      createdBy: userId || null,
      dueDate: parseDueDate(parsed.data.dueDate)
    });

    await logEvent(
      allAvailable ? "ORDER_CREATED" : "ORDER_INSUFFICIENT_STOCK",
      allAvailable
        ? `Order ${orderNo} created (${totalItems} units) — ready to pick.`
        : `Order ${orderNo} created with insufficient stock (${insufficientItems.length} SKU(s)).`,
      {
        user_id: userId,
        metadata: {
          orderId: String(order._id),
          orderNo,
          status,
          totalItems,
          insufficientCount: insufficientItems.length
        }
      }
    );

    const populated = await Order.findById(order._id).populate("createdBy", "name email");
    return res.status(201).json({ order: populated.toJSON() });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Order number collision; please retry." });
    }
    console.error("[fulfillment] create order", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/orders */
router.get("/orders", async (_req, res) => {
  try {
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email");

    return res.json({ orders: orders.map((o) => o.toJSON()) });
  } catch (error) {
    console.error("[fulfillment] list orders", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/orders/:id */
router.get("/orders/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid id." });
  }

  try {
    const order = await Order.findById(req.params.id).populate("createdBy", "name email");
    if (!order) return res.status(404).json({ message: "Order not found." });
    return res.json({ order: order.toJSON() });
  } catch (error) {
    console.error("[fulfillment] get order", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** PUT /api/orders/:id/cancel */
router.put("/orders/:id/cancel", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid id." });
  }

  const userId = getUserId(req);

  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });

    if (order.status === "COMPLETED") {
      return res.status(400).json({ message: "Cannot cancel a completed order." });
    }
    if (order.status === "CANCELLED") {
      return res.json({ order: order.toJSON() });
    }

    order.status = "CANCELLED";
    await order.save();

    await PickList.updateMany(
      { orderId: order._id, status: { $in: ["OPEN", "PICKING"] } },
      { $set: { status: "CANCELLED" } }
    );

    await logEvent("ORDER_CANCELLED", `Order ${order.orderNo} was cancelled.`, {
      user_id: userId,
      metadata: { orderId: String(order._id), orderNo: order.orderNo }
    });

    const fresh = await Order.findById(order._id).populate("createdBy", "name email");
    return res.json({ order: fresh.toJSON() });
  } catch (error) {
    console.error("[fulfillment] cancel order", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** POST /api/orders/:id/picklist */
router.post("/orders/:id/picklist", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid id." });
  }

  const userId = getUserId(req);

  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });

    if (order.status !== "READY_TO_PICK") {
      return res.status(400).json({
        message: "Pick list can only be generated for orders in READY_TO_PICK status."
      });
    }

    const existing = await PickList.findOne({
      orderId: order._id,
      status: { $in: ["OPEN", "PICKING"] }
    });

    if (existing) {
      const populated = await PickList.findById(existing._id).populate("orderId", "orderNo status");
      return res.status(200).json({ pickList: populated.toJSON(), existing: true });
    }

    const sortedItems = [...order.items].sort((a, b) =>
      String(a.location || "").localeCompare(String(b.location || ""), undefined, { sensitivity: "base" })
    );

    const pickItems = sortedItems.map((row) => ({
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      quantity: row.quantity,
      location: row.location || "",
      picked: false
    }));

    const pickNo = await generateUniquePickNo();

    const pickList = await PickList.create({
      orderId: order._id,
      pickNo,
      status: "OPEN",
      items: pickItems,
      createdBy: userId || null
    });

    order.status = "PICKING";
    await order.save();

    await logEvent("PICKLIST_CREATED", `Pick list ${pickNo} created for order ${order.orderNo}.`, {
      user_id: userId,
      metadata: {
        pickListId: String(pickList._id),
        pickNo,
        orderId: String(order._id),
        orderNo: order.orderNo
      }
    });

    const populated = await PickList.findById(pickList._id).populate("orderId", "orderNo status");
    return res.status(201).json({ pickList: populated.toJSON() });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Pick number collision; please retry." });
    }
    console.error("[fulfillment] create pick list", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/picklists */
router.get("/picklists", async (_req, res) => {
  try {
    const lists = await PickList.find({})
      .sort({ createdAt: -1 })
      .populate("orderId", "orderNo status")
      .populate("createdBy", "name email")
      .lean();

    return res.json({
      pickLists: lists.map((p) => ({
        ...p,
        id: String(p._id),
        _id: undefined,
        __v: undefined,
        orderId: p.orderId ? String(p.orderId._id || p.orderId) : null,
        orderNo: p.orderId?.orderNo || null,
        orderStatus: p.orderId?.status || null,
        createdBy: p.createdBy
          ? { id: String(p.createdBy._id), name: p.createdBy.name, email: p.createdBy.email }
          : null
      }))
    });
  } catch (error) {
    console.error("[fulfillment] list pick lists", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/picklists/:id */
router.get("/picklists/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid id." });
  }

  try {
    const pickList = await PickList.findById(req.params.id)
      .populate("orderId", "orderNo status customerName")
      .populate("createdBy", "name email");

    if (!pickList) return res.status(404).json({ message: "Pick list not found." });

    const json = pickList.toJSON();
    if (pickList.orderId && typeof pickList.orderId === "object") {
      json.order = {
        id: String(pickList.orderId._id),
        orderNo: pickList.orderId.orderNo,
        status: pickList.orderId.status,
        customerName: pickList.orderId.customerName
      };
      delete json.orderId;
    }

    return res.json({ pickList: json });
  } catch (error) {
    console.error("[fulfillment] get pick list", error);
    return res.status(500).json({ message: "Server error." });
  }
});

async function rollbackFulfillmentMoves(applied) {
  for (const row of [...applied].reverse()) {
    await Product.updateOne({ _id: row.productId }, { $inc: { currentStock: row.qty } }).catch(() => {});
    await StockMovement.deleteOne({ _id: row.movementId }).catch(() => {});
  }
  applied.length = 0;
}

/** POST /api/picklists/:id/complete */
router.post("/picklists/:id/complete", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid id." });
  }

  const userId = getUserId(req);
  const applied = [];

  const pickList = await PickList.findById(req.params.id);
  if (!pickList) {
    return res.status(404).json({ message: "Pick list not found." });
  }

  if (pickList.status === "COMPLETED") {
    return res.status(400).json({ message: "This pick list is already completed." });
  }

  if (pickList.status === "CANCELLED") {
    return res.status(400).json({ message: "Cannot complete a cancelled pick list." });
  }

  const order = await Order.findById(pickList.orderId);
  if (!order) {
    return res.status(404).json({ message: "Linked order not found." });
  }

  if (order.status === "COMPLETED") {
    return res.status(400).json({ message: "Order is already completed." });
  }

  const pickListSnap = pickList.toObject();
  const now = new Date();
  const reasonBase = `Order ${order.orderNo} / Pick ${pickList.pickNo}`;

  try {
    for (const line of pickList.items) {
      const qty = Number(line.quantity || 0);
      if (qty <= 0) {
        await rollbackFulfillmentMoves(applied);
        return res.status(400).json({ message: "Invalid quantity on pick list line." });
      }

      const updated = await Product.findOneAndUpdate(
        { _id: line.productId, currentStock: { $gte: qty } },
        { $inc: { currentStock: -qty } },
        { new: true }
      );

      if (!updated) {
        await rollbackFulfillmentMoves(applied);
        return res.status(400).json({
          message: `Not enough stock for ${line.sku} (need ${qty}).`
        });
      }

      const movement = await StockMovement.create({
        productId: line.productId,
        type: "OUT",
        quantity: qty,
        fromLocation: updated.location || line.location || "",
        toLocation: "",
        reason: `${reasonBase} fulfillment OUT`,
        createdBy: userId || null
      });

      applied.push({ productId: line.productId, qty, movementId: movement._id });
    }

    for (const line of pickList.items) {
      line.picked = true;
    }
    pickList.status = "COMPLETED";
    pickList.completedAt = now;
    await pickList.save();

    order.status = "COMPLETED";
    order.pickedAt = order.pickedAt || now;
    order.completedAt = now;
    await order.save();

    await logEvent("PICKING_COMPLETED", `Picking completed for ${pickList.pickNo} (order ${order.orderNo}).`, {
      user_id: userId,
      metadata: {
        pickListId: String(pickList._id),
        pickNo: pickList.pickNo,
        orderId: String(order._id),
        orderNo: order.orderNo
      }
    });

    const populatedPick = await PickList.findById(pickList._id).populate("orderId", "orderNo status");
    const populatedOrder = await Order.findById(order._id).populate("createdBy", "name email");

    return res.json({
      pickList: populatedPick.toJSON(),
      order: populatedOrder.toJSON()
    });
  } catch (error) {
    await rollbackFulfillmentMoves(applied);
    await PickList.findByIdAndUpdate(pickList._id, {
      $set: {
        status: pickListSnap.status,
        completedAt: pickListSnap.completedAt,
        items: pickListSnap.items
      }
    }).catch(() => {});
    console.error("[fulfillment] complete pick list", error);
    return res.status(500).json({ message: "Server error." });
  }
});

/** GET /api/fulfillment/summary */
router.get("/fulfillment/summary", async (_req, res) => {
  try {
    const [
      totalOrders,
      pendingOrders,
      readyToPickOrders,
      insufficientStockOrders,
      completedOrders,
      openPickLists,
      completedPickLists
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: "PENDING" }),
      Order.countDocuments({ status: "READY_TO_PICK" }),
      Order.countDocuments({ status: "INSUFFICIENT_STOCK" }),
      Order.countDocuments({ status: "COMPLETED" }),
      PickList.countDocuments({ status: { $in: ["OPEN", "PICKING"] } }),
      PickList.countDocuments({ status: "COMPLETED" })
    ]);

    return res.json({
      totalOrders,
      pendingOrders,
      readyToPickOrders,
      insufficientStockOrders,
      completedOrders,
      openPickLists,
      completedPickLists
    });
  } catch (error) {
    console.error("[fulfillment] summary", error);
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
