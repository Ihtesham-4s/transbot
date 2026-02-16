import { mongoose } from "../db.js";

const logSchema = new mongoose.Schema(
  {
    event_type: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    severity: { type: String, enum: ["INFO", "WARN", "ERROR"], default: "INFO" },
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    robot_id: { type: mongoose.Schema.Types.ObjectId, ref: "Robot", default: null },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

logSchema.index({ event_type: 1, timestamp: -1 });
logSchema.index({ timestamp: -1 });
logSchema.index({ task_id: 1, timestamp: -1 });
logSchema.index({ robot_id: 1, timestamp: -1 });
logSchema.index({ user_id: 1, timestamp: -1 });

logSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    if (ret.task_id) ret.task_id = String(ret.task_id);
    if (ret.robot_id) ret.robot_id = String(ret.robot_id);
    if (ret.user_id) ret.user_id = String(ret.user_id);
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Log = mongoose.models.Log || mongoose.model("Log", logSchema);
