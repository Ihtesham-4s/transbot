import { mongoose } from "../db.js";

const TASK_STATUSES = Object.freeze([
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED"
]);

const TASK_PRIORITIES = Object.freeze(["LOW", "MEDIUM", "HIGH", "URGENT"]);

const taskSchema = new mongoose.Schema(
  {
    pickup_zone_id: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true },
    drop_zone_id: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: true },
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
    assignedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

taskSchema.index({ status: 1, createdAt: 1 });
taskSchema.index({ assigned_robot_id: 1, status: 1 });
taskSchema.index({ createdAt: 1 });

taskSchema.virtual("pickup_zone").get(function () {
  return this.pickup_zone_id?.code || null;
});

taskSchema.virtual("pickup_zone_label").get(function () {
  return this.pickup_zone_id?.label || null;
});

taskSchema.virtual("drop_zone").get(function () {
  return this.drop_zone_id?.code || null;
});

taskSchema.virtual("drop_zone_label").get(function () {
  return this.drop_zone_id?.label || null;
});

taskSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    if (ret.assigned_robot_id) {
      ret.assigned_robot_id = ret.assigned_robot_id.id
        ? String(ret.assigned_robot_id.id)
        : String(ret.assigned_robot_id);
    }
    if (ret.pickup_zone_id) {
      ret.pickup_zone_id = ret.pickup_zone_id.id
        ? String(ret.pickup_zone_id.id)
        : String(ret.pickup_zone_id);
    }
    if (ret.drop_zone_id) {
      ret.drop_zone_id = ret.drop_zone_id.id
        ? String(ret.drop_zone_id.id)
        : String(ret.drop_zone_id);
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export const Task = mongoose.models.Task || mongoose.model("Task", taskSchema);
export const TASK_STATUS_VALUES = TASK_STATUSES;
export const TASK_PRIORITY_VALUES = TASK_PRIORITIES;
