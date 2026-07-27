import express from "express";
import { z } from "zod";

import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { Zone } from "../models/Zone.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);

const orderItemSchema = z.object({
  product_id: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1)
});

const createOrderSchema = z.object({
  deliverZone_id: z.string().trim().min(1),
  items: z.array(orderItemSchema).min(1)
});

const ORDER_POPULATE = [
  { path: "items.product_id" },
  { path: "deliverZone_id" },
  { path: "requestedBy", select: "name email role" },
  { path: "approvedBy", select: "name email role" }
];

function serializeOrder(order) {
  return order?.toJSON ? order.toJSON() : order;
}

function buildQuantityRequest(items) {
  const byProductId = new Map();

  for (const item of items) {
    const productId = String(item.product_id);
    const current = byProductId.get(productId) || 0;
    byProductId.set(productId, current + Number(item.quantity));
  }

  return byProductId;
}

async function checkStockAvailability(items) {
  const requestedByProductId = buildQuantityRequest(items);
  const productIds = [...requestedByProductId.keys()];
  const products = await Product.find({ _id: { $in: productIds } });
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const missingProductIds = productIds.filter((productId) => !productsById.has(productId));

  if (missingProductIds.length > 0) {
    return {
      ok: false,
      missingProductIds,
      shortItems: [],
      blockedReason: `Unknown product id(s): ${missingProductIds.join(", ")}`
    };
  }

  const shortItems = [];
  for (const [productId, requestedQuantity] of requestedByProductId.entries()) {
    const product = productsById.get(productId);
    const availableQuantity = Number(product.quantity || 0);

    if (availableQuantity < requestedQuantity) {
      shortItems.push({
        product_id: productId,
        sku: product.sku,
        requestedQuantity,
        availableQuantity,
        shortage: requestedQuantity - availableQuantity
      });
    }
  }

  const blockedReason = shortItems.length
    ? shortItems
        .map((item) => `${item.sku}: requested ${item.requestedQuantity}, available ${item.availableQuantity}`)
        .join("; ")
    : null;

  return {
    ok: shortItems.length === 0,
    missingProductIds: [],
    shortItems,
    blockedReason
  };
}

router.post("/", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  try {
    const deliverZone = await Zone.findById(parsed.data.deliverZone_id);
    if (!deliverZone) {
      return res.status(400).json({ message: "Unknown delivery zone." });
    }

    const stockCheck = await checkStockAvailability(parsed.data.items);
    if (stockCheck.missingProductIds.length > 0) {
      return res.status(400).json({
        message: "Unknown product id.",
        missingProductIds: stockCheck.missingProductIds
      });
    }

    const status = stockCheck.ok ? "PENDING" : "BLOCKED";
    const created = await Order.create({
      items: parsed.data.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity
      })),
      status,
      blockedReason: stockCheck.blockedReason,
      deliverZone_id: deliverZone._id,
      requestedBy: req.user.id,
      approvedBy: null
    });

    await created.populate(ORDER_POPULATE);
    await logEvent({
      eventType: status === "BLOCKED" ? "ORDER_BLOCKED" : "ORDER_CREATED",
      module: "ORDER",
      severity: status === "BLOCKED" ? "WARNING" : "SUCCESS",
      message: `${status === "BLOCKED" ? "Order blocked" : "Order created"}: ${created.orderNumber}`,
      actorId: req.user?.id || null,
      metadata: {
        orderId: String(created._id),
        orderNumber: created.orderNumber,
        status,
        blockedReason: created.blockedReason,
        shortItems: stockCheck.shortItems
      }
    });

    return res.status(201).json({ order: serializeOrder(created) });
  } catch (error) {
    console.error("[Orders] Failed to create order:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Order number conflict. Please try again." });
    }
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/", async (req, res) => {
  try {
    const statusFilter = String(req.query.status || "").trim().toUpperCase();
    const query = {};

    if (statusFilter) {
      if (!["PENDING", "APPROVED", "REJECTED", "BLOCKED"].includes(statusFilter)) {
        return res.status(400).json({ message: "Invalid status filter." });
      }
      query.status = statusFilter;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).populate(ORDER_POPULATE);
    return res.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    console.error("[Orders] Failed to load orders:", error);
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(ORDER_POPULATE);
    if (!order) return res.status(404).json({ message: "Order not found." });
    return res.json({ order: serializeOrder(order) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.patch("/:id/approve", requireRole(["manager"]), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (!["PENDING", "BLOCKED"].includes(order.status)) {
      return res.status(400).json({ message: "Only pending or blocked orders can be approved." });
    }

    const stockCheck = await checkStockAvailability(order.items);
    if (!stockCheck.ok) {
      return res.status(400).json({
        message: "Insufficient stock to approve order.",
        code: "INSUFFICIENT_STOCK",
        details: stockCheck.shortItems,
        blockedReason: stockCheck.blockedReason
      });
    }

    order.status = "APPROVED";
    order.blockedReason = null;
    order.approvedBy = req.user.id;
    await order.save();
    await order.populate(ORDER_POPULATE);

    await logEvent({
      eventType: "ORDER_APPROVED",
      module: "ORDER",
      severity: "SUCCESS",
      message: `Order approved: ${order.orderNumber}`,
      actorId: req.user?.id || null,
      metadata: {
        orderId: String(order._id),
        orderNumber: order.orderNumber
      }
    });

    return res.json({ order: serializeOrder(order) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.patch("/:id/reject", requireRole(["manager"]), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (!["PENDING", "BLOCKED"].includes(order.status)) {
      return res.status(400).json({ message: "Only pending or blocked orders can be rejected." });
    }

    order.status = "REJECTED";
    order.approvedBy = null;
    await order.save();
    await order.populate(ORDER_POPULATE);

    await logEvent({
      eventType: "ORDER_REJECTED",
      module: "ORDER",
      severity: "WARNING",
      message: `Order rejected: ${order.orderNumber}`,
      actorId: req.user?.id || null,
      metadata: {
        orderId: String(order._id),
        orderNumber: order.orderNumber
      }
    });

    return res.json({ order: serializeOrder(order) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
