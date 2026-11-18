import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const server = createApp(db).listen(config.port, () => {
  console.log(`Gestor Transfer escuchando en http://localhost:${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} recibido, cerrando…`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
