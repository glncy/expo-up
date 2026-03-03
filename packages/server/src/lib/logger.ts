import { Context } from "hono";
import { randomUUID } from "node:crypto";
import { AppBindings } from "../app-types";
import {
  ExpoUpErrorReporter,
  ExpoUpLogger,
  LogContext,
  ServerOptions,
} from "../types";

function write(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context?: LogContext,
): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ?? {}),
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

export function createConsoleLogger(): ExpoUpLogger {
  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
  };
}

export function getRequestId(
  c: Context<AppBindings>,
  options: ServerOptions,
): string {
  const existing = c.get("requestId");
  if (existing) return existing;

  const generated = options.generateRequestId?.() ?? randomUUID();
  c.set("requestId", generated);
  return generated;
}

export function getLogger(
  c: Context<AppBindings>,
  options: ServerOptions,
): ExpoUpLogger {
  return c.get("logger") ?? options.logger ?? createConsoleLogger();
}

export function getErrorReporter(
  c: Context<AppBindings>,
  options: ServerOptions,
): ExpoUpErrorReporter | undefined {
  return c.get("errorReporter") ?? options.errorReporter;
}

export function buildLogContext(
  c: Context<AppBindings>,
  options: ServerOptions,
  extra: LogContext = {},
): LogContext {
  const url = new URL(c.req.url);

  return {
    requestId: getRequestId(c, options),
    method: c.req.method,
    path: url.pathname,
    ...extra,
  };
}
