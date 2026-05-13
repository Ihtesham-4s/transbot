import { mongoose } from "../db.js";

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 80
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, trim: true, maxlength: 100, default: "" },
    weight: { type: Number, min: 0, default: 0 },
    currentStock: { type: Number, min: 0, default: 0 },
    minStock: { type: Number, min: 0, default: 0 },
    maxStock: { type: Number, min: 0, default: 100 },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    supplierLeadTimeDays: { type: Number, min: 0, default: 0 }
  },
  { timestamps: true }
);

productSchema.index({ category: 1 });
productSchema.index({ location: 1 });
productSchema.index({ currentStock: 1, minStock: 1, maxStock: 1 });

productSchema.pre("validate", function (next) {
  if (this.maxStock < this.minStock) {
    this.invalidate("maxStock", "Maximum stock must be greater than or equal to minimum stock.");
  }
  next();
});

productSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
