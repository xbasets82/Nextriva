interface BackupRestoreOptions {
  composeFile: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  sourceDatabaseUrl: string;
}

interface DatabaseToolResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

interface DatabaseOperationOptions extends BackupRestoreOptions {
  targetDatabaseUrl: string;
  databaseUser: string;
  repositoryRoot: string;
  archivePath: string;
}

export function getBackupRestoreDatabaseName(suffix: string): string;

export function assertBackupRestoreDatabaseUrls(
  sourceUrl: string,
  targetUrl: string,
): {
  sourceDatabaseName: string;
  targetDatabaseName: string;
  databaseUser: string;
};

export function assertBackupArchiveOutsideRepository(
  archivePath: string,
  repositoryRoot: string,
): true;

export function createSecureBackupArchive(
  repositoryRoot: string,
  temporaryRoot?: string,
): {
  directory: string;
  archivePath: string;
  cleanup(): void;
};

export function assertCompatiblePostgresMajorVersions(
  dumpToolVersion: string,
  restoreToolVersion: string,
  serverVersionNumber: number | string,
): number;

export function getPostgresToolVersions(
  options: BackupRestoreOptions,
): Promise<{ dump: string; restore: string }>;

export function dumpPostgresDatabase(
  options: DatabaseOperationOptions & { sourceDatabaseName: string },
): Promise<DatabaseToolResult>;

export function restorePostgresDatabase(
  options: DatabaseOperationOptions & { targetDatabaseName: string },
): Promise<DatabaseToolResult>;
