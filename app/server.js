import express from 'express';
import { run } from './index.js';

const app = express();
const PORT = process.env.PORT || 3000;

const runtime = await run();

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    intervalMs: Number(process.env.CHECK_INTERVAL_MS || 60000),
    users: Object.keys(runtime.getState()),
    state: runtime.getState(),
    now: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`health server on :${PORT}`);
});

// SIGTERM 対応
process.on('SIGTERM', async () => {
  try { await runtime.close(); } catch {}
  process.exit(0);
});
