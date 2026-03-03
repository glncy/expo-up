import { Context, Hono } from "hono";
import {
  CreateExpoUpServerBindings,
  ConfigureExpoUpBindings,
} from "./app-types";
import { getErrorMessage } from "./lib/errors";
import {
  buildLogContext,
  createConsoleLogger,
  getErrorReporter,
  getLogger,
  getRequestId,
} from "./lib/logger";
import { registerGithubAuthRoute } from "./routes/auth";
import { registerProjectRoute } from "./routes/projects";
import { registerUpdateRoutes } from "./routes/updates";
import { ExpoUpContextVariables, ServerOptions } from "./types";
export { ExpoUpGithubStorageProvider } from "./providers/github";
export type {
  ExpoUpErrorReporter,
  ExpoUpContextVariables,
  ExpoUpLogger,
  LogContext,
  ProjectConfig,
  ServerOptions,
  StorageProvider,
} from "./types";
export { createConsoleLogger } from "./lib/logger";

export function configureExpoUp<
  TBindings extends object,
  TPath extends string,
  TInput extends Record<string, unknown>,
>(
  c: Context<ConfigureExpoUpBindings<TBindings>, TPath, TInput>,
  vars: ExpoUpContextVariables,
): void {
  c.set("storage", vars.storage);
  c.set("requestId", vars.requestId);
  c.set("logger", vars.logger);
  c.set("errorReporter", vars.errorReporter);
  c.set("github", vars.github);
  c.set("certificate", vars.certificate);
}

export function createExpoUpServer(
  options: ServerOptions,
): Hono<CreateExpoUpServerBindings> {
  const app = new Hono<CreateExpoUpServerBindings>();
  const defaultLogger = options.logger ?? createConsoleLogger();

  app.use("*", async (c, next) => {
    const requestId = getRequestId(c, options);
    if (!c.get("logger")) c.set("logger", defaultLogger);
    if (!c.get("errorReporter") && options.errorReporter) {
      c.set("errorReporter", options.errorReporter);
    }

    const logger = getLogger(c, options);
    const startTime = Date.now();
    logger.info?.(
      "Request received",
      buildLogContext(c, options, { requestId }),
    );

    await next();

    logger.info?.(
      "Request completed",
      buildLogContext(c, options, {
        requestId,
        status: c.res.status,
        durationMs: Date.now() - startTime,
      }),
    );
  });

  app.onError((error, c) => {
    const logger = getLogger(c, options);
    const reporter = getErrorReporter(c, options);
    const context = buildLogContext(c, options, {
      status: 500,
      error: getErrorMessage(error),
    });

    logger.error?.("Unhandled server error", context);
    reporter?.captureException(error, context);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  registerProjectRoute(app, options);
  registerGithubAuthRoute(app, options);
  registerUpdateRoutes(app, options);

  return app;
}
