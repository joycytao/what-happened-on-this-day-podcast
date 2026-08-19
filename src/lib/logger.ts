export function createLogger(scope: string) {
  function emit(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
    const payload = meta ? ` ${JSON.stringify(meta)}` : "";
    console[level](`[${scope}] ${message}${payload}`);
  }

  return {
    info(message: string, meta?: Record<string, unknown>) {
      emit("info", message, meta);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      emit("warn", message, meta);
    },
    error(message: string, meta?: Record<string, unknown>) {
      emit("error", message, meta);
    }
  };
}
