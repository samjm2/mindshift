const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'data', 'auth.db');
const db = new Database(DB_PATH);

// Enable WAL mode + foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// Schema
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0,
    verification_token TEXT,
    verification_expires TEXT,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);

  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_learning_minutes INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    streak_last_date TEXT,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    level_name TEXT DEFAULT 'Beginner',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id)
  );

  CREATE TABLE IF NOT EXISTS course_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    progress_percent INTEGER DEFAULT 0,
    current_module INTEGER DEFAULT 1,
    status TEXT DEFAULT 'enrolled',
    enrolled_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS completed_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    completed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, course_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    earned_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS scheduled_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL,
    title TEXT NOT NULL,
    tutor_name TEXT,
    group_name TEXT,
    session_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'upcoming',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    detail TEXT,
    xp_earned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light',
    text_size INTEGER DEFAULT 16,
    high_contrast INTEGER DEFAULT 0,
    notif_sessions INTEGER DEFAULT 1,
    notif_achievements INTEGER DEFAULT 1,
    notif_leaderboard INTEGER DEFAULT 0,
    UNIQUE(user_id)
  );

  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, friend_id)
  );
`);

// ============================================================
// Prepared Statements
// ============================================================
const stmts = {
  // Users
  findUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  findUserById: db.prepare('SELECT id, username, email, email_verified, created_at FROM users WHERE id = ?'),
  findUserByToken: db.prepare('SELECT * FROM users WHERE verification_token = ?'),

  createUser: db.prepare(`
    INSERT INTO users (id, username, email, password_hash, verification_token, verification_expires)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  updateUsername: db.prepare('UPDATE users SET username = ?, updated_at = datetime(\'now\') WHERE id = ?'),

  verifyUser: db.prepare(`
    UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL, updated_at = datetime('now')
    WHERE id = ?
  `),

  autoVerifyUser: db.prepare(`
    UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL, updated_at = datetime('now')
    WHERE id = ?
  `),

  incrementFailedAttempts: db.prepare(`
    UPDATE users SET failed_attempts = failed_attempts + 1, updated_at = datetime('now') WHERE id = ?
  `),

  lockAccount: db.prepare(`
    UPDATE users SET locked_until = ?, updated_at = datetime('now') WHERE id = ?
  `),

  resetFailedAttempts: db.prepare(`
    UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?
  `),

  updateVerificationToken: db.prepare(`
    UPDATE users SET verification_token = ?, verification_expires = ?, updated_at = datetime('now') WHERE id = ?
  `),

  // Progress
  getProgress: db.prepare('SELECT * FROM user_progress WHERE user_id = ?'),
  upsertProgress: db.prepare(`
    INSERT INTO user_progress (user_id, total_learning_minutes, streak_days, streak_last_date, xp, level, level_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      total_learning_minutes = excluded.total_learning_minutes,
      streak_days = excluded.streak_days,
      streak_last_date = excluded.streak_last_date,
      xp = excluded.xp,
      level = excluded.level,
      level_name = excluded.level_name,
      updated_at = datetime('now')
  `),
  addXP: db.prepare(`
    UPDATE user_progress SET xp = xp + ?, updated_at = datetime('now') WHERE user_id = ?
  `),

  // Enrollments
  getEnrollments: db.prepare('SELECT * FROM course_enrollments WHERE user_id = ?'),
  getEnrollment: db.prepare('SELECT * FROM course_enrollments WHERE user_id = ? AND course_id = ?'),
  enroll: db.prepare(`
    INSERT OR IGNORE INTO course_enrollments (user_id, course_id) VALUES (?, ?)
  `),
  updateCourseProgress: db.prepare(`
    UPDATE course_enrollments SET progress_percent = ?, current_module = ?, status = ?, updated_at = datetime('now')
    WHERE user_id = ? AND course_id = ?
  `),
  unenroll: db.prepare('DELETE FROM course_enrollments WHERE user_id = ? AND course_id = ?'),

  // Lessons
  getCompletedLessons: db.prepare('SELECT * FROM completed_lessons WHERE user_id = ? AND course_id = ?'),
  completeLesson: db.prepare(`
    INSERT OR IGNORE INTO completed_lessons (user_id, course_id, lesson_id) VALUES (?, ?, ?)
  `),
  uncompleteLesson: db.prepare('DELETE FROM completed_lessons WHERE user_id = ? AND course_id = ? AND lesson_id = ?'),

  // Achievements
  getUserAchievements: db.prepare('SELECT achievement_id, earned_at FROM achievements WHERE user_id = ?'),
  earnAchievement: db.prepare(`
    INSERT OR IGNORE INTO achievements (user_id, achievement_id) VALUES (?, ?)
  `),
  countAchievements: db.prepare('SELECT COUNT(*) as count FROM achievements WHERE user_id = ?'),

  // Sessions
  getUserSessions: db.prepare('SELECT * FROM scheduled_sessions WHERE user_id = ? ORDER BY session_date, start_time'),
  getUpcomingSessions: db.prepare(`
    SELECT * FROM scheduled_sessions WHERE user_id = ? AND status = 'upcoming'
    ORDER BY session_date, start_time LIMIT ?
  `),
  createSession: db.prepare(`
    INSERT INTO scheduled_sessions (user_id, session_type, title, tutor_name, group_name, session_date, start_time, end_time, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  deleteSession: db.prepare('DELETE FROM scheduled_sessions WHERE id = ? AND user_id = ?'),

  // Activity
  getActivity: db.prepare('SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'),
  logActivity: db.prepare(`
    INSERT INTO activity_log (user_id, action, detail, xp_earned) VALUES (?, ?, ?, ?)
  `),

  // Notifications
  getNotifications: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'),
  getUnreadCount: db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'),
  createNotification: db.prepare(`
    INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)
  `),
  markNotificationRead: db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?'),
  markAllRead: db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?'),

  // Settings
  getSettings: db.prepare('SELECT * FROM user_settings WHERE user_id = ?'),
  upsertSettings: db.prepare(`
    INSERT INTO user_settings (user_id, theme, text_size, high_contrast, notif_sessions, notif_achievements, notif_leaderboard)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      theme = excluded.theme,
      text_size = excluded.text_size,
      high_contrast = excluded.high_contrast,
      notif_sessions = excluded.notif_sessions,
      notif_achievements = excluded.notif_achievements,
      notif_leaderboard = excluded.notif_leaderboard
  `),

  // Friends
  getFriends: db.prepare(`
    SELECT u.id, u.username, u.email, u.created_at, up.xp, up.level, up.level_name
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    LEFT JOIN user_progress up ON up.user_id = f.friend_id
    WHERE f.user_id = ?
  `),
  addFriend: db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)'),
  removeFriend: db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?'),

  // Leaderboard
  getLeaderboard: db.prepare(`
    SELECT u.id, u.username, up.xp, up.level, up.level_name, up.streak_days,
      (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.user_id = u.id AND ce.status = 'completed') as courses_completed
    FROM users u
    JOIN user_progress up ON up.user_id = u.id
    WHERE u.email_verified = 1
    ORDER BY up.xp DESC
    LIMIT ?
  `),
};

// ============================================================
// Helper: initialize progress for new user
// ============================================================
function initializeUser(userId) {
  stmts.upsertProgress.run(userId, 0, 0, null, 0, 1, 'Beginner');
  stmts.upsertSettings.run(userId, 'light', 16, 0, 1, 1, 0);
  stmts.createNotification.run(userId, 'welcome', 'Welcome to MindShift!', 'Start by enrolling in a course to begin your AI learning journey.');
}

// ============================================================
// Helper: check and award achievements
// ============================================================
const ACHIEVEMENT_DEFS = [
  { id: 'first-steps', name: 'First Steps', desc: 'Complete your first lesson', category: 'learning', xp: 50, check: (ctx) => ctx.lessonsCompleted >= 1 },
  { id: 'quick-learner', name: 'Quick Learner', desc: 'Complete 5 lessons', category: 'learning', xp: 100, check: (ctx) => ctx.lessonsCompleted >= 5 },
  { id: 'bookworm', name: 'Bookworm', desc: 'Complete 20 lessons', category: 'learning', xp: 200, check: (ctx) => ctx.lessonsCompleted >= 20 },
  { id: 'explorer', name: 'Explorer', desc: 'Enroll in 3 courses', category: 'learning', xp: 100, check: (ctx) => ctx.coursesEnrolled >= 3 },
  { id: 'quiz-master', name: 'Quiz Master', desc: 'Score 90%+ on 10 quizzes', category: 'mastery', xp: 200, check: (ctx) => ctx.quizzesPassed >= 10 },
  { id: 'course-complete', name: 'Course Complete', desc: 'Finish your first course', category: 'mastery', xp: 300, check: (ctx) => ctx.coursesCompleted >= 1 },
  { id: 'deep-diver', name: 'Deep Diver', desc: 'Complete an advanced course', category: 'mastery', xp: 500, check: (ctx) => ctx.advancedCompleted >= 1 },
  { id: 'scholar', name: 'Scholar', desc: 'Complete 5 courses', category: 'mastery', xp: 1000, check: (ctx) => ctx.coursesCompleted >= 5 },
  { id: 'perfectionist', name: 'Perfectionist', desc: 'Score 100% on 5 quizzes', category: 'mastery', xp: 300, check: (ctx) => ctx.perfectQuizzes >= 5 },
  { id: 'team-player', name: 'Team Player', desc: 'Attend 3 tutoring sessions', category: 'community', xp: 100, check: (ctx) => ctx.sessionsAttended >= 3 },
  { id: 'helping-hand', name: 'Helping Hand', desc: 'Attend 10 sessions', category: 'community', xp: 150, check: (ctx) => ctx.sessionsAttended >= 10 },
  { id: 'discussion-leader', name: 'Discussion Leader', desc: 'Attend 3 group study sessions', category: 'community', xp: 200, check: (ctx) => ctx.groupSessions >= 3 },
  { id: 'social-butterfly', name: 'Social Butterfly', desc: 'Add 5 friends', category: 'community', xp: 150, check: (ctx) => ctx.friendCount >= 5 },
  { id: 'mentor', name: 'Mentor', desc: 'Help 10 students', category: 'community', xp: 300, check: (ctx) => ctx.studentsHelped >= 10 },
  { id: 'consistent', name: 'Consistent', desc: '7-day learning streak', category: 'streaks', xp: 150, check: (ctx) => ctx.streak >= 7 },
  { id: 'unstoppable', name: 'Unstoppable', desc: '30-day learning streak', category: 'streaks', xp: 500, check: (ctx) => ctx.streak >= 30 },
  { id: 'early-bird', name: 'Early Bird', desc: 'Complete a lesson before 8 AM', category: 'streaks', xp: 50, check: (ctx) => ctx.earlyLesson },
  { id: 'marathon', name: 'Marathon', desc: '3-hour learning session', category: 'streaks', xp: 150, check: (ctx) => ctx.marathonSession },
];

function checkAchievements(userId, context) {
  const earned = stmts.getUserAchievements.all(userId).map(a => a.achievement_id);
  const newlyEarned = [];

  for (const ach of ACHIEVEMENT_DEFS) {
    if (earned.includes(ach.id)) continue;
    if (ach.check(context)) {
      stmts.earnAchievement.run(userId, ach.id);
      stmts.addXP.run(ach.xp, userId);
      stmts.createNotification.run(userId, 'achievement', 'Achievement Unlocked!', `You earned "${ach.name}" (+${ach.xp} XP)`);
      stmts.logActivity.run(userId, 'achievement', `Earned "${ach.name}"`, ach.xp);
      newlyEarned.push(ach);
    }
  }

  // Update level based on XP
  const progress = stmts.getProgress.get(userId);
  if (progress) {
    const xp = progress.xp;
    let level = 1, name = 'Beginner';
    if (xp >= 5000) { level = 8; name = 'Master'; }
    else if (xp >= 3500) { level = 7; name = 'Sage'; }
    else if (xp >= 2500) { level = 6; name = 'Expert'; }
    else if (xp >= 1500) { level = 5; name = 'Scholar'; }
    else if (xp >= 800) { level = 4; name = 'Apprentice'; }
    else if (xp >= 400) { level = 3; name = 'Learner'; }
    else if (xp >= 100) { level = 2; name = 'Explorer'; }

    if (level !== progress.level) {
      stmts.upsertProgress.run(userId, progress.total_learning_minutes, progress.streak_days, progress.streak_last_date, progress.xp, level, name);
      stmts.createNotification.run(userId, 'level-up', 'Level Up!', `You reached Level ${level}: ${name}!`);
    }
  }

  return newlyEarned;
}

// ============================================================
// Helper: update streak
// ============================================================
function updateStreak(userId) {
  const progress = stmts.getProgress.get(userId);
  if (!progress) return;

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (progress.streak_last_date === today) return; // already counted today

  let newStreak = progress.streak_days;
  if (progress.streak_last_date === yesterday) {
    newStreak += 1;
  } else if (progress.streak_last_date !== today) {
    newStreak = 1; // reset
  }

  stmts.upsertProgress.run(userId, progress.total_learning_minutes, newStreak, today, progress.xp, progress.level, progress.level_name);
}

module.exports = { db, stmts, initializeUser, checkAchievements, updateStreak, ACHIEVEMENT_DEFS };
