import 'dotenv/config';
import { createApp } from './app.js';
import { disconnectDb } from './db.js';

const port = Number(process.env.PORT || 4000);
const app = createApp();
const server = app.listen(port, () => console.log(`TenderBridge API listening on port ${port}`));

async function shutdown() {
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
