export interface TaskLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function formatMeta(meta?: Record<string, unknown>) {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(meta)}`;
}

export function createTaskLogger(taskName: string): TaskLogger {
  function write(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
    const line = `[${new Date().toISOString()}] [jobs] [${taskName}] ${message}${formatMeta(meta)}`;

    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta)
  };
}

function getErrorMeta(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return { error: String(error) };
}

export async function runLoggedTask<T>(
  taskName: string,
  action: (logger: TaskLogger) => Promise<T>
): Promise<T> {
  const logger = createTaskLogger(taskName);
  const startedAt = Date.now();

  logger.info("started");

  try {
    const result = await action(logger);

    logger.info("completed", {
      durationMs: Date.now() - startedAt
    });

    return result;
  } catch (error) {
    logger.error("failed", {
      durationMs: Date.now() - startedAt,
      ...getErrorMeta(error)
    });
    throw error;
  }
}
