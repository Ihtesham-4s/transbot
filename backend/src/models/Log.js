import { mongoose } from "../db.js";

const LOG_MODULES = Object.freeze([
  "ROBOT",
  "AUTH",
  "TASK",
  "SYSTEM",
  "INVENTORY",
  "ORDER",
  "PICKLIST",
  "DISPATCH",
  "COPILOT"
]);

const LOG_SEVERITIES = Object.freeze(["INFO", "WARNING", "WARN", "ERROR", "SUCCESS"]);

const logSchema = new mongoose.Schema(
  {
    eventType: { type: String, trim: true, maxlength: 120, default: null },
    event_type: { type: String, trim: true, maxlength: 120, default: null },
    module: { type: String, enum: LOG_MODULES, default: "SYSTEM" },
    severity: { type: String, enum: LOG_SEVERITIES, default: "INFO" },
    message: { type: String, trim: true, maxlength: 1200, default: null },
    description: { type: String, trim: true, maxlength: 1200, default: null },
    entityType: { type: String, trim: true, maxlength: 80, default: null },
    entityId: { type: mongoose.Schema.Types.Mixed, default: null },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    robot_id: { type: mongoose.Schema.Types.ObjectId, ref: "Robot", default: null },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

logSchema.pre("validate", function (next) {
  if (!this.eventType && this.event_type) this.eventType = this.event_type;
  if (!this.event_type && this.eventType) this.event_type = this.eventType;
  if (!this.message && this.description) this.message = this.description;
  if (!this.description && this.message) this.description = this.message;
  if (!this.timestamp) this.timestamp = this.createdAt || new Date();
  if (!this.actorId && this.user_id) this.actorId = this.user_id;
  if (!this.user_id && this.actorId) this.user_id = this.actorId;
  next();
});

logSchema.index({ module: 1, createdAt: -1 });
logSchema.index({ eventType: 1, createdAt: -1 });
logSchema.index({ severity: 1, createdAt: -1 });
logSchema.index({ entityType: 1, entityId: 1 });
logSchema.index({ event_type: 1, timestamp: -1 });
logSchema.index({ timestamp: -1 });
logSchema.index({ task_id: 1, timestamp: -1 });
logSchema.index({ robot_id: 1, timestamp: -1 });
logSchema.index({ user_id: 1, timestamp: -1 });

logSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    ret.eventType = ret.eventType || ret.event_type;
    ret.event_type = ret.event_type || ret.eventType;
    ret.message = ret.message || ret.description;
    ret.description = ret.description || ret.message;
    ret.createdAt = ret.createdAt || ret.timestamp;
    ret.timestamp = ret.timestamp || ret.createdAt;
    ret.actorId = ret.actorId || ret.user_id || null;
    if (ret.task_id) ret.task_id = String(ret.task_id);
    if (ret.robot_id) ret.robot_id = String(ret.robot_id);
    if (ret.user_id) ret.user_id = String(ret.user_id);
    if (ret.actorId) ret.actorId = String(ret.actorId);
    delete ret._id;
    delete ret.__v;
    delete ret.updatedAt;
    return ret;
  }
});

export const Log = mongoose.models.Log || mongoose.model("Log", logSchema);
export const LOG_MODULE_VALUES = LOG_MODULES;
export const LOG_SEVERITY_VALUES = LOG_SEVERITIES;
