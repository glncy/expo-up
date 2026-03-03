export interface StorageProvider {
  upload(
    file: Buffer | Blob | string,
    path: string,
    branch: string,
  ): Promise<string>;
  download(path: string, branch: string): Promise<Buffer>;
  delete(path: string, branch: string): Promise<void>;
  list(path: string, branch: string): Promise<string[]>;
}

export interface LogContext {
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  projectId?: string;
  channel?: string;
  runtimeVersion?: string;
  platform?: string;
  [key: string]: unknown;
}

export interface ExpoUpLogger {
  debug?(message: string, context?: LogContext): void;
  info?(message: string, context?: LogContext): void;
  warn?(message: string, context?: LogContext): void;
  error?(message: string, context?: LogContext): void;
}

export interface ExpoUpErrorReporter {
  captureException(error: unknown, context?: LogContext): void;
}

export interface ProjectConfig {
  owner: string;
  repo: string;
  certificate?: {
    privateKey: string;
    keyId: string;
  };
}

export interface ServerOptions {
  storage?: StorageProvider;
  projects: Record<string, ProjectConfig>;
  basePath: string; // The prefix where the server is mounted (e.g. /api/expo-up)
  logger?: ExpoUpLogger;
  errorReporter?: ExpoUpErrorReporter;
  generateRequestId?: () => string;
  github?: {
    clientId: string;
    clientSecret: string;
  };
  certificate?: {
    privateKey: string;
    keyId: string;
  };
}

export interface ExpoUpContextVariables {
  storage: StorageProvider;
  requestId?: string;
  logger?: ExpoUpLogger;
  errorReporter?: ExpoUpErrorReporter;
  github?: {
    clientId: string;
    clientSecret: string;
  };
  certificate?: {
    privateKey: string;
    keyId: string;
  };
}
