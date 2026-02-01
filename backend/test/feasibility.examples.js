import { analyzeFeasibility } from "../src/utils/feasibility.js";
import { buildWarehouseGraph } from "../src/utils/warehouseGraph.js";

const graph = buildWarehouseGraph();

const robot = {
  batteryLevel: 20,
  maxPayload: 10
};

const lowBatteryTask = {
  pickup_zone: "ZONE_A",
  drop_zone: "ZONE_E",
  weight: 5
};


const validTask = {
  pickup_zone: "ZONE_B",
  drop_zone: "ZONE_D",
  weight: 6
};

console.log("Low battery → rejected", analyzeFeasibility({ task: lowBatteryTask, robot, graph }));
console.log("Valid task → accepted", analyzeFeasibility({ task: validTask, robot: { batteryLevel: 100, maxPayload: 15 }, graph }));
