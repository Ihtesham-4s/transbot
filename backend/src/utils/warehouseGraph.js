const WAREHOUSE_ZONES = Object.freeze(["ZONE_CHARGE", "ZONE_A", "ZONE_B", "ZONE_C", "ZONE_D", "ZONE_E"]);

const WAREHOUSE_EDGES = Object.freeze([
  { from: "ZONE_CHARGE", to: "ZONE_A", distance: 2 },
  { from: "ZONE_CHARGE", to: "ZONE_B", distance: 3 },
  { from: "ZONE_A", to: "ZONE_B", distance: 4 },
  { from: "ZONE_A", to: "ZONE_C", distance: 6 },
  { from: "ZONE_B", to: "ZONE_C", distance: 3 },
  { from: "ZONE_B", to: "ZONE_D", distance: 5 },
  { from: "ZONE_C", to: "ZONE_D", distance: 2 },
  { from: "ZONE_C", to: "ZONE_E", distance: 4 },
  { from: "ZONE_D", to: "ZONE_E", distance: 3 }
]);

export function buildWarehouseGraph(zones = WAREHOUSE_ZONES, edges = WAREHOUSE_EDGES) {
  const adjacency = new Map();
  zones.forEach((z) => adjacency.set(z, []));

  edges.forEach(({ from, to, distance }) => {
    if (!adjacency.has(from) || !adjacency.has(to)) return;
    adjacency.get(from).push({ to, distance });
    adjacency.get(to).push({ to: from, distance });
  });

  return { zones: [...zones], edges: [...edges], adjacency };
}

export const WAREHOUSE_GRAPH = buildWarehouseGraph();

export function pathExists(graph, start, end) {
  return Boolean(getShortestPath(graph, start, end));
}

export function getShortestPath(graph, start, end) {
  if (!graph?.adjacency?.has(start) || !graph?.adjacency?.has(end)) return null;
  if (start === end) return { distance: 0, path: [start] };

  const distances = new Map();
  const previous = new Map();
  const visited = new Set();

  graph.zones.forEach((z) => distances.set(z, Number.POSITIVE_INFINITY));
  distances.set(start, 0);

  while (visited.size < graph.zones.length) {
    let current = null;
    let smallest = Number.POSITIVE_INFINITY;

    for (const [node, dist] of distances.entries()) {
      if (visited.has(node)) continue;
      if (dist < smallest) {
        smallest = dist;
        current = node;
      }
    }

    if (!current) break;
    if (current === end) break;

    visited.add(current);
    const neighbors = graph.adjacency.get(current) || [];
    for (const { to, distance } of neighbors) {
      if (visited.has(to)) continue;
      const nextDist = smallest + distance;
      if (nextDist < (distances.get(to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(to, nextDist);
        previous.set(to, current);
      }
    }
  }

  const finalDistance = distances.get(end);
  if (!Number.isFinite(finalDistance)) return null;

  const path = [];
  let cursor = end;
  while (cursor) {
    path.unshift(cursor);
    if (cursor === start) break;
    cursor = previous.get(cursor);
  }

  if (!path.length || path[0] !== start) return null;

  return { distance: finalDistance, path };
}


export const WAREHOUSE_GRAPH_META = Object.freeze({
  zones: WAREHOUSE_ZONES,
  edges: WAREHOUSE_EDGES
});
