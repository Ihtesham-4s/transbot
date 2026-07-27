import { mongoose } from "../db.js";

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, trim: true, maxlength: 80, default: null },
    weightKg: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    minStockLevel: { type: Number, required: true, min: 0, default: 5 },
    maxStockLevel: { type: Number, required: true, min: 0, default: 100 },
    zone_id: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.virtual("stockStatus").get(function () {
  const quantity = Number(this.quantity || 0);
  const minStockLevel = Number(this.minStockLevel || 0);
  const maxStockLevel = Number(this.maxStockLevel || 0);

  if (quantity < minStockLevel) return "LOW";
  if (quantity > maxStockLevel) return "OVERSTOCK";
  return "NORMAL";
});

productSchema.virtual("zone_label").get(function () {
  return this.zone_id?.label || null;
});

productSchema.virtual("zone_code").get(function () {
  return this.zone_id?.code || null;
});

productSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    if (ret.zone_id) {
      const wasPopulated = doc?.populated?.("zone_id") === true;
      if (!wasPopulated) {
        ret.zone_id = ret.zone_id.id ? String(ret.zone_id.id) : String(ret.zone_id);
      }
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
