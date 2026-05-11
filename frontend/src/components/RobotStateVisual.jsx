import { motion } from "framer-motion";
import { ROBOT_STATES } from "../constants/robotStates";

export function RobotStateVisual({ state, size = "lg" }) {
  const MotionSpan = motion.span;
  const shellSize = size === "md" ? "h-14 w-14" : "h-20 w-20";
  const dotSize = size === "md" ? "h-4 w-4" : "h-5 w-5";

  if (state === ROBOT_STATES.BUSY || state === ROBOT_STATES.ASSIGNED || state === ROBOT_STATES.MOVING) {
    return (
      <div
        className={`flex ${shellSize} items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 shadow-[0_0_30px_rgba(245,158,11,0.18)]`}
      >
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((item) => (
            <MotionSpan
              key={item}
              className="h-2.5 w-2.5 rounded-full bg-amber-400"
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 1, repeat: Infinity, delay: item * 0.15, ease: "easeInOut" }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (state === ROBOT_STATES.PAUSED) {
    return (
      <div
        className={`relative flex ${shellSize} items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/10 shadow-[0_0_30px_rgba(249,115,22,0.18)]`}
      >
        <span className={`absolute ${dotSize} rounded-full bg-orange-400`} />
        <MotionSpan
          className="absolute inset-3 rounded-full border border-orange-400/45"
          animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.2, 0.45] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    );
  }

  if (state === ROBOT_STATES.ERROR) {
    return (
      <div
        className={`relative flex ${shellSize} items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 shadow-[0_0_30px_rgba(244,63,94,0.18)]`}
      >
        <span className={`absolute ${dotSize} rounded-full bg-rose-400 animate-pulse`} />
        <MotionSpan
          className="absolute inset-3 rounded-full border border-rose-400/45"
          animate={{ scale: [1, 1.25, 1], opacity: [0.75, 0.05, 0.75] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex ${shellSize} items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.18)]`}
    >
      <span className={`absolute ${dotSize} rounded-full bg-emerald-400 animate-pulse`} />
      <MotionSpan
        className="absolute inset-3 rounded-full border border-emerald-400/45"
        animate={{ scale: [1, 1.24, 1], opacity: [0.55, 0.05, 0.55] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
      />
    </div>
  );
}
