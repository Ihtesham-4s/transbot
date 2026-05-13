import { mongoose } from "../db.js";

const STOCK_MOVEMENT_TYPES = Object.freeze(["IN", "OUT", "TRANSFER", "ADJUSTMENT"]);

const stockMovementSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    type: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true, min: 0 },
    fromLocation: { type: String, trim: true, maxlength: 120, default: "" },
    toLocation: { type: String, trim: true, maxlength: 120, default: "" },
    reason: { type: String, trim: true, maxlength: 300, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });

stockMovementSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    if (ret.productId) {
      ret.productId = ret.productId.id ? String(ret.productId.id) : String(ret.productId);
    }
    if (ret.createdBy) {
      ret.createdBy = ret.createdBy.id ? String(ret.createdBy.id) : String(ret.createdBy);
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const StockMovement =
  mongoose.models.StockMovement || mongoose.model("StockMovement", stockMovementSchema);
export const STOCK_MOVEMENT_TYPE_VALUES = STOCK_MOVEMENT_TYPES;
