const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRouter = require('./auth');
const apiRouter = require('./api');
const { db } = require('./db');

// Auto-seed mock users if leaderboard is empty
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  require('./seed');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middleware
// ============================================================
app.use(express.json());
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// ============================================================
// Routes
// ============================================================
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// SPA fallback — serve index.html for non-API, non-file routes
app.get('*', (req, res) => {
  // If the request is for a file that exists, express.static already handled it
  // Otherwise serve the requested file or index.html
  const requestedPath = path.join(__dirname, '..', req.path);
  res.sendFile(requestedPath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '..', 'index.html'));
    }
  });
});

// ============================================================
// Start
// ============================================================
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║      MindShift Server Running       ║
  ║   http://localhost:${PORT}              ║
  ╚══════════════════════════════════════╝
  `);
});
