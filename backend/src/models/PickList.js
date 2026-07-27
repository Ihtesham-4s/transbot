import { mongoose } from "../db.js";

const pickListItemSchema = new mongoose.Schema(
  {
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    pickedZone_id: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true }
  },
  { _id: false }
);

const pickListSchema = new mongoose.Schema(
  {
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    items: {
      type: [pickListItemSchema],
      required: true,
      validate: [(items) => items.length > 0, "At least one item is required."]
    },
    status: { type: String, enum: ["PENDING", "COMPLETED"], default: "PENDING" },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    dispatchTask_id: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null }
  },
  { timestamps: true }
);

pickListSchema.index({ order_id: 1 }, { unique: true });
pickListSchema.index({ status: 1, createdAt: -1 });

function preserveOrFlattenReference(doc, ret, fieldName) {
  if (!ret[fieldName]) return;
  if (!doc?.populated?.(fieldName)) {
    ret[fieldName] = ret[fieldName].id ? String(ret[fieldName].id) : String(ret[fieldName]);
  }
}

pickListSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = String(ret._id);

    const productsPopulated = Boolean(doc?.populated?.("items.product_id"));
    const zonesPopulated = Boolean(doc?.populated?.("items.pickedZone_id"));
    ret.items = (ret.items || []).map((item) => {
      const nextItem = { ...item };
      if (nextItem.product_id && !productsPopulated) {
        nextItem.product_id = nextItem.product_id.id ? String(nextItem.product_id.id) : String(nextItem.product_id);
      }
      if (nextItem.pickedZone_id && !zonesPopulated) {
        nextItem.pickedZone_id = nextItem.pickedZone_id.id
          ? String(nextItem.pickedZone_id.id)
          : String(nextItem.pickedZone_id);
      }
      return nextItem;
    });

    preserveOrFlattenReference(doc, ret, "order_id");
    preserveOrFlattenReference(doc, ret, "completedBy");
    preserveOrFlattenReference(doc, ret, "dispatchTask_id");

    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const PickList = mongoose.models.PickList || mongoose.model("PickList", pickListSchema);
