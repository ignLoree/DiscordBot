function formatDurationMs(durationMs) {
  const totalMs = Math.max(0, Math.floor(Number(durationMs || 0)));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${minutes}m ${seconds}s ${millis}ms`;
}

async function runTimedTask({ label, run, onStart, onSuccess, onError }) {
  const startedAt = Date.now();
  onStart?.(label);
  try {
    const value = await run();
    onSuccess?.(label, startedAt, value);
    return {
      status: "fulfilled",
      label,
      value,
      durationMs: Date.now() - startedAt,
    };
  } catch (reason) {
    onError?.(label, startedAt, reason);
    return {
      status: "rejected",
      label,
      reason,
      durationMs: Date.now() - startedAt,
    };
  }
}

async function runTaskGroup(tasks, hooks = {}) {
  return Promise.all(
    tasks.map((task) =>
      runTimedTask({
        label: task.label,
        run: task.run,
        onStart: hooks.onStart,
        onSuccess: hooks.onSuccess,
        onError: hooks.onError,
      }),
    ),
  );
}

async function runTaskSequence(tasks, hooks = {}) {
  const results = [];
  for (const task of tasks) {
    if (task.enabled === false) continue;
    results.push(
      await runTimedTask({
        label: task.label,
        run: task.run,
        onStart: hooks.onStart,
        onSuccess: hooks.onSuccess,
        onError: hooks.onError,
      }),
    );
  }
  return results;
}

module.exports = {
  formatDurationMs,
  runTaskGroup,
  runTaskSequence,
};