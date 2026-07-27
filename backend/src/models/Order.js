import { mongoose } from "../db.js";

const orderItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, trim: true },
    items: { type: [orderItemSchema], required: true, validate: [(items) => items.length > 0, "At least one item is required."] },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "BLOCKED"],
      default: "PENDING"
    },
    blockedReason: { type: String, trim: true, default: null },
    deliverZone_id: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

orderSchema.index(
  { orderNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { orderNumber: { $type: "string" } }
  }
);

orderSchema.pre("validate", async function (next) {
  if (!this.isNew || this.orderNumber) return next();

  try {
    const counter = (await this.constructor.countDocuments({})) + 1;
    this.orderNumber = `ORD-${Date.now()}-${String(counter).padStart(4, "0")}`;
    return next();
  } catch (error) {
    return next(error);
  }
});

function preserveOrFlattenReference(doc, ret, fieldName) {
  if (!ret[fieldName]) return;
  if (!doc?.populated?.(fieldName)) {
    ret[fieldName] = ret[fieldName].id ? String(ret[fieldName].id) : String(ret[fieldName]);
  }
}

orderSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = String(ret._id);

    const productsPopulated = Boolean(doc?.populated?.("items.product_id"));
    ret.items = (ret.items || []).map((item) => {
      const nextItem = { ...item };
      if (nextItem.product_id && !productsPopulated) {
        nextItem.product_id = nextItem.product_id.id ? String(nextItem.product_id.id) : String(nextItem.product_id);
      }
      return nextItem;
    });

    preserveOrFlattenReference(doc, ret, "requestedBy");
    preserveOrFlattenReference(doc, ret, "approvedBy");
    preserveOrFlattenReference(doc, ret, "deliverZone_id");

    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export async function ensureOrderCollectionIndexes() {
  const indexes = await Order.collection.indexes();
  const legacyOrderNoIndex = indexes.find((index) => index.name === "orderNo_1" && index.unique);
  const incompatibleOrderNumberIndex = indexes.find(
    (index) => index.name === "orderNumber_1" && index.unique && !index.partialFilterExpression
  );

  if (legacyOrderNoIndex) {
    await Order.collection.dropIndex(legacyOrderNoIndex.name);
    console.log(`[Order] Dropped legacy unique index: ${legacyOrderNoIndex.name}`);
  }

  if (incompatibleOrderNumberIndex) {
    await Order.collection.dropIndex(incompatibleOrderNumberIndex.name);
    console.log(`[Order] Dropped incompatible unique index: ${incompatibleOrderNumberIndex.name}`);
  }

  await Order.init();
}
