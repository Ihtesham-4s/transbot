import express from "express";
import { z } from "zod";

import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";
import { Order } from "../models/Order.js";
import { PickList } from "../models/PickList.js";
import { Product } from "../models/Product.js";
import { Task } from "../models/Task.js";
import { logEvent } from "../utils/logger.js";
import { autoAssignTask } from "../services/autoAssignService.js";
import { getDispatchAssignment, logDispatchAssignment } from "./tasks.js";

const router = express.Router();

router.use(authMiddleware);

const statusQuerySchema = z.object({
  status: z.enum(["PENDING", "COMPLETED"]).optional()
});

const PICKLIST_POPULATE = [
  { path: "order_id" },
  { path: "items.product_id" },
  { path: "items.pickedZone_id" },
  { path: "completedBy", select: "name email role" },
  { path: "dispatchTask_id" }
];

const TASK_ZONE_POPULATE = "pickup_zone_id drop_zone_id";

function serializePickList(pickList) {
  return pickList?.toJSON ? pickList.toJSON() : pickList;
}

router.post("/from-order/:orderId", requireRole(["manager", "operator"]), async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.status !== "APPROVED") {
      return res.status(400).json({ message: "Only approved orders can generate pick lists." });
    }

    const existing = await PickList.findOne({ order_id: order._id });
    if (existing) return res.status(409).json({ message: "Pick list already exists for this order." });

    const productIds = order.items.map((item) => item.product_id);
    const products = await Product.find({ _id: { $in: productIds } });
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const missingProductIds = productIds.map(String).filter((productId) => !productsById.has(productId));
    if (missingProductIds.length > 0) {
      return res.status(400).json({ message: "Unknown product id.", missingProductIds });
    }

    const created = await PickList.create({
      order_id: order._id,
      items: order.items.map((item) => {
        const product = productsById.get(String(item.product_id));
        return {
          product_id: item.product_id,
          quantity: item.quantity,
          pickedZone_id: product.zone_id
        };
      })
    });

    await created.populate(PICKLIST_POPULATE);
    await logEvent({
      eventType: "PICKLIST_CREATED",
      module: "PICKLIST",
      severity: "SUCCESS",
      message: `Pick list created for order ${order.orderNumber}`,
      actorId: req.user?.id || null,
      metadata: {
        pickListId: String(created._id),
        orderId: String(order._id),
        orderNumber: order.orderNumber
      }
    });

    return res.status(201).json({ picklist: serializePickList(created) });
  } catch (err) {
    console.error("[picklists] from-order error:", err);
    return res.status(500).json({ message: err?.message || "Server error generating pick list." });
  }
});

router.get("/", async (req, res) => {
  const parsed = statusQuerySchema.safeParse({
    status: req.query.status ? String(req.query.status).toUpperCase() : undefined
  });
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid status filter." });
  }

  try {
    const query = parsed.data.status ? { status: parsed.data.status } : {};
    const picklists = await PickList.find(query).sort({ createdAt: -1 }).populate(PICKLIST_POPULATE);
    return res.json({ picklists: picklists.map(serializePickList) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.patch("/:id/complete", async (req, res) => {
  try {
    const picklist = await PickList.findById(req.params.id).populate("order_id");
    if (!picklist) return res.status(404).json({ message: "Pick list not found." });
    if (picklist.status === "COMPLETED") {
      await picklist.populate(PICKLIST_POPULATE);
      return res.json({ picklist: serializePickList(picklist), task: null });
    }

    const order = picklist.order_id;
    if (!order?.deliverZone_id) {
      return res.status(400).json({ message: "Order delivery zone is missing." });
    }

    const requestedByProductId = new Map();
    for (const item of picklist.items) {
      const productId = String(item.product_id);
      requestedByProductId.set(productId, (requestedByProductId.get(productId) || 0) + Number(item.quantity));
    }

    const products = await Product.find({ _id: { $in: [...requestedByProductId.keys()] } });
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const shortItems = [];
    let totalWeightKg = 0;

    for (const [productId, requestedQuantity] of requestedByProductId.entries()) {
      const product = productsById.get(productId);
      if (!product) {
        shortItems.push({ product_id: productId, requestedQuantity, availableQuantity: 0 });
        continue;
      }

      const availableQuantity = Number(product.quantity || 0);
      if (availableQuantity - requestedQuantity < 0) {
        shortItems.push({
          product_id: productId,
          sku: product.sku,
          requestedQuantity,
          availableQuantity
        });
      }
      totalWeightKg += Number(product.weightKg || 0) * requestedQuantity;
    }

    if (shortItems.length > 0) {
      return res.status(400).json({
        message: "Insufficient stock to complete pick list.",
        code: "INSUFFICIENT_STOCK",
        details: shortItems
      });
    }

    for (const [productId, requestedQuantity] of requestedByProductId.entries()) {
      const product = productsById.get(productId);
      product.quantity = Number(product.quantity || 0) - requestedQuantity;
      await product.save();
    }

    const pickupZoneId = picklist.items[0]?.pickedZone_id;
    const dispatchAssignment = await getDispatchAssignment(totalWeightKg);
    const createdTask = await Task.create({
      pickup_zone_id: pickupZoneId,
      drop_zone_id: order.deliverZone_id,
      order_id: order._id,
      weight: totalWeightKg,
      totalWeightKg,
      assignedType: dispatchAssignment.assignedType,
      assignedWorkerName: dispatchAssignment.assignedWorkerName,
      priority: "MEDIUM",
      status: "PENDING",
      assigned_robot_id: null
    });

    picklist.status = "COMPLETED";
    picklist.completedBy = req.user.id;
    picklist.dispatchTask_id = createdTask._id;
    await picklist.save();

    await Promise.all([createdTask.populate(TASK_ZONE_POPULATE), picklist.populate(PICKLIST_POPULATE)]);
    await logEvent({
      eventType: "PICKLIST_COMPLETED",
      module: "PICKLIST",
      severity: "SUCCESS",
      message: `Pick list completed for order ${order.orderNumber}`,
      actorId: req.user?.id || null,
      metadata: {
        pickListId: String(picklist._id),
        orderId: String(order._id),
        taskId: String(createdTask._id),
        totalWeightKg
      }
    });
    await logDispatchAssignment({
      taskId: createdTask._id,
      totalWeightKg,
      assignment: dispatchAssignment,
      userId: req.user?.id
    });
    await autoAssignTask({ trigger: "PICKLIST_COMPLETED", userId: req.user?.id });

    return res.json({ picklist: serializePickList(picklist), task: createdTask.toJSON() });
  } catch (err) {
    console.error("[picklists] complete error:", err);
    return res.status(500).json({ message: err?.message || "Server error completing pick list." });
  }
});

export default router;
