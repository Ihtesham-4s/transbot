import { mongoose } from "../db.js";

const PICK_LIST_STATUSES = Object.freeze(["OPEN", "PICKING", "COMPLETED", "CANCELLED"]);

const pickListItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    location: { type: String, trim: true, default: "" },
    picked: { type: Boolean, default: false }
  },
  { _id: false }
);

const pickListSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    pickNo: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
    status: { type: String, enum: PICK_LIST_STATUSES, default: "OPEN" },
    items: { type: [pickListItemSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

pickListSchema.index({ orderId: 1, status: 1 });
pickListSchema.index({ pickNo: 1 });
pickListSchema.index({ status: 1, createdAt: -1 });

pickListSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    if (ret.orderId) {
      if (typeof ret.orderId === "object" && ret.orderId !== null && ret.orderId._id) {
        ret.orderId = {
          id: String(ret.orderId._id),
          orderNo: ret.orderId.orderNo,
          status: ret.orderId.status,
          customerName: ret.orderId.customerName
        };
      } else {
        ret.orderId = String(ret.orderId);
      }
    }
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
    return ret;
  }
});

export const PickList = mongoose.models.PickList || mongoose.model("PickList", pickListSchema);
export const PICK_LIST_STATUS_VALUES = PICK_LIST_STATUSES;
