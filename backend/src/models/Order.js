import { mongoose } from "../db.js";

const ORDER_PRIORITIES = Object.freeze(["LOW", "NORMAL", "HIGH", "URGENT"]);
const ORDER_STATUSES = Object.freeze([
  "PENDING",
  "READY_TO_PICK",
  "INSUFFICIENT_STOCK",
  "PICKING",
  "PICKED",
  "COMPLETED",
  "CANCELLED"
]);

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    location: { type: String, trim: true, default: "" },
    availableStockAtCreation: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const insufficientItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    requestedQty: { type: Number, required: true, min: 1 },
    availableQty: { type: Number, required: true, min: 0 },
    shortageQty: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
    customerName: { type: String, required: true, trim: true, maxlength: 200 },
    priority: { type: String, enum: ORDER_PRIORITIES, default: "NORMAL" },
    status: { type: String, enum: ORDER_STATUSES, default: "PENDING" },
    items: { type: [orderItemSchema], default: [] },
    totalItems: { type: Number, default: 0, min: 0 },
    insufficientItems: { type: [insufficientItemSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    dueDate: { type: Date, default: null },
    pickedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ orderNo: 1 });
orderSchema.index({ customerName: 1 });

orderSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    if (ret.createdBy) {
      if (typeof ret.createdBy === "object" && ret.createdBy !== null && ret.createdBy._id) {
        ret.createdBy = {
          id: String(ret.createdBy._id),
          name: ret.createdBy.name,
          email: ret.createdBy.email
        };
      } else {
        ret.createdBy = String(ret.createdBy);
      }
    }
    for (const item of ret.items || []) {
      if (item.productId) item.productId = String(item.productId);
    }
    for (const row of ret.insufficientItems || []) {
      if (row.productId) row.productId = String(row.productId);
    }
    return ret;
  }
});

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
export const ORDER_PRIORITY_VALUES = ORDER_PRIORITIES;
export const ORDER_STATUS_VALUES = ORDER_STATUSES;
