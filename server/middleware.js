const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'mindshift-dev-secret-key-change-in-production';
const IS_PROD = process.env.NODE_ENV === 'production';

// ============================================================
// Rate Limiting (in-memory IP-based)
// ============================================================
const rateLimitBuckets = new Map();

function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || 'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    // 1% random cleanup
    if (Math.random() < 0.01) {
      for (const [k, v] of rateLimitBuckets) {
        if (now - v.windowStart > windowMs) rateLimitBuckets.delete(k);
      }
    }

    let bucket = rateLimitBuckets.get(key);
    if (!bucket || now - bucket.windowStart > windowMs) {
      bucket = { count: 0, windowStart: now };
      rateLimitBuckets.set(key, bucket);
    }

    bucket.count++;
    if (bucket.count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    next();
  };
}

// ============================================================
// CSRF Protection (production only)
// ============================================================
function csrfCheck(req, res, next) {
  if (!IS_PROD) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return res.status(403).json({ error: 'Forbidden' });
  // In production, validate origin matches your domain
  next();
}

// ============================================================
// Auth Middleware - verify JWT from cookie
// ============================================================
function requireAuth(req, res, next) {
  const token = req.cookies?.mindshift_session;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.userId || !payload.email || !payload.username) {
      throw new Error('Invalid token payload');
    }
    req.user = payload;
    next();
  } catch (err) {
    res.clearCookie('mindshift_session');
    return res.status(401).json({ error: 'Session expired' });
  }
}

// ============================================================
// JWT helpers
// ============================================================
function createToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  );
}

function setSessionCookie(res, token) {
  res.cookie('mindshift_session', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

// ============================================================
// Dummy password hash (timing-safe login)
// ============================================================
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

module.exports = { rateLimit, csrfCheck, requireAuth, createToken, setSessionCookie, JWT_SECRET, DUMMY_HASH };
