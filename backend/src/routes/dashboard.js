import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { Order } from "../models/Order.js";
import { PickList } from "../models/PickList.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { Log } from "../models/Log.js";
import { calculateInventoryIntelligence } from "../utils/inventoryIntelligence.js";
import { ROBOT_STATES } from "../constants/robotStates.js";

const router = express.Router();

router.use(authMiddleware);

const EMPTY_INVENTORY = {
  totalSKUs: 0,
  totalStockUnits: 0,
  lowStockCount: 0,
  overstockCount: 0,
  normalCount: 0,
  reorderRequiredCount: 0
};

const EMPTY_FULFILLMENT = {
  totalOrders: 0,
  pendingOrders: 0,
  readyToPickOrders: 0,
  insufficientStockOrders: 0,
  completedOrders: 0,
  openPickLists: 0,
  completedPickLists: 0
};

const EMPTY_ROBOT = {
  totalRobots: 0,
  idleRobots: 0,
  busyRobots: 0,
  errorRobots: 0,
  activeRobotName: null,
  activeRobotState: null,
  activeRobotId: null,
  activeTask: null,
  dispatchStatus: "UNKNOWN"
};

const EMPTY_ACTION = {
  lowStockProducts: [],
  overstockProducts: [],
  blockedOrders: [],
  readyPickLists: [],
  recentMovements: [],
  recentLogs: []
};

const EMPTY_METRICS = {
  stockHealthScore: 100,
  orderCompletionRate: 0,
  blockedOrderRate: 0,
  totalActionsRequired: 0
};

function mapLogSeverity(severity) {
  if (severity === "ERROR") return "HIGH";
  if (severity === "WARN") return "MEDIUM";
  return "LOW";
}

function movementSeverity(type) {
  if (type === "OUT") return "MEDIUM";
  if (type === "ADJUSTMENT") return "MEDIUM";
  return "LOW";
}

function enrichProductRow(product, intel) {
  const id = product._id ? String(product._id) : String(product.id || "");
  const sku = product.sku || "";
  const name = product.name || "";
  const currentStock = Number(product.currentStock || 0);
  const minStock = Number(product.minStock || 0);
  const maxStock = Number(product.maxStock ?? 100);
  const location = product.location || "";
  const suggestedReorderQty = intel.suggestedReorderQty ?? 0;
  const stockStatus = intel.stockStatus || "NORMAL";

  let title = "";
  let description = "";
  let severity = "LOW";

  if (stockStatus === "LOW_STOCK") {
    title = `Reorder: ${sku}`;
    description = `${name} is at ${currentStock} units (min ${minStock}). Suggested reorder: ${suggestedReorderQty} units.`;
    severity = "HIGH";
  } else if (stockStatus === "OVERSTOCK") {
    title = `Overstock review: ${sku}`;
    description = `${name} is at ${currentStock} units (max ${maxStock}). Consider redistribution or promotion.`;
    severity = "MEDIUM";
  }

  return {
    title,
    description,
    severity,
    relatedId: id,
    createdAt: product.updatedAt || product.createdAt || null,
    status: stockStatus,
    sku,
    name,
    currentStock,
    minStock,
    maxStock,
    location,
    suggestedReorderQty,
    stockStatus
  };
}

function robotDispatchStatus(robot, activeTask) {
  if (!robot) return "NO_ROBOT";
  if (robot.currentState === ROBOT_STATES.ERROR) return "FAULT";
  if (activeTask) return "DISPATCHED";
  if (robot.currentState === ROBOT_STATES.IDLE) return "READY";
  return "BUSY";
}

/** GET /api/dashboard/overview */
router.get("/overview", async (_req, res) => {
  const inventory = { ...EMPTY_INVENTORY };
  const fulfillment = { ...EMPTY_FULFILLMENT };
  const robotSummary = { ...EMPTY_ROBOT };
  const actionCenter = {
    lowStockProducts: [],
    overstockProducts: [],
    blockedOrders: [],
    readyPickLists: [],
    recentMovements: [],
    recentLogs: []
  };
  const metrics = { ...EMPTY_METRICS };

  try {
    /** --- Products / inventory --- */
    let products = [];
    try {
      products = await Product.find({}).sort({ sku: 1 }).lean();
    } catch {
      products = [];
    }

    const enriched = products.map((p) => {
      const intel = calculateInventoryIntelligence(p);
      return { ...p, _intel: intel };
    });

    for (const p of enriched) {
      inventory.totalSKUs += 1;
      inventory.totalStockUnits += Number(p.currentStock || 0);
      const { stockStatus, suggestedReorderQty } = p._intel;
      if (stockStatus === "LOW_STOCK") inventory.lowStockCount += 1;
      else if (stockStatus === "OVERSTOCK") inventory.overstockCount += 1;
      else inventory.normalCount += 1;
      if (stockStatus === "LOW_STOCK" && suggestedReorderQty > 0) {
        inventory.reorderRequiredCount += 1;
      }
    }

    const lowCandidates = enriched
      .filter((p) => p._intel.stockStatus === "LOW_STOCK")
      .sort((a, b) => Number(a.currentStock || 0) - Number(b.currentStock || 0))
      .slice(0, 5);

    const overCandidates = enriched
      .filter((p) => p._intel.stockStatus === "OVERSTOCK")
      .sort((a, b) => Number(b.currentStock || 0) - Number(a.currentStock || 0))
      .slice(0, 5);

    actionCenter.lowStockProducts = lowCandidates.map((p) => enrichProductRow(p, p._intel));
    actionCenter.overstockProducts = overCandidates.map((p) => enrichProductRow(p, p._intel));

    /** --- Fulfillment counts --- */
    try {
      const [
        totalOrders,
        pendingOrders,
        readyToPickOrders,
        insufficientStockOrders,
        completedOrders,
        openPickLists,
        completedPickLists
      ] = await Promise.all([
        Order.countDocuments({}),
        Order.countDocuments({ status: "PENDING" }),
        Order.countDocuments({ status: "READY_TO_PICK" }),
        Order.countDocuments({ status: "INSUFFICIENT_STOCK" }),
        Order.countDocuments({ status: "COMPLETED" }),
        PickList.countDocuments({ status: { $in: ["OPEN", "PICKING"] } }),
        PickList.countDocuments({ status: "COMPLETED" })
      ]);
      Object.assign(fulfillment, {
        totalOrders,
        pendingOrders,
        readyToPickOrders,
        insufficientStockOrders,
        completedOrders,
        openPickLists,
        completedPickLists
      });
    } catch {
      Object.assign(fulfillment, EMPTY_FULFILLMENT);
    }

    /** --- Blocked orders (top 5) --- */
    try {
      const blocked = await Order.find({ status: "INSUFFICIENT_STOCK" })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      actionCenter.blockedOrders = blocked.map((o) => ({
        title: `Order blocked: ${o.orderNo}`,
        description: `Customer "${o.customerName}" — ${o.insufficientItems?.length || 0} SKU(s) short on stock.`,
        severity: "HIGH",
        relatedId: String(o._id),
        createdAt: o.createdAt || null,
        status: o.status,
        orderNo: o.orderNo,
        customerName: o.customerName
      }));
    } catch {
      actionCenter.blockedOrders = [];
    }

    /** --- Open pick lists (top 5) --- */
    try {
      const picks = await PickList.find({ status: { $in: ["OPEN", "PICKING"] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("orderId", "orderNo")
        .lean();
      actionCenter.readyPickLists = picks.map((pl) => {
        const orderNo =
          pl.orderId && typeof pl.orderId === "object" && pl.orderId.orderNo
            ? pl.orderId.orderNo
            : "";
        return {
          title: `Pick list ${pl.pickNo}`,
          description: orderNo
            ? `Linked to order ${orderNo} — ${pl.items?.length || 0} pick line(s) ready.`
            : `${pl.items?.length || 0} pick line(s) awaiting completion.`,
          severity: "MEDIUM",
          relatedId: String(pl._id),
          createdAt: pl.createdAt || null,
          status: pl.status,
          pickNo: pl.pickNo,
          orderNo
        };
      });
    } catch {
      actionCenter.readyPickLists = [];
    }

    /** --- Recent movements --- */
    try {
      const movements = await StockMovement.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("productId", "sku name")
        .lean();
      actionCenter.recentMovements = movements.map((m) => {
        const sku = m.productId?.sku || "Unknown SKU";
        const name = m.productId?.name || "";
        return {
          title: `Stock ${m.type}`,
          description: `${sku}${name ? ` (${name})` : ""} — ${m.quantity} units${m.reason ? `. ${m.reason}` : ""}`,
          severity: movementSeverity(m.type),
          relatedId: String(m._id),
          createdAt: m.createdAt || null,
          status: m.type,
          sku,
          quantity: m.quantity,
          reason: m.reason || ""
        };
      });
    } catch {
      actionCenter.recentMovements = [];
    }

    /** --- Recent logs --- */
    try {
      const logs = await Log.find({}).sort({ timestamp: -1 }).limit(5).lean();
      actionCenter.recentLogs = logs.map((log) => ({
        title: log.event_type || "Event",
        description: log.description || "",
        severity: mapLogSeverity(log.severity),
        relatedId: String(log._id),
        createdAt: log.timestamp || null,
        status: log.severity || "INFO",
        event_type: log.event_type
      }));
    } catch {
      actionCenter.recentLogs = [];
    }

    /** --- Robots & active task --- */
    try {
      const robots = await Robot.find({}).sort({ createdAt: 1 }).lean();
      robotSummary.totalRobots = robots.length;
      for (const r of robots) {
        if (r.currentState === ROBOT_STATES.IDLE) robotSummary.idleRobots += 1;
        else if (r.currentState === ROBOT_STATES.ERROR) robotSummary.errorRobots += 1;
        else robotSummary.busyRobots += 1;
      }

      const active = robots[0] || null;
      if (active) {
        robotSummary.activeRobotName = active.name || "Robot";
        robotSummary.activeRobotState = active.currentState || "IDLE";
        robotSummary.activeRobotId = String(active._id);

        let activeTask = null;
        try {
          const taskDoc = await Task.findOne({
            assigned_robot_id: active._id,
            status: { $in: ["ASSIGNED", "IN_PROGRESS"] }
          })
            .sort({ createdAt: -1 })
            .populate("pickup_zone_id", "code label")
            .populate("drop_zone_id", "code label")
            .lean();

          if (taskDoc) {
            activeTask = {
              id: String(taskDoc._id),
              status: taskDoc.status,
              pickup_zone: taskDoc.pickup_zone_id?.code || taskDoc.pickup_zone || null,
              pickup_zone_label: taskDoc.pickup_zone_id?.label || null,
              drop_zone: taskDoc.drop_zone_id?.code || taskDoc.drop_zone || null,
              drop_zone_label: taskDoc.drop_zone_id?.label || null,
              createdAt: taskDoc.createdAt || null
            };
          }
        } catch {
          activeTask = null;
        }

        robotSummary.activeTask = activeTask;
        robotSummary.dispatchStatus = robotDispatchStatus(active, activeTask);
      }
    } catch {
      Object.assign(robotSummary, EMPTY_ROBOT);
    }

    /** --- Metrics --- */
    const totalP = inventory.totalSKUs;
    metrics.stockHealthScore =
      totalP === 0 ? 100 : Math.round((inventory.normalCount / totalP) * 1000) / 10;

    const totalO = fulfillment.totalOrders;
    metrics.orderCompletionRate =
      totalO === 0 ? 0 : Math.round((fulfillment.completedOrders / totalO) * 1000) / 10;
    metrics.blockedOrderRate =
      totalO === 0 ? 0 : Math.round((fulfillment.insufficientStockOrders / totalO) * 1000) / 10;

    metrics.totalActionsRequired =
      inventory.lowStockCount +
      inventory.overstockCount +
      fulfillment.insufficientStockOrders +
      fulfillment.openPickLists;

    return res.json({
      inventory,
      fulfillment,
      robot: robotSummary,
      actionCenter,
      metrics
    });
  } catch (error) {
    console.error("[dashboard] overview", error);
    return res.status(500).json({
      message: "Server error.",
      inventory: EMPTY_INVENTORY,
      fulfillment: EMPTY_FULFILLMENT,
      robot: EMPTY_ROBOT,
      actionCenter: EMPTY_ACTION,
      metrics: EMPTY_METRICS
    });
  }
});

export default router;
