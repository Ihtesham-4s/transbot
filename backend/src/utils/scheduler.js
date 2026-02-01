const PRIORITY_BASE = Object.freeze({ HIGH: 3, MEDIUM: 2, LOW: 1 });

export const AGING_FACTOR_MINUTES = 5;

export function computeEffectivePriority({ priority, createdAt }, now = new Date()) {
  const base = PRIORITY_BASE[priority] ?? PRIORITY_BASE.MEDIUM;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const waitingMinutes = Math.max(0, (now.getTime() - created.getTime()) / 60000);
  const effectivePriority = base + waitingMinutes / AGING_FACTOR_MINUTES;
  return { base_priority: base, waiting_minutes: waitingMinutes, effective_priority: effectivePriority };
}

export function pickBestTask(pendingTasks, now = new Date()) {
  if (!Array.isArray(pendingTasks) || pendingTasks.length === 0) return null;

  // Highest effective_priority wins; FIFO (oldest createdAt) breaks ties.
  const scored = pendingTasks
    .map((task) => {
      const scoring = computeEffectivePriority(task, now);
      return {
        task,
        ...scoring,
        createdAt: task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt)
      };
    })
    .sort((a, b) => {
      if (b.effective_priority !== a.effective_priority) return b.effective_priority - a.effective_priority;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  return scored[0];
}
