import { mongoose } from "../db.js";

const TASK_PRIORITIES = Object.freeze(["HIGH", "MEDIUM", "LOW"]);
const TASK_STATUSES = Object.freeze([
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED"
]);

const taskSchema = new mongoose.Schema({
  pickup_zone: { type: String, required: true, trim: true, maxlength: 80 },
  drop_zone: { type: String, required: true, trim: true, maxlength: 80 },
  weight: { type: Number, required: true, min: 0 },
  priority: {
    type: String,
    enum: TASK_PRIORITIES,
    default: "MEDIUM",
    required: true
  },
  status: {
    type: String,
    enum: TASK_STATUSES,
    default: "PENDING",
    required: true
  },
  assigned_robot_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Robot",
    default: null
  },
  rejection_reason: { type: String, default: "" },
  assignedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

taskSchema.index({ status: 1, createdAt: 1 });
taskSchema.index({ priority: 1, status: 1, createdAt: 1 });

taskSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    if (ret.assigned_robot_id) ret.assigned_robot_id = String(ret.assigned_robot_id);
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);
export const TASK_PRIORITY_VALUES = TASK_PRIORITIES;
export const TASK_STATUS_VALUES = TASK_STATUSES;
