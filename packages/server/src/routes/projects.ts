import { Hono } from "hono";
import { AppBindings } from "../app-types";
import { buildLogContext, getLogger } from "../lib/logger";
import { ServerOptions } from "../types";

export function registerProjectRoute(
  app: Hono<AppBindings>,
  options: ServerOptions,
): void {
  app.get("/projects/:projectId", (c) => {
    const logger = getLogger(c, options);
    const { projectId } = c.req.param();
    const project = options.projects[projectId];

    if (!project) {
      logger.warn?.(
        "Project not found",
        buildLogContext(c, options, { projectId, status: 404 }),
      );
      return c.json({ error: `Project \"${projectId}\" not found` }, 404);
    }

    logger.debug?.(
      "Project resolved",
      buildLogContext(c, options, { projectId }),
    );
    return c.json(project);
  });
}
