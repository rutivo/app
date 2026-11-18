export interface AppConfig {
  port: number;
  databasePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT inválido: ${env.PORT}`);
  }
  return {
    port,
    databasePath: env.DATABASE_PATH ?? 'data/gestor-transfer.db',
  };
}
