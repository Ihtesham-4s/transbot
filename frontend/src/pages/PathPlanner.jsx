import { useState, useEffect } from "react";
import { Play, Trash2, Route, Pointer, Square, SquareDashed, Check, RefreshCcw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";

const GRID_ROWS = 15;
const GRID_COLS = 25;

const NODE_TYPES = {
  EMPTY: 0,
  WALL: 1,
  START: 2,
  END: 3,
  PATH: 4,
  VISITED: 5,
};

// Priority Queue for A* algorithm
class PriorityQueue {
  constructor() {
    this.elements = [];
  }
  enqueue(item, priority) {
    this.elements.push({ item, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }
  dequeue() {
    return this.elements.shift().item;
  }
  isEmpty() {
    return this.elements.length === 0;
  }
}

export default function PathPlanner() {
  const [grid, setGrid] = useState([]);
  const [startNode, setStartNode] = useState({ r: 2, c: 2 });
  const [endNode, setEndNode] = useState({ r: 12, c: 22 });
  const [mode, setMode] = useState("wall"); // 'wall', 'start', 'end', 'erase'
  const [isDrawing, setIsDrawing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [stats, setStats] = useState({ nodesVisited: 0, pathLength: 0 });

  // Initialize grid
  useEffect(() => {
    resetGrid(false);
  }, []);

  const resetGrid = (clearWalls = true) => {
    setIsAnimating(false);
    setStats({ nodesVisited: 0, pathLength: 0 });
    const newGrid = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const row = [];
      for (let c = 0; c < GRID_COLS; c++) {
        let type = NODE_TYPES.EMPTY;
        if (r === startNode.r && c === startNode.c) type = NODE_TYPES.START;
        else if (r === endNode.r && c === endNode.c) type = NODE_TYPES.END;
        else if (!clearWalls && grid[r]?.[c] === NODE_TYPES.WALL) type = NODE_TYPES.WALL;
        row.push(type);
      }
      newGrid.push(row);
    }
    setGrid(newGrid);
  };

  const clearPath = () => {
    setIsAnimating(false);
    setStats({ nodesVisited: 0, pathLength: 0 });
    const newGrid = grid.map((row, r) =>
      row.map((cell, c) => {
        if (cell === NODE_TYPES.PATH || cell === NODE_TYPES.VISITED) {
          return NODE_TYPES.EMPTY;
        }
        return cell;
      })
    );
    setGrid(newGrid);
  };

  const handleNodeClick = (r, c) => {
    if (isAnimating) return;
    const newGrid = [...grid.map(row => [...row])];
    
    // Clear path if any modifications happen
    if (newGrid[r][c] === NODE_TYPES.PATH || newGrid[r][c] === NODE_TYPES.VISITED) {
      clearPath();
    }

    if (mode === "wall") {
      if (newGrid[r][c] === NODE_TYPES.EMPTY || newGrid[r][c] === NODE_TYPES.VISITED || newGrid[r][c] === NODE_TYPES.PATH) {
        newGrid[r][c] = NODE_TYPES.WALL;
      }
    } else if (mode === "erase") {
      if (newGrid[r][c] === NODE_TYPES.WALL) {
        newGrid[r][c] = NODE_TYPES.EMPTY;
      }
    } else if (mode === "start") {
      if (newGrid[r][c] !== NODE_TYPES.END) {
        newGrid[startNode.r][startNode.c] = NODE_TYPES.EMPTY;
        newGrid[r][c] = NODE_TYPES.START;
        setStartNode({ r, c });
      }
    } else if (mode === "end") {
      if (newGrid[r][c] !== NODE_TYPES.START) {
        newGrid[endNode.r][endNode.c] = NODE_TYPES.EMPTY;
        newGrid[r][c] = NODE_TYPES.END;
        setEndNode({ r, c });
      }
    }
    setGrid(newGrid);
  };

  const handleMouseDown = (r, c) => {
    setIsDrawing(true);
    handleNodeClick(r, c);
  };

  const handleMouseEnter = (r, c) => {
    if (isDrawing) {
      handleNodeClick(r, c);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  // A* Heuristic: Manhattan Distance
  const heuristic = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);

  const findPath = async () => {
    if (isAnimating) return;
    clearPath();
    setIsAnimating(true);

    const start = `${startNode.r},${startNode.c}`;
    const goal = `${endNode.r},${endNode.c}`;
    
    const frontier = new PriorityQueue();
    frontier.enqueue(start, 0);
    
    const cameFrom = {};
    const costSoFar = {};
    
    cameFrom[start] = null;
    costSoFar[start] = 0;

    const visitedNodes = [];

    while (!frontier.isEmpty()) {
      const current = frontier.dequeue();
      
      if (current === goal) {
        break;
      }

      const [cr, cc] = current.split(",").map(Number);
      visitedNodes.push({ r: cr, c: cc });

      const neighbors = [
        { r: cr - 1, c: cc }, // Up
        { r: cr + 1, c: cc }, // Down
        { r: cr, c: cc - 1 }, // Left
        { r: cr, c: cc + 1 }, // Right
      ];

      for (let next of neighbors) {
        if (next.r < 0 || next.r >= GRID_ROWS || next.c < 0 || next.c >= GRID_COLS) continue;
        if (grid[next.r][next.c] === NODE_TYPES.WALL) continue;

        const nextStr = `${next.r},${next.c}`;
        const newCost = costSoFar[current] + 1; // Assuming cost is 1 for all moves

        if (!(nextStr in costSoFar) || newCost < costSoFar[nextStr]) {
          costSoFar[nextStr] = newCost;
          const priority = newCost + heuristic(next, endNode);
          frontier.enqueue(nextStr, priority);
          cameFrom[nextStr] = current;
        }
      }
    }

    // Animate visited nodes
    for (let i = 0; i < visitedNodes.length; i++) {
      const node = visitedNodes[i];
      if ((node.r !== startNode.r || node.c !== startNode.c) && (node.r !== endNode.r || node.c !== endNode.c)) {
        setGrid(prev => {
          const newGrid = [...prev.map(row => [...row])];
          newGrid[node.r][node.c] = NODE_TYPES.VISITED;
          return newGrid;
        });
        setStats(prev => ({ ...prev, nodesVisited: prev.nodesVisited + 1 }));
        await new Promise(resolve => setTimeout(resolve, 10)); // Speed of animation
      }
    }

    // Reconstruct and animate path
    if (goal in cameFrom) {
      let current = goal;
      const path = [];
      while (current !== start) {
        current = cameFrom[current];
        if (current !== start) {
          path.push(current);
        }
      }
      path.reverse();

      for (let i = 0; i < path.length; i++) {
        const [pr, pc] = path[i].split(",").map(Number);
        setGrid(prev => {
          const newGrid = [...prev.map(row => [...row])];
          newGrid[pr][pc] = NODE_TYPES.PATH;
          return newGrid;
        });
        setStats(prev => ({ ...prev, pathLength: prev.pathLength + 1 }));
        await new Promise(resolve => setTimeout(resolve, 20)); // Speed of path animation
      }
    }

    setIsAnimating(false);
  };

  const getCellClasses = (type) => {
    switch (type) {
      case NODE_TYPES.WALL:
        return "bg-slate-700 border-slate-600 scale-100 transition-transform shadow-[inset_0_0_8px_rgba(0,0,0,0.5)]";
      case NODE_TYPES.START:
        return "bg-blue-500 border-blue-400 z-10 shadow-[0_0_12px_rgba(59,130,246,0.6)] animate-pulse";
      case NODE_TYPES.END:
        return "bg-green-500 border-green-400 z-10 shadow-[0_0_12px_rgba(34,197,94,0.6)] animate-pulse";
      case NODE_TYPES.PATH:
        return "bg-cyan-400 border-cyan-300 z-10 scale-110 rounded-sm shadow-[0_0_10px_rgba(34,211,238,0.8)] transition-all duration-300";
      case NODE_TYPES.VISITED:
        return "bg-purple-500/40 border-purple-400/30 scale-95 transition-all duration-500";
      default:
        return "bg-slate-800/40 border-white/5 hover:bg-slate-700/50 transition-colors";
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center gap-4 border-b border-white/10 pb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_20px_rgba(168,85,247,0.3)]">
          <Route className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="brand-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Path Planning Simulator
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Interactive visualization of warehouse robot routing logic using A* algorithm.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Controls Sidebar */}
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-slate-900/50 p-5 backdrop-blur-md">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Tools</h3>
            <div className="flex flex-col gap-2">
              <Button
                variant={mode === "wall" ? "primary" : "secondary"}
                className="w-full justify-start gap-2 text-sm"
                onClick={() => setMode("wall")}
                disabled={isAnimating}
              >
                <Square className="h-4 w-4 shrink-0" />
                <span>Draw Walls</span>
              </Button>
              <Button
                variant={mode === "erase" ? "primary" : "secondary"}
                className="w-full justify-start gap-2 text-sm"
                onClick={() => setMode("erase")}
                disabled={isAnimating}
              >
                <SquareDashed className="h-4 w-4 shrink-0" />
                <span>Erase</span>
              </Button>
              <Button
                variant={mode === "start" ? "primary" : "secondary"}
                className="w-full justify-start gap-2 text-sm"
                onClick={() => setMode("start")}
                disabled={isAnimating}
              >
                <Pointer className="h-4 w-4 shrink-0 text-blue-400" />
                <span>Set Start</span>
              </Button>
              <Button
                variant={mode === "end" ? "primary" : "secondary"}
                className="w-full justify-start gap-2 text-sm"
                onClick={() => setMode("end")}
                disabled={isAnimating}
              >
                <Check className="h-4 w-4 shrink-0 text-green-400" />
                <span>Set End</span>
              </Button>
            </div>
          </div>

          <div className="h-px w-full bg-white/10" />

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</h3>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400"
                onClick={findPath}
                disabled={isAnimating}
              >
                <Play className="mr-2 h-4 w-4" /> Find Shortest Path
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => clearPath()}
                disabled={isAnimating}
              >
                <RefreshCcw className="mr-2 h-4 w-4" /> Clear Path
              </Button>
              <Button
                variant="secondary"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                onClick={() => resetGrid()}
                disabled={isAnimating}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Reset All
              </Button>
            </div>
          </div>

          <div className="h-px w-full bg-white/10" />

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Simulation Stats</h3>
            <div className="rounded-xl bg-slate-950/50 p-4">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-400">Nodes Explored:</span>
                <span className="font-mono font-medium text-purple-400">{stats.nodesVisited}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Path Length:</span>
                <span className="font-mono font-medium text-cyan-400">{stats.pathLength}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Grid Area */}
        <div className="flex flex-col items-center justify-center overflow-auto rounded-3xl border border-white/10 bg-slate-900/30 p-6 backdrop-blur-md">
          <div 
            className="flex flex-col gap-[2px] rounded-lg border border-slate-700 bg-slate-700 p-[2px] shadow-2xl"
            onMouseLeave={handleMouseUp}
          >
            {grid.map((row, rIndex) => (
              <div key={rIndex} className="flex gap-[2px]">
                {row.map((cellType, cIndex) => (
                  <div
                    key={`${rIndex}-${cIndex}`}
                    className={cn(
                      "h-6 w-6 cursor-pointer border sm:h-8 sm:w-8",
                      getCellClasses(cellType)
                    )}
                    onMouseDown={() => handleMouseDown(rIndex, cIndex)}
                    onMouseEnter={() => handleMouseEnter(rIndex, cIndex)}
                    onMouseUp={handleMouseUp}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-blue-500" /> Start
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-green-500" /> End
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-slate-700" /> Wall
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-cyan-400" /> Path
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
