import express from "express";
import { z } from "zod";

import { mongoose } from "../db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { serializeProductWithIntelligence } from "../utils/inventoryIntelligence.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();

router.use(authMiddleware);

const objectIdSchema = z
  .string()
  .trim()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), "Invalid id.");

const productShape = z.object({
  sku: z.string().trim().min(1, "SKU is required.").max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, "Product name is required.").max(160),
  category: z.string().trim().max(100).optional().default(""),
  weight: z.coerce.number().nonnegative("Weight cannot be negative.").optional().default(0),
  currentStock: z.coerce.number().nonnegative("Current stock cannot be negative.").optional().default(0),
  minStock: z.coerce.number().nonnegative("Minimum stock cannot be negative.").optional().default(0),
  maxStock: z.coerce.number().nonnegative("Maximum stock cannot be negative.").optional().default(100),
  location: z.string().trim().max(120).optional().default(""),
  supplierLeadTimeDays: z.coerce
    .number()
    .int("Supplier lead time must be a whole number.")
    .nonnegative("Supplier lead time cannot be negative.")
    .optional()
    .default(0)
});

const productCreateSchema = productShape
  .refine((data) => data.maxStock >= data.minStock, {
    path: ["maxStock"],
    message: "Maximum stock must be greater than or equal to minimum stock."
  });

const productUpdateSchema = productShape.partial();

const movementBaseSchema = z.object({
  productId: objectIdSchema,
  quantity: z.coerce.number().positive("Quantity must be greater than 0."),
  fromLocation: z.string().trim().max(120).optional().default(""),
  toLocation: z.string().trim().max(120).optional().default(""),
  reason: z.string().trim().max(300).optional().default("")
});

const stockInSchema = movementBaseSchema;
const stockOutSchema = movementBaseSchema;
const stockTransferSchema = movementBaseSchema.refine((data) => Boolean(data.toLocation), {
  path: ["toLocation"],
  message: "Transfer destination is required."
});

function formatValidationError(error) {
  return error.flatten ? error.flatten() : { formErrors: error.issues || [] };
}

function getUserId(req) {
  return req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) ? req.user.id : null;
}

function isDuplicateSkuError(error) {
  return error?.code === 11000 && (error?.keyPattern?.sku || error?.keyValue?.sku);
}

function handleRouteError(error, res) {
  if (isDuplicateSkuError(error)) {
    return res.status(409).json({ message: "A product with this SKU already exists." });
  }
  if (error?.name === "ValidationError") {
    return res.status(400).json({ message: error.message || "Validation failed." });
  }
  if (error?.name === "CastError") {
    return res.status(400).json({ message: "Invalid id." });
  }
  return res.status(500).json({ message: "Server error." });
}

async function findProductOr404(productId, res) {
  const product = await Product.findById(productId);
  if (!product) {
    res.status(404).json({ message: "Product not found." });
    return null;
  }
  return product;
}

function toMovementResponse(movement) {
  const product =
    movement.productId && typeof movement.productId === "object"
      ? {
          id: String(movement.productId._id),
          sku: movement.productId.sku,
          name: movement.productId.name,
          category: movement.productId.category,
          location: movement.productId.location
        }
      : null;

  const createdBy =
    movement.createdBy && typeof movement.createdBy === "object"
      ? {
          id: String(movement.createdBy._id),
          name: movement.createdBy.name,
          email: movement.createdBy.email
        }
      : null;

  return {
    id: String(movement._id),
    productId: product?.id || (movement.productId ? String(movement.productId) : null),
    product,
    type: movement.type,
    quantity: movement.quantity,
    fromLocation: movement.fromLocation || "",
    toLocation: movement.toLocation || "",
    reason: movement.reason || "",
    createdBy,
    createdAt: movement.createdAt
  };
}

async function createMovementLog(eventType, description, req, product, movement, metadata = {}) {
  await logEvent(eventType, description, {
    user_id: getUserId(req),
    metadata: {
      productId: String(product._id),
      sku: product.sku,
      movementId: movement ? String(movement._id) : null,
      ...metadata
    }
  });
}

/** POST /api/products - create a product */
router.post("/products", async (req, res) => {
  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: formatValidationError(parsed.error) });
  }

  try {
    const product = await Product.create(parsed.data);
    await logEvent("PRODUCT_CREATED", `Product created (sku=${product.sku}).`, {
      user_id: getUserId(req),
      metadata: { productId: String(product._id), sku: product.sku }
    });

    return res.status(201).json({ product: serializeProductWithIntelligence(product) });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** GET /api/products - list products with inventory intelligence */
router.get("/products", async (_req, res) => {
  try {
    const products = await Product.find({}).sort({ sku: 1 });
    return res.json({ products: products.map((product) => serializeProductWithIntelligence(product)) });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** GET /api/products/:id - get a single product */
router.get("/products/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid id." });
  }

  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found." });
    return res.json({ product: serializeProductWithIntelligence(product) });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** PUT /api/products/:id - update a product */
router.put("/products/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid id." });
  }

  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: formatValidationError(parsed.error) });
  }

  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found." });

    const nextMinStock = parsed.data.minStock ?? product.minStock;
    const nextMaxStock = parsed.data.maxStock ?? product.maxStock;
    if (nextMaxStock < nextMinStock) {
      return res.status(400).json({
        message: "Invalid input.",
        errors: { fieldErrors: { maxStock: ["Maximum stock must be greater than or equal to minimum stock."] } }
      });
    }

    Object.assign(product, parsed.data);
    await product.save();
    return res.json({ product: serializeProductWithIntelligence(product) });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** DELETE /api/products/:id - delete a product */
router.delete("/products/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid id." });
  }

  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found." });

    await logEvent("PRODUCT_DELETED", `Product deleted (sku=${product.sku}).`, {
      user_id: getUserId(req),
      severity: "WARN",
      metadata: { productId: String(product._id), sku: product.sku }
    });

    return res.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** POST /api/stock/in - increase stock and record movement */
router.post("/stock/in", async (req, res) => {
  const parsed = stockInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: formatValidationError(parsed.error) });
  }

  try {
    const product = await findProductOr404(parsed.data.productId, res);
    if (!product) return null;

    product.currentStock = Number(product.currentStock || 0) + parsed.data.quantity;
    if (parsed.data.toLocation) product.location = parsed.data.toLocation;
    await product.save();

    const movement = await StockMovement.create({
      productId: product._id,
      type: "IN",
      quantity: parsed.data.quantity,
      toLocation: parsed.data.toLocation,
      reason: parsed.data.reason,
      createdBy: getUserId(req)
    });

    await createMovementLog("STOCK_IN", `Stock received for ${product.sku} (+${parsed.data.quantity}).`, req, product, movement, {
      quantity: parsed.data.quantity,
      toLocation: parsed.data.toLocation,
      reason: parsed.data.reason
    });

    return res.status(201).json({
      product: serializeProductWithIntelligence(product),
      movement: movement.toJSON()
    });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** POST /api/stock/out - decrease stock and record movement */
router.post("/stock/out", async (req, res) => {
  const parsed = stockOutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: formatValidationError(parsed.error) });
  }

  try {
    const product = await findProductOr404(parsed.data.productId, res);
    if (!product) return null;

    if (parsed.data.quantity > Number(product.currentStock || 0)) {
      return res.status(400).json({ message: "Not enough stock available for this product." });
    }

    product.currentStock = Number(product.currentStock || 0) - parsed.data.quantity;
    await product.save();

    const movement = await StockMovement.create({
      productId: product._id,
      type: "OUT",
      quantity: parsed.data.quantity,
      fromLocation: parsed.data.fromLocation || product.location || "",
      reason: parsed.data.reason,
      createdBy: getUserId(req)
    });

    await createMovementLog("STOCK_OUT", `Stock issued for ${product.sku} (-${parsed.data.quantity}).`, req, product, movement, {
      quantity: parsed.data.quantity,
      fromLocation: movement.fromLocation,
      reason: parsed.data.reason
    });

    return res.status(201).json({
      product: serializeProductWithIntelligence(product),
      movement: movement.toJSON()
    });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** POST /api/stock/transfer - move product location and record movement */
router.post("/stock/transfer", async (req, res) => {
  const parsed = stockTransferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input.", errors: formatValidationError(parsed.error) });
  }

  try {
    const product = await findProductOr404(parsed.data.productId, res);
    if (!product) return null;

    if (parsed.data.quantity > Number(product.currentStock || 0)) {
      return res.status(400).json({ message: "Not enough stock available to transfer this quantity." });
    }

    const fromLocation = parsed.data.fromLocation || product.location || "";
    product.location = parsed.data.toLocation;
    await product.save();

    const movement = await StockMovement.create({
      productId: product._id,
      type: "TRANSFER",
      quantity: parsed.data.quantity,
      fromLocation,
      toLocation: parsed.data.toLocation,
      reason: parsed.data.reason,
      createdBy: getUserId(req)
    });

    await createMovementLog(
      "STOCK_TRANSFER",
      `Stock transferred for ${product.sku} (${fromLocation || "Unknown"} to ${parsed.data.toLocation}).`,
      req,
      product,
      movement,
      {
        quantity: parsed.data.quantity,
        fromLocation,
        toLocation: parsed.data.toLocation,
        reason: parsed.data.reason
      }
    );

    return res.status(201).json({
      product: serializeProductWithIntelligence(product),
      movement: movement.toJSON()
    });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** GET /api/stock/movements - stock movement history */
router.get("/stock/movements", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);
    const movements = await StockMovement.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("productId", "sku name category location")
      .populate("createdBy", "name email")
      .lean();

    return res.json({ movements: movements.map(toMovementResponse) });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** GET /api/inventory/summary - inventory risk summary */
router.get("/inventory/summary", async (_req, res) => {
  try {
    const products = await Product.find({}).lean();
    const summary = products.reduce(
      (acc, product) => {
        const enriched = serializeProductWithIntelligence(product);
        acc.totalStockUnits += Number(product.currentStock || 0);
        if (enriched.stockStatus === "LOW_STOCK") acc.lowStockCount += 1;
        if (enriched.stockStatus === "OVERSTOCK") acc.overstockCount += 1;
        if (enriched.stockStatus === "NORMAL") acc.normalCount += 1;
        if (enriched.suggestedReorderQty > 0) acc.reorderRequiredCount += 1;
        return acc;
      },
      {
        totalSKUs: products.length,
        totalStockUnits: 0,
        lowStockCount: 0,
        overstockCount: 0,
        normalCount: 0,
        reorderRequiredCount: 0
      }
    );

    return res.json(summary);
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** GET /api/inventory/low-stock - products at or below minimum stock */
router.get("/inventory/low-stock", async (_req, res) => {
  try {
    const products = await Product.find({}).sort({ sku: 1 });
    return res.json({
      products: products
        .map((product) => serializeProductWithIntelligence(product))
        .filter((product) => Number(product.currentStock || 0) <= Number(product.minStock || 0))
    });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** GET /api/inventory/overstock - products at or above maximum stock */
router.get("/inventory/overstock", async (_req, res) => {
  try {
    const products = await Product.find({}).sort({ sku: 1 });
    return res.json({
      products: products
        .map((product) => serializeProductWithIntelligence(product))
        .filter((product) => Number(product.currentStock || 0) >= Number(product.maxStock || 0))
    });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

/** GET /api/inventory/reorder-suggestions - products requiring reorder */
router.get("/inventory/reorder-suggestions", async (_req, res) => {
  try {
    const products = await Product.find({}).sort({ sku: 1 });
    return res.json({
      products: products
        .map((product) => serializeProductWithIntelligence(product))
        .filter((product) => Number(product.suggestedReorderQty || 0) > 0)
    });
  } catch (error) {
    return handleRouteError(error, res);
  }
});

export default router;
