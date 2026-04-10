const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { stmts, initializeUser } = require('./db');
const { rateLimit, csrfCheck, requireAuth, createToken, setSessionCookie, DUMMY_HASH } = require('./middleware');

const router = express.Router();

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_REGEX = /^[a-f0-9]{64}$/;

// ============================================================
// POST /api/auth/signup
// ============================================================
router.post('/signup', rateLimit(5, 15 * 60 * 1000), csrfCheck, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-24 characters (letters, numbers, underscores).' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 8-128 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check for duplicates (generic error to prevent enumeration)
    const existingEmail = stmts.findUserByEmail.get(normalizedEmail);
    const existingUsername = stmts.findUserByUsername.get(username);
    if (existingEmail || existingUsername) {
      return res.status(409).json({ error: 'An account with these credentials already exists.' });
    }

    // Create user
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex'); // 64 chars
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    stmts.createUser.run(id, username, normalizedEmail, passwordHash, verificationToken, verificationExpires);

    // Dev mode: auto-verify
    if (process.env.NODE_ENV !== 'production') {
      stmts.autoVerifyUser.run(id);
      console.log(`[DEV] Auto-verified user: ${username} (${normalizedEmail})`);
      console.log(`[DEV] Verification token would be: ${verificationToken}`);
    }

    // Initialize user progress
    initializeUser(id);

    res.status(201).json({ message: 'Account created successfully.', verified: process.env.NODE_ENV !== 'production' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ============================================================
// POST /api/auth/login
// ============================================================
router.post('/login', rateLimit(10, 15 * 60 * 1000), csrfCheck, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = stmts.findUserByEmail.get(normalizedEmail);

    if (!user) {
      // Timing-safe: hash dummy password so response time is consistent
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check lockout
    if (user.locked_until) {
      const lockExpiry = new Date(user.locked_until);
      if (lockExpiry > new Date()) {
        const minutesLeft = Math.ceil((lockExpiry - new Date()) / 60000);
        return res.status(423).json({ error: `Account locked. Try again in ${minutesLeft} minutes.` });
      }
      // Lock expired, reset
      stmts.resetFailedAttempts.run(user.id);
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      stmts.incrementFailedAttempts.run(user.id);
      const attempts = user.failed_attempts + 1;
      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        stmts.lockAccount.run(lockUntil, user.id);
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check verification
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.', needsVerification: true });
    }

    // Success - reset failed attempts, create session
    stmts.resetFailedAttempts.run(user.id);
    const token = createToken(user);
    setSessionCookie(res, token);

    // Update streak
    const { updateStreak } = require('./db');
    updateStreak(user.id);

    res.json({
      user: { id: user.id, username: user.username, email: user.email },
      message: 'Login successful.'
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ============================================================
// POST /api/auth/logout
// ============================================================
router.post('/logout', csrfCheck, (req, res) => {
  res.clearCookie('mindshift_session', { maxAge: 0 });
  res.json({ message: 'Logged out.' });
});

// ============================================================
// GET /api/auth/me
// ============================================================
router.get('/me', rateLimit(120, 60 * 1000), (req, res) => {
  const token = req.cookies?.mindshift_session;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('./middleware');
    const payload = jwt.verify(token, JWT_SECRET);
    const user = stmts.findUserById.get(payload.userId);
    if (!user) {
      res.clearCookie('mindshift_session');
      return res.status(401).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    res.clearCookie('mindshift_session');
    return res.status(401).json({ error: 'Session expired' });
  }
});

// ============================================================
// POST /api/auth/verify
// ============================================================
router.post('/verify', rateLimit(10, 15 * 60 * 1000), (req, res) => {
  const { token } = req.body;
  if (!token || !TOKEN_REGEX.test(token)) {
    return res.status(400).json({ error: 'Invalid verification token.' });
  }

  const user = stmts.findUserByToken.get(token);
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification token.' });
  }

  if (new Date(user.verification_expires) < new Date()) {
    return res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
  }

  stmts.verifyUser.run(user.id);
  res.json({ message: 'Email verified successfully. You can now log in.' });
});

// ============================================================
// POST /api/auth/resend-verification
// ============================================================
router.post('/resend-verification', rateLimit(3, 15 * 60 * 1000), (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const user = stmts.findUserByEmail.get(email.toLowerCase().trim());
  // Generic response to prevent enumeration
  if (!user || user.email_verified) {
    return res.json({ message: 'If that email exists and is unverified, a new verification link has been sent.' });
  }

  const newToken = crypto.randomBytes(32).toString('hex');
  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  stmts.updateVerificationToken.run(newToken, newExpires, user.id);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] New verification token for ${user.email}: ${newToken}`);
  }

  res.json({ message: 'If that email exists and is unverified, a new verification link has been sent.' });
});

module.exports = router;
