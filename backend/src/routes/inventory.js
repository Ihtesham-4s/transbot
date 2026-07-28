import express from "express";
import { z } from "zod";

import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";
import { Product } from "../models/Product.js";
import { Zone } from "../models/Zone.js";
import { mongoose } from "../db.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);

const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).optional().nullable(),
  weightKg: z.coerce.number().min(0),
  quantity: z.coerce.number().min(0).default(0),
  minStockLevel: z.coerce.number().min(0).default(5),
  maxStockLevel: z.coerce.number().min(0).default(100),
  zone_id: z.string().trim().min(1)
});

const updateProductSchema = z.object({
  sku: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  weightKg: z.coerce.number().min(0).optional(),
  quantity: z.coerce.number().min(0).optional(),
  minStockLevel: z.coerce.number().min(0).optional(),
  maxStockLevel: z.coerce.number().min(0).optional(),
  zone_id: z.string().trim().min(1).optional()
});

function serializeProduct(product) {
  if (!product) return null;
  const data = product.toJSON ? product.toJSON() : product;
  return {
    ...data,
    stockStatus: product.stockStatus || data.stockStatus || null
  };
}

router.get("/", async (req, res) => {
  try {
    const statusFilter = String(req.query.status || "").trim().toUpperCase();
    const query = {};

    if (statusFilter) {
      query.$expr = {
        $eq: [
          {
            $cond: [
              { $lt: ["$quantity", "$minStockLevel"] },
              "LOW",
              {
                $cond: [{ $gt: ["$quantity", "$maxStockLevel"] }, "OVERSTOCK", "NORMAL"]
              }
            ]
          },
          statusFilter
        ]
      };
    }

    const products = await Product.find(query).sort({ createdAt: -1 }).populate("zone_id");
    return res.json({ products: products.map(serializeProduct) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/alerts/reorder", async (_req, res) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 }).populate("zone_id");
    const lowStock = products.filter((product) => product.stockStatus === "LOW");
    return res.json({ products: lowStock.map(serializeProduct) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("zone_id");
    if (!product) return res.status(404).json({ message: "Product not found." });
    return res.json({ product: serializeProduct(product) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.post("/", requireRole(["manager", "operator"]), async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  try {
    const skuUpper = parsed.data.sku.toUpperCase();
    const duplicateSku = await Product.findOne({ sku: skuUpper });
    if (duplicateSku) {
      return res.status(400).json({ message: `Product with SKU "${skuUpper}" already exists.` });
    }

    let zone = null;
    if (mongoose.Types.ObjectId.isValid(parsed.data.zone_id)) {
      zone = await Zone.findById(parsed.data.zone_id);
    }
    if (!zone) {
      zone = await Zone.findOne({ code: String(parsed.data.zone_id).toUpperCase() });
    }
    if (!zone) {
      return res.status(400).json({ message: "Unknown zone specified." });
    }

    const created = await Product.create({
      sku: skuUpper,
      name: parsed.data.name,
      category: parsed.data.category ?? null,
      weightKg: parsed.data.weightKg,
      quantity: parsed.data.quantity,
      minStockLevel: parsed.data.minStockLevel,
      maxStockLevel: parsed.data.maxStockLevel,
      zone_id: zone._id
    });

    await created.populate("zone_id");
    await logEvent({
      eventType: "PRODUCT_CREATED",
      module: "INVENTORY",
      severity: "SUCCESS",
      message: `Product created: ${created.sku}`,
      actorId: req.user?.id || null,
      metadata: {
        productId: String(created._id),
        sku: created.sku,
        zoneId: String(zone._id)
      }
    });

    return res.status(201).json({ product: serializeProduct(created) });
  } catch (err) {
    console.error("[inventory] create product error:", err);
    return res.status(500).json({ message: err?.message || "Server error creating product." });
  }
});

router.patch("/:id", requireRole(["manager"]), async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: parsed.error.flatten() });
  }

  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Product not found." });

    const changes = {};
    const updatePayload = {};

    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (key === "sku" && value !== undefined) {
        updatePayload.sku = String(value).toUpperCase();
      } else if (key === "zone_id") {
        const zone = await Zone.findById(value);
        if (!zone) return res.status(400).json({ message: "Unknown zone id." });
        updatePayload.zone_id = zone._id;
      } else {
        updatePayload[key] = value;
      }

      if (existing[key] !== updatePayload[key]) {
        changes[key] = { from: existing[key], to: updatePayload[key] };
      }
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, { $set: updatePayload }, { new: true });
    if (!updated) return res.status(404).json({ message: "Product not found." });

    await updated.populate("zone_id");
    await logEvent({
      eventType: "PRODUCT_UPDATED",
      module: "INVENTORY",
      severity: "INFO",
      message: `Product updated: ${updated.sku}`,
      actorId: req.user?.id || null,
      metadata: {
        productId: String(updated._id),
        changes
      }
    });

    return res.json({ product: serializeProduct(updated) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.delete("/:id", requireRole(["manager"]), async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Product not found." });

    await logEvent({
      eventType: "PRODUCT_DELETED",
      module: "INVENTORY",
      severity: "WARNING",
      message: `Product deleted: ${deleted.sku}`,
      actorId: req.user?.id || null,
      metadata: {
        productId: String(deleted._id),
        sku: deleted.sku
      }
    });

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
