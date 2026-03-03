import { Hono } from "hono";
import mime from "mime/lite";
import { DEFAULT_CHANNEL, isSafeAssetPath } from "../../../../core/src/index";
import { AppBindings } from "../../app-types";
import { buildLogContext, getLogger } from "../../lib/logger";
import { ServerOptions } from "../../types";

export function registerAssetsRoute(
  app: Hono<AppBindings>,
  options: ServerOptions,
): void {
  const { projects } = options;

  app.get("/:projectId/assets", async (c) => {
    const logger = getLogger(c, options);
    const requestUrl = new URL(c.req.url);
    const { projectId } = c.req.param();
    const storage = c.get("storage") ?? options.storage;
    const projectConfig = projects[projectId];
    const assetPath = c.req.query("path");
    const channel = c.req.query("channel") ?? DEFAULT_CHANNEL;
    const queryParams = Object.fromEntries(requestUrl.searchParams.entries());

    logger.info?.(
      "Asset request details",
      buildLogContext(c, options, {
        projectId,
        channel,
        headers: c.req.header(),
        query: queryParams,
      }),
    );

    if (!storage || !projectConfig || !assetPath) {
      logger.warn?.(
        "Asset request missing required parameters",
        buildLogContext(c, options, { projectId, status: 404 }),
      );
      return c.text("Not Found", 404);
    }

    const runtimeBasePath = `${projectConfig.owner}/${projectConfig.repo}`;
    if (!isSafeAssetPath(assetPath, runtimeBasePath)) {
      logger.warn?.(
        "Blocked unsafe asset path",
        buildLogContext(c, options, {
          projectId,
          channel,
          status: 400,
          assetPath,
        }),
      );
      return c.text("Invalid asset path", 400);
    }

    try {
      const buffer = await storage.download(assetPath, channel);
      const contentType =
        mime.getType(assetPath) ??
        (assetPath.endsWith(".hbc")
          ? "application/javascript"
          : "application/octet-stream");

      return c.body(new Uint8Array(buffer) as never, 200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      });
    } catch {
      logger.info?.(
        "Asset not found",
        buildLogContext(c, options, {
          projectId,
          channel,
          status: 404,
          assetPath,
        }),
      );
      return c.text("Asset Not Found", 404);
    }
  });
}
