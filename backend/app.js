require('dotenv').config();
const express = require('express');
const cors = require('cors');

const productRouter = require('./routers/productRouter');
const scrapeRouter = require('./routers/scrapeRouter');
const exportRouter = require('./routers/exportRouter');
const notificationRouter = require('./routers/notificationRouter');

const supabase = require('./config/supabaseClient');

const app = express();

// Strip any accidental trailing slash from CLIENT_URL so CORS matching is always exact
const allowedOrigin = (process.env.CLIENT_URL || '*').replace(/\/$/, '');
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// Simple request logger: [Time] METHOD /path -> STATUS (duration)
app.use((req, res, next) => {
  // Skip logging for health checks to keep console logs clean
  if (req.path === '/health') return next();

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check — also used as a keep-warm ping from a secondary cron
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/products', productRouter);
app.use('/scrape', scrapeRouter);
app.use('/export', exportRouter);
app.use('/notifications', notificationRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n==============================================`);
  console.log(`  Price Tracker backend running on port ${PORT}`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`==============================================`);

  // Verify Supabase connection on startup
  try {
    const { error } = await supabase.from('tracked_products').select('id').limit(1);
    if (error) throw error;
    console.log(`[DB] Connected to Supabase database successfully.\n`);
  } catch (err) {
    console.error(`[DB] Supabase connection check failed: ${err.message}\n`);
  }
});
