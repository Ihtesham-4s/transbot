import { mongoose } from "../db.js";

export const ZONE_TYPE_VALUES = Object.freeze(["PICKUP", "DROPOFF", "CHARGING"]);

const zoneSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 50, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 255, default: null },
    label: { type: String, required: true, trim: true, maxlength: 120, default: "" },
    type: { type: String, enum: ZONE_TYPE_VALUES, required: true, index: true, default: "PICKUP" },
    isHome: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

zoneSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Zone = mongoose.models.Zone || mongoose.model("Zone", zoneSchema);
