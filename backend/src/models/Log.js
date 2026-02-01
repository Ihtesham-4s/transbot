import { mongoose } from "../db.js";

const logSchema = new mongoose.Schema(
  {
    event_type: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

logSchema.index({ event_type: 1, timestamp: -1 });

logSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Log = mongoose.models.Log || mongoose.model("Log", logSchema);
