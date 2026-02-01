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
    batteryLevel: { type: Number, default: 100, min: 0, max: 100 },
    maxPayload: { type: Number, default: 5, min: 0 },
    location: { type: String, default: "ZONE_CHARGE", trim: true, maxlength: 50 },
    chargingUntil: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

robotSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// Keep updatedAt in sync on state change (we also set it in code)
robotSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const Robot = mongoose.models.Robot || mongoose.model("Robot", robotSchema);
