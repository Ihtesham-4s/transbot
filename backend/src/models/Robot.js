import { mongoose } from "../db.js";
import { ROBOT_STATE_VALUES } from "../constants/robotStates.js";

const robotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    currentState: {
      type: String,
      required: true,
      enum: ROBOT_STATE_VALUES,
      default: "IDLE"
    },
    autoMode: { type: Boolean, default: true },
    maxCapacityKg: { type: Number, default: 2, min: 0 },
    location_zone_id: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

robotSchema.index({ currentState: 1 });

robotSchema.virtual("location").get(function () {
  return this.location_zone_id?.code || null;
});

robotSchema.virtual("location_label").get(function () {
  return this.location_zone_id?.label || null;
});

robotSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    if (ret.location_zone_id) {
      ret.location_zone_id = ret.location_zone_id.id
        ? String(ret.location_zone_id.id)
        : String(ret.location_zone_id);
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

robotSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const Robot = mongoose.models.Robot || mongoose.model("Robot", robotSchema);
