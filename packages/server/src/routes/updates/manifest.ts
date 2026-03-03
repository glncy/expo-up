import { Hono } from "hono";
import mime from "mime/lite";
import { v5 as uuidv5 } from "uuid";
import { AppBindings } from "../../app-types";
import {
  MANIFEST_PART_NAME,
  PROTOCOL_VERSION,
  ROLLBACK_PART_NAME,
  SFV_VERSION,
  UUID_NAMESPACE,
} from "../../constants";
import { signRSASHA256 } from "../../lib/crypto";
import { getErrorMessage } from "../../lib/errors";
import { getProjectBaseUrl, getProtocolVersion } from "../../lib/http";
import { buildLogContext, getErrorReporter, getLogger } from "../../lib/logger";
import { BinaryMultipartBuilder } from "../../lib/multipart";
import { buildExpoSignatureHeader } from "../../lib/signature";
import { ServerOptions } from "../../types";
import { resolveManifestChannel } from "./shared";

export function registerManifestRoute(
  app: Hono<AppBindings>,
  options: ServerOptions,
): void {
  const { projects, basePath } = options;

  app.get("/:projectId/manifest", async (c) => {
    const logger = getLogger(c, options);
    const reporter = getErrorReporter(c, options);
    const requestUrl = new URL(c.req.url);
    const queryParams = Object.fromEntries(requestUrl.searchParams.entries());

    const { projectId } = c.req.param();
    const storage = c.get("storage") ?? options.storage;
    const cert = c.get("certificate") ?? options.certificate;
    const runtimeVersion = c.req.header("expo-runtime-version");
    const platform = c.req.header("expo-platform");
    const channel = resolveManifestChannel(c);
    const protocolVersion = getProtocolVersion(c);
    const currentUpdateId = c.req.header("expo-current-update-id");
    const expectSignature = c.req.header("expo-expect-signature");

    logger.debug?.(
      "Manifest request details",
      buildLogContext(c, options, {
        projectId,
        channel,
        runtimeVersion: runtimeVersion ?? undefined,
        platform: platform ?? undefined,
        protocolVersion,
        currentUpdateId: currentUpdateId ?? undefined,
        expectSignature: expectSignature ?? undefined,
        query: queryParams,
      }),
    );

    if (!storage || !platform || !projects[projectId] || !runtimeVersion) {
      logger.warn?.(
        "Manifest request missing required headers or config",
        buildLogContext(c, options, {
          projectId,
          channel,
          runtimeVersion: runtimeVersion ?? undefined,
          platform: platform ?? undefined,
          status: 400,
        }),
      );
      return c.json({ error: "Missing configuration or headers" }, 400);
    }

    const config = projects[projectId];

    try {
      const storagePath = `${config.owner}/${config.repo}/${runtimeVersion}`;
      const builds = await storage.list(storagePath, channel);
      const buildIds = builds
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => !Number.isNaN(value))
        .sort((a, b) => b - a);

      if (buildIds.length === 0) {
        logger.info?.(
          "No builds found for manifest request",
          buildLogContext(c, options, {
            projectId,
            channel,
            runtimeVersion,
            status: 404,
          }),
        );
        return c.json({ error: "No builds found" }, 404);
      }

      const resolveEffective = async (
        id: number,
      ): Promise<{ id: number; isEmbedded: boolean }> => {
        try {
          const rollbackBuffer = await storage.download(
            `${storagePath}/${id}/rollback`,
            channel,
          );
          const target = rollbackBuffer.toString().trim();
          if (target === "EMBEDDED") {
            return { id, isEmbedded: true };
          }
          return resolveEffective(Number.parseInt(target, 10));
        } catch {
          return { id, isEmbedded: false };
        }
      };

      const effective = await resolveEffective(buildIds[0]);

      if (effective.isEmbedded) {
        const rollbackId = uuidv5(
          `embedded-rollback-${effective.id}-${channel}`,
          UUID_NAMESPACE,
        );

        if (currentUpdateId === rollbackId && protocolVersion === 1) {
          logger.debug?.(
            "Manifest request already up-to-date (embedded rollback)",
            buildLogContext(c, options, {
              projectId,
              channel,
              runtimeVersion,
              status: 204,
            }),
          );
          return new Response(null, {
            status: 204,
            headers: { "expo-protocol-version": PROTOCOL_VERSION },
          });
        }

        const builder = new BinaryMultipartBuilder();
        builder.addPart(ROLLBACK_PART_NAME, {
          type: "rollBackToEmbedded",
          parameters: { commitTime: new Date().toISOString() },
        });

        const headers: Record<string, string> = {
          "expo-protocol-version": PROTOCOL_VERSION,
          "expo-sfv-version": SFV_VERSION,
          "expo-update-id": rollbackId,
          "cache-control": "no-cache, no-store, must-revalidate",
        };
        const projectCert = config.certificate ?? cert;
        let signatureHeader: string | undefined;
        if (projectCert?.privateKey) {
          const rollbackPartBytes = builder.getPartBytes(ROLLBACK_PART_NAME);
          if (!rollbackPartBytes) {
            throw new Error("Missing rollback part payload for signing");
          }
          const signature = signRSASHA256(
            rollbackPartBytes,
            projectCert.privateKey,
          );
          signatureHeader = buildExpoSignatureHeader(
            signature,
            projectCert.keyId ?? "main",
          );
          builder.setPartHeaders(ROLLBACK_PART_NAME, {
            "expo-signature": signatureHeader,
          });
        }
        const { body, contentType } = builder.build();
        headers["content-type"] = contentType;

        logger.info?.(
          "Serving embedded rollback directive",
          buildLogContext(c, options, {
            projectId,
            channel,
            runtimeVersion,
            status: 200,
            rollbackBuildId: effective.id,
            expectSignature: c.req.header("expo-expect-signature") ?? undefined,
          }),
        );

        return c.body(body as never, 200, headers);
      }

      const buildPath = `${storagePath}/${effective.id}`;
      const [metadataFile, expoConfigFile] = await Promise.all([
        storage.download(`${buildPath}/metadata.json`, channel),
        storage.download(`${buildPath}/expoConfig.json`, channel),
      ]);

      const metadata = JSON.parse(metadataFile.toString()) as {
        id?: string;
        fileMetadata: Record<
          string,
          {
            bundle: string;
            assets: Array<{ path: string; hash?: string; ext?: string }>;
          }
        >;
      };
      const expoConfig = JSON.parse(expoConfigFile.toString()) as Record<
        string,
        unknown
      >;
      const platformMeta = metadata.fileMetadata[platform];

      const updateId = uuidv5(
        `${metadata.id ?? ""}-${buildIds[0]}-${channel}`,
        UUID_NAMESPACE,
      );

      if (currentUpdateId === updateId && protocolVersion === 1) {
        logger.debug?.(
          "Manifest request already up-to-date",
          buildLogContext(c, options, {
            projectId,
            channel,
            runtimeVersion,
            status: 204,
            updateId,
          }),
        );
        return new Response(null, {
          status: 204,
          headers: { "expo-protocol-version": PROTOCOL_VERSION },
        });
      }

      const baseUrl = getProjectBaseUrl(c, basePath, projectId);
      const manifest = {
        id: updateId,
        createdAt: new Date().toISOString(),
        runtimeVersion,
        launchAsset: {
          key: platformMeta.bundle.split("-").pop()?.split(".")[0] ?? "bundle",
          contentType: "application/javascript",
          url: `${baseUrl}/assets?path=${buildPath}/${platformMeta.bundle}&channel=${channel}`,
          fileExtension: ".bundle",
        },
        assets: platformMeta.assets.map((asset) => ({
          key: asset.hash ?? asset.path.split("/").pop() ?? asset.path,
          contentType:
            mime.getType(asset.ext ?? asset.path) ?? "application/octet-stream",
          url: `${baseUrl}/assets?path=${buildPath}/${asset.path}&channel=${channel}`,
          fileExtension: asset.ext ? `.${asset.ext}` : "",
        })),
        metadata: {},
        extra: {
          expoClient: {
            ...expoConfig,
            name: (expoConfig.name as string | undefined) ?? config.repo,
            slug: (expoConfig.slug as string | undefined) ?? projectId,
          },
        },
      };

      const builder = new BinaryMultipartBuilder();
      builder.addPart(MANIFEST_PART_NAME, manifest);

      const assetRequestHeaders: Record<string, Record<string, never>> = {};
      [manifest.launchAsset, ...manifest.assets].forEach((asset) => {
        assetRequestHeaders[asset.key] = {};
      });
      builder.addPart("extensions", { assetRequestHeaders });

      const headers: Record<string, string> = {
        "expo-protocol-version": `${protocolVersion}`,
        "expo-sfv-version": SFV_VERSION,
        "cache-control": "no-cache, no-store, must-revalidate",
      };

      const projectCert = config.certificate ?? cert;
      let signatureHeader: string | undefined;
      if (projectCert?.privateKey) {
        const manifestPartBytes = builder.getPartBytes(MANIFEST_PART_NAME);
        if (!manifestPartBytes) {
          throw new Error("Missing manifest part payload for signing");
        }
        const signature = signRSASHA256(
          manifestPartBytes,
          projectCert.privateKey,
        );
        signatureHeader = buildExpoSignatureHeader(
          signature,
          projectCert.keyId ?? "main",
        );
        builder.setPartHeaders(MANIFEST_PART_NAME, {
          "expo-signature": signatureHeader,
        });
      }
      const { body, contentType } = builder.build();
      headers["content-type"] = contentType;

      logger.info?.(
        "Serving manifest response",
        buildLogContext(c, options, {
          projectId,
          channel,
          runtimeVersion,
          platform,
          status: 200,
          buildId: effective.id,
          updateId,
          expectSignature: c.req.header("expo-expect-signature") ?? undefined,
        }),
      );

      return c.body(body as never, 200, headers);
    } catch (error) {
      const context = buildLogContext(c, options, {
        projectId,
        channel,
        runtimeVersion,
        platform,
        status: 500,
        error: getErrorMessage(error),
      });
      logger.error?.("Manifest request failed", context);
      reporter?.captureException(error, context);
      return c.json({ error: getErrorMessage(error) }, 500);
    }
  });
}
