import { getShortestPath, WAREHOUSE_GRAPH } from "../src/utils/warehouseGraph.js";


const start = process.argv[2] || "ZONE_A";
const end = process.argv[3] || "ZONE_E";

const result = getShortestPath(WAREHOUSE_GRAPH, start, end);

console.log("Shortest Path Test:");
if (!result) {
	console.log(`No path found between ${start} and ${end}`);
} else {
	console.log(`Path: ${result.path.join(" -> ")}`);
	console.log(`Distance: ${result.distance}`);
}
