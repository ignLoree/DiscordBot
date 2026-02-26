function normalizeError(error) {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

module.exports = {
  name: "error",
  execute(error) {
    const normalized = normalizeError(error);
    try {
      if (global?.logger?.error) {
        global.logger.error("[CLIENT ERROR]", normalized);
        return;
      }
      console.error("[CLIENT ERROR]", normalized);
    } catch (logError) {
      console.error("[CLIENT ERROR:FALLBACK]", normalized);
      console.error("[CLIENT ERROR:LOGGER_FAILURE]", logError);
    }
  },
};