// Seed mock users for leaderboard
// Run once: node server/seed.js

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, stmts, initializeUser } = require('./db');

const MOCK_USERS = [
  { username: 'alex_rivera', email: 'alex@mindshift.edu', xp: 4820, level: 7, levelName: 'Sage', streak: 21, courses: 4 },
  { username: 'priya_sharma', email: 'priya@mindshift.edu', xp: 4650, level: 7, levelName: 'Sage', streak: 18, courses: 4 },
  { username: 'marcus_johnson', email: 'marcus@mindshift.edu', xp: 3890, level: 6, levelName: 'Expert', streak: 15, courses: 3 },
  { username: 'emily_zhang', email: 'emily@mindshift.edu', xp: 3720, level: 6, levelName: 'Expert', streak: 12, courses: 3 },
  { username: 'noah_williams', email: 'noah@mindshift.edu', xp: 3450, level: 6, levelName: 'Expert', streak: 14, courses: 2 },
  { username: 'sofia_martinez', email: 'sofia@mindshift.edu', xp: 2890, level: 5, levelName: 'Scholar', streak: 10, courses: 2 },
  { username: 'liam_chen', email: 'liam@mindshift.edu', xp: 2380, level: 5, levelName: 'Scholar', streak: 6, courses: 1 },
  { username: 'ava_thompson', email: 'ava@mindshift.edu', xp: 1920, level: 4, levelName: 'Apprentice', streak: 9, courses: 1 },
  { username: 'oliver_brown', email: 'oliver@mindshift.edu', xp: 1780, level: 4, levelName: 'Apprentice', streak: 5, courses: 1 },
];

const MOCK_PASSWORD = bcrypt.hashSync('mockuser123', 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, username, email, password_hash, email_verified)
  VALUES (?, ?, ?, ?, 1)
`);

const upsertProgress = db.prepare(`
  INSERT INTO user_progress (user_id, total_learning_minutes, streak_days, streak_last_date, xp, level, level_name)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    total_learning_minutes = excluded.total_learning_minutes,
    streak_days = excluded.streak_days,
    xp = excluded.xp,
    level = excluded.level,
    level_name = excluded.level_name
`);

const insertEnrollment = db.prepare(`
  INSERT OR IGNORE INTO course_enrollments (user_id, course_id, progress_percent, status)
  VALUES (?, ?, 100, 'completed')
`);

const COURSE_IDS = ['ai-fundamentals', 'ml-fundamentals', 'deep-learning', 'nlp', 'cv', 'ethics', 'python-ai', 'rl'];

const seed = db.transaction(() => {
  for (const mock of MOCK_USERS) {
    const id = uuidv4();
    insertUser.run(id, mock.username, mock.email, MOCK_PASSWORD);

    // Check if user was actually inserted (not ignored due to duplicate)
    const user = stmts.findUserByEmail.get(mock.email);
    if (!user) continue;

    const minutes = Math.round(mock.xp * 0.6);
    const today = new Date().toISOString().split('T')[0];
    upsertProgress.run(user.id, minutes, mock.streak, today, mock.xp, mock.level, mock.levelName);

    // Add completed course enrollments
    for (let i = 0; i < mock.courses && i < COURSE_IDS.length; i++) {
      insertEnrollment.run(user.id, COURSE_IDS[i]);
    }
  }
});

seed();
console.log('Mock users seeded successfully.');
console.log('Users created: ' + MOCK_USERS.map(u => u.username).join(', '));
