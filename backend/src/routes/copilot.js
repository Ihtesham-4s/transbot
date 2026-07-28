import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { Robot } from "../models/Robot.js";
import { Task } from "../models/Task.js";
import { Zone } from "../models/Zone.js";
import { Product } from "../models/Product.js";
import { Order } from "../models/Order.js";
import { PickList } from "../models/PickList.js";
import { logEvent } from "../utils/logger.js";

const router = express.Router();
router.use(authMiddleware);

const chatSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty."),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string()
      })
    )
    .optional()
    .default([])
});

async function getLiveWarehouseContext() {
  try {
    const [robot, zones, pendingTasks, products, pendingOrders, picklists] = await Promise.all([
      Robot.findOne({}).populate("location_zone_id").lean(),
      Zone.find({ active: true }).lean(),
      Task.find({ status: { $in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } })
        .populate("pickup_zone_id drop_zone_id")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Product.find({}).populate("zone_id").lean(),
      Order.find({ status: "PENDING" }).lean(),
      PickList.find({ status: "PENDING" }).lean()
    ]);

    const robotZoneCode = robot?.location_zone_id?.code || "A";
    const robotState = robot?.currentState || "IDLE";
    const lowStock = products.filter((p) => Number(p.quantity) < Number(p.minStockLevel));

    return {
      robot: {
        name: robot?.name || "Robot-01",
        zone: `Zone ${robotZoneCode}`,
        state: robotState,
        payloadLimit: "2.0 kg"
      },
      zones: zones.map((z) => `Zone ${z.code}: ${z.description || z.name}`).join("; "),
      queue: {
        totalPending: pendingTasks.length,
        items: pendingTasks.map((t) => ({
          id: String(t._id).slice(-6),
          pickup: t.pickup_zone_id?.code || "A",
          drop: t.drop_zone_id?.code || "B",
          weight: `${t.weight || t.totalWeightKg} kg`,
          assignedType: t.assignedType || (Number(t.weight) <= 2 ? "ROBOT" : "HUMAN_WORKER"),
          status: t.status
        }))
      },
      inventory: {
        totalProducts: products.length,
        lowStockCount: lowStock.length,
        lowStockItems: lowStock.map((p) => `${p.sku} (${p.name}): ${p.quantity} left (min: ${p.minStockLevel})`)
      },
      orders: {
        pendingOrdersCount: pendingOrders.length,
        pendingPicklistsCount: picklists.length
      }
    };
  } catch (err) {
    console.warn("[copilot] Failed to build live context:", err?.message);
    return null;
  }
}

router.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid message payload.", errors: parsed.error.flatten() });
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ message: "Mistral API key is not configured in backend environment." });
  }

  const model = process.env.MISTRAL_MODEL || "mistral-small-2506";
  const userMessage = parsed.data.message;
  const history = parsed.data.history || [];

  try {
    const liveContext = await getLiveWarehouseContext();

    const systemPrompt = `You are TransBot AI Copilot, an intelligent warehouse management AI assistant embedded in the TransBot AGV Control Web Application.

WAREHOUSE DESIGN & RULES:
- 3 Physical Zones: Zone A (South / Robot Home), Zone B (North / Turn Junction), Zone C (West of B / End Terminal). Layout is an L-shaped track: C <- B <- A.
- Single Robot: Robot-01 (Capacity = 2.0 kg payload max).
- Task Dispatch Rules:
  1. Weight <= 2.0 kg: Handled by Robot-01 (assignedType = "ROBOT"). Pickup zone MUST match robot's current zone location!
  2. Weight > 2.0 kg: Handled by Human Worker Courier (assignedType = "HUMAN_WORKER"). Exempt from pickup zone match.
- Allowed Commands: TASK:AB, TASK:AC, TASK:BA, TASK:BC, TASK:CA, TASK:CB, STOP, RESET, SPEED:<R>,<L>.
- Order Rule: Order delivery zone CANNOT be the same as the pickup zone of selected items.

LIVE WAREHOUSE SYSTEM CONTEXT (REAL-TIME DATA):
${JSON.stringify(liveContext, null, 2)}

OUTPUT FORMAT & STRUCTURE REQUIREMENTS:
1. ALWAYS organize answers into structured sections using Markdown headings (### Section Title).
2. ALWAYS use bullet points (\`- **Key Point**: Description\`) for lists and breakdowns.
3. ALWAYS wrap system commands, zone codes, and variables in inline code tags (\`TASK:AB\`, \`Zone A\`, \`2.0 kg\`).
4. Start with a 1-sentence Executive Summary before providing bullet points.
5. Keep tone concise, professional, and helpful.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-6).map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.content })),
      { role: "user", content: userMessage }
    ];

    let response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 600
      })
    });

    // Fallback to mistral-small-latest if model specific version is unavailable
    if (!response.ok && model !== "mistral-small-latest") {
      console.warn(`[copilot] ${model} returned ${response.status}. Retrying with mistral-small-latest...`);
      response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          messages,
          temperature: 0.3,
          max_tokens: 600
        })
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[copilot] Mistral API error response:", errorText);
      return res.status(502).json({ message: `Mistral AI error (${response.status}). Please check API key.` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I am currently unable to generate a response.";

    await logEvent({
      eventType: "COPILOT_QUERY",
      module: "COPILOT",
      severity: "INFO",
      message: `AI Copilot query answered for ${req.user?.email || "user"}.`,
      actorId: req.user?.id || null,
      metadata: { userMessage, responseModel: data.model || model }
    });

    return res.json({
      reply,
      model: data.model || model,
      context: {
        robotZone: liveContext?.robot?.zone,
        robotState: liveContext?.robot?.state,
        pendingTasks: liveContext?.queue?.totalPending
      }
    });
  } catch (err) {
    console.error("[copilot] Chat exception:", err);
    return res.status(500).json({ message: "Failed to communicate with Mistral AI service." });
  }
});

export default router;
