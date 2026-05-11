import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { isDbConnected, mongoose } from "../db.js";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { Robot } from "../models/Robot.js";
import { Log } from "../models/Log.js";

const router = express.Router();

router.get("/stats", authMiddleware, async (_req, res) => {
  try {
    const totalUserDocs = await User.countDocuments({});

    const unique = await User.aggregate([
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$email" } } }
        }
      },
      {
        $project: {
          _id: 0,
          email: "$_id"
        }
      }
    ]);

    const uniqueUsers = unique.length;
    const totalTasks = await Task.countDocuments({});
    const totalLogs = await Log.countDocuments({});

    return res.json({
      dbOk: isDbConnected(),
      dbName: mongoose.connection.name,
      totalUsers: totalUserDocs,
      uniqueUsers,
      totalTasks,
      totalLogs
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/logs", authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;
    const eventType = String(req.query.event_type || "").trim();
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const taskId = req.query.task_id ? String(req.query.task_id).trim() : null;

    const filter = {
    };
    if (eventType) filter.event_type = eventType;
    if (taskId) {
      // If the log documents have task_id stored use ObjectId match,
      // but fall back to searching the description text for the id
      // to support older logs that only include the id in the message.
      try {
        const oid = new mongoose.Types.ObjectId(taskId);
        filter.$or = [{ task_id: oid }, { description: { $regex: taskId, $options: "i" } }];
      } catch (e) {
        // Not a valid ObjectId — search description text only
        filter.description = { $regex: taskId, $options: "i" };
      }
    }
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
        severity: log.severity,
        timestamp: log.timestamp,
        task_id: log.task_id ? String(log.task_id) : null,
        robot_id: log.robot_id ? String(log.robot_id) : null,
        user_id: log.user_id ? String(log.user_id) : null,
        metadata: log.metadata || null
      }))
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

router.get("/metrics", authMiddleware, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || "7", 10), 1), 90);
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      total,
      byStatus,
      durationAgg,
      robot,
      createdByDay,
      completedByDay
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
      Robot.findOne({}).sort({ createdAt: 1 }).populate("location_zone_id").lean({ virtuals: true }),
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
            location: robot.location,
            currentState: robot.currentState
          }
        : null,
      series: {
        created: createdByDay.map((row) => ({ date: row._id, count: row.count })),
        completed: completedByDay.map((row) => ({ date: row._id, count: row.count }))
      }
    });
  } catch {
    return res.status(500).json({ message: "Server error." });
  }
});

export default router;