import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { isDbConnected, mongoose } from "../db.js";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { Robot } from "../models/Robot.js";
import { Log } from "../models/Log.js";

const router = express.Router();

router.get("/stats", authMiddleware, roleMiddleware(["admin"]), async (_req, res) => {
  try {
    const totalUserDocs = await User.countDocuments({});
    const adminCount = await User.countDocuments({ role: "admin" });
    const operatorCount = await User.countDocuments({ role: "operator" });

    // Extra clarity: count unique users by normalized email.
    // This helps debug situations where old test accounts exist or casing differs.
    const unique = await User.aggregate([
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$email" } } },
          roles: { $addToSet: "$role" }
        }
      },
      {
        $project: {
          _id: 0,
          email: "$_id",
          roles: 1
        }
      }
    ]);

    const uniqueUsers = unique.length;
    const uniqueAdmins = unique.filter((u) => u.roles.includes("admin")).length;
    const uniqueOperators = unique.filter((u) => u.roles.includes("operator")).length;

    return res.json({
      dbOk: isDbConnected(),
      dbName: mongoose.connection.name,
      totalUsers: totalUserDocs,
      adminCount,
      operatorCount,
      uniqueUsers,
      uniqueAdmins,
      uniqueOperators
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/users", authMiddleware, roleMiddleware(["admin"]), async (_req, res) => {
  try {
    const users = await User.find({})
      .select("name email role createdAt")
      .sort({ createdAt: 1 })
      .lean();
    return res.json({ users: users.map((u) => ({ ...u, id: String(u._id) })) });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.delete("/users/:id", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Missing user id." });

    // Prevent self-delete from the UI by default.
    if (String(req.user?.id) === String(id)) {
      return res.status(400).json({ message: "You cannot delete your own account." });
    }

    const found = await User.findById(id).select("role");
    if (!found) return res.status(404).json({ message: "User not found." });

    if (found.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({ message: "Cannot delete the last admin." });
      }
    }

    await User.deleteOne({ _id: id });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/logs", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;
    const eventType = String(req.query.event_type || "").trim();
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    const filter = {};
    if (eventType) filter.event_type = eventType;
    if (from || to) {
      filter.timestamp = {};
      if (from && !Number.isNaN(from.getTime())) filter.timestamp.$gte = from;
      if (to && !Number.isNaN(to.getTime())) filter.timestamp.$lte = to;
    }

    const [items, total] = await Promise.all([
      Log.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      Log.countDocuments(filter)
    ]);

    return res.json({
      total,
      page,
      limit,
      logs: items.map((log) => ({
        id: String(log._id),
        event_type: log.event_type,
        description: log.description,
        timestamp: log.timestamp
      }))
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/metrics", authMiddleware, roleMiddleware(["admin"]), async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || "7", 10), 1), 90);
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      total,
      byStatus,
      durationAgg,
      robot,
      createdByDay,
      completedByDay,
      rejectedByDay
    ] = await Promise.all([
      Task.countDocuments({}),
      Task.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Task.aggregate([
        {
          $match: {
            createdAt: { $ne: null },
            assignedAt: { $ne: null },
            startedAt: { $ne: null },
            completedAt: { $ne: null }
          }
        },
        {
          $project: {
            assignToStart: { $subtract: ["$startedAt", "$assignedAt"] },
            startToComplete: { $subtract: ["$completedAt", "$startedAt"] },
            createToComplete: { $subtract: ["$completedAt", "$createdAt"] }
          }
        },
        {
          $group: {
            _id: null,
            avgAssignToStartMs: { $avg: "$assignToStart" },
            avgStartToCompleteMs: { $avg: "$startToComplete" },
            avgCreateToCompleteMs: { $avg: "$createToComplete" }
          }
        }
      ]),
      Robot.findOne({}).sort({ createdAt: 1 }).lean(),
      Task.aggregate([
        { $match: { createdAt: { $gte: fromDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Task.aggregate([
        { $match: { completedAt: { $gte: fromDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Task.aggregate([
        { $match: { rejectedAt: { $gte: fromDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$rejectedAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    const statusMap = byStatus.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const durations = durationAgg[0] || {};

    return res.json({
      totalTasks: total,
      byStatus: statusMap,
      avgDurationsMs: {
        assignToStart: durations.avgAssignToStartMs || 0,
        startToComplete: durations.avgStartToCompleteMs || 0,
        createToComplete: durations.avgCreateToCompleteMs || 0
      },
      robot: robot
        ? {
            id: String(robot._id),
            batteryLevel: robot.batteryLevel,
            location: robot.location,
            currentState: robot.currentState,
            chargingUntil: robot.chargingUntil || null
          }
        : null,
      series: {
        created: createdByDay.map((row) => ({ date: row._id, count: row.count })),
        completed: completedByDay.map((row) => ({ date: row._id, count: row.count })),
        rejected: rejectedByDay.map((row) => ({ date: row._id, count: row.count }))
      }
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

// Helper for demo/dev: keep the earliest operator account and delete the rest.
router.post("/users/cleanup", authMiddleware, roleMiddleware(["admin"]), async (_req, res) => {
  try {
    const operators = await User.find({ role: "operator" }).select("_id createdAt").sort({ createdAt: 1 });
    if (operators.length <= 1) {
      return res.json({ ok: true, deleted: 0, kept: operators.length === 1 ? String(operators[0]._id) : null });
    }

    const [, ...extras] = operators;
    const extraIds = extras.map((u) => u._id);
    const result = await User.deleteMany({ _id: { $in: extraIds } });
    return res.json({
      ok: true,
      kept: String(operators[0]._id),
      deleted: result.deletedCount || 0
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;
