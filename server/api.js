const express = require('express');
const { stmts, checkAchievements, updateStreak, ACHIEVEMENT_DEFS } = require('./db');
const { requireAuth, rateLimit } = require('./middleware');
const COURSE_DATA = require('../js/course-data');

const router = express.Router();

// All API routes require auth
router.use(requireAuth);

function summarizeEnrollment(userId, courseId) {
  const course = COURSE_DATA[courseId];
  const enrollment = stmts.getEnrollment.get(userId, courseId);
  const completedLessons = stmts.getCompletedLessons.all(userId, courseId);
  const completedCount = completedLessons.length;

  if (!course || !enrollment) {
    return {
      enrollment,
      completedCount,
      progressPercent: enrollment ? enrollment.progress_percent : 0,
      currentModule: enrollment ? enrollment.current_module : 1,
      status: enrollment ? enrollment.status : 'enrolled'
    };
  }

  const allLessons = [];
  course.modules.forEach((mod, modIdx) => {
    mod.lessons.forEach((lesson) => {
      allLessons.push({ id: lesson.id, moduleIndex: modIdx });
    });
  });

  const totalLessons = allLessons.length;
  const completedIds = new Set(completedLessons.map((lesson) => lesson.lesson_id));
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const firstIncomplete = allLessons.find((lesson) => !completedIds.has(lesson.id));
  const currentModule = firstIncomplete ? firstIncomplete.moduleIndex + 1 : Math.max(course.modules.length, 1);
  const status = completedCount === 0 ? 'enrolled' : progressPercent >= 100 ? 'completed' : 'active';

  return {
    enrollment,
    completedCount,
    progressPercent,
    currentModule,
    status
  };
}

// ============================================================
// GET /api/dashboard
// ============================================================
router.get('/dashboard', (req, res) => {
  const userId = req.user.userId;
  const progress = stmts.getProgress.get(userId) || { total_learning_minutes: 0, streak_days: 0, xp: 0, level: 1, level_name: 'Beginner' };
  const enrollments = stmts.getEnrollments.all(userId);
  const achievementCount = stmts.countAchievements.get(userId).count;
  const upcoming = stmts.getUpcomingSessions.all(userId, 5);
  const activity = stmts.getActivity.all(userId, 10);
  const notifications = stmts.getNotifications.all(userId, 5);
  const unreadCount = stmts.getUnreadCount.get(userId).count;

  // Build achievements list with earned status
  const earnedAch = stmts.getUserAchievements.all(userId);
  const earnedIds = earnedAch.map(a => a.achievement_id);
  const achievements = ACHIEVEMENT_DEFS.map(ach => ({
    id: ach.id, name: ach.name, description: ach.desc, category: ach.category, xp: ach.xp,
    earned: earnedIds.includes(ach.id)
  }));

  res.json({
    user: { username: req.user.username, email: req.user.email },
    progress,
    enrollments,
    achievements,
    achievementsEarned: achievementCount,
    achievementsTotal: ACHIEVEMENT_DEFS.length,
    upcomingSessions: upcoming,
    recentActivity: activity,
    notifications,
    unreadNotifications: unreadCount
  });
});

// ============================================================
// Courses
// ============================================================
router.get('/courses/enrollments', (req, res) => {
  const enrollments = stmts.getEnrollments.all(req.user.userId);
  res.json({ enrollments });
});

router.post('/courses/enroll', (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  stmts.enroll.run(req.user.userId, courseId);
  stmts.logActivity.run(req.user.userId, 'enroll', `Enrolled in course: ${courseId}`, 10);
  stmts.addXP.run(10, req.user.userId);

  // Check achievements
  const enrollments = stmts.getEnrollments.all(req.user.userId);
  const allLessons = stmts.getCompletedLessons ? [] : [];
  const ctx = buildAchievementContext(req.user.userId);
  const newAch = checkAchievements(req.user.userId, ctx);

  stmts.createNotification.run(req.user.userId, 'course', 'Course Enrolled', `You enrolled in a new course. +10 XP`);
  updateStreak(req.user.userId);

  res.json({ message: 'Enrolled', newAchievements: newAch.map(a => a.id) });
});

router.post('/courses/unenroll', (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });
  stmts.unenroll.run(req.user.userId, courseId);
  res.json({ message: 'Unenrolled' });
});

router.post('/courses/restart', (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });
  // Delete completed lessons for this course
  const { db } = require('./db');
  db.prepare('DELETE FROM completed_lessons WHERE user_id = ? AND course_id = ?').run(req.user.userId, courseId);
  // Reset enrollment progress
  stmts.updateCourseProgress.run(0, 1, 'enrolled', req.user.userId, courseId);
  stmts.logActivity.run(req.user.userId, 'restart', `Restarted course: ${courseId}`, 0);
  res.json({ message: 'Course restarted' });
});

router.post('/courses/progress', (req, res) => {
  const { courseId, progressPercent, currentModule, status } = req.body;
  if (!courseId) return res.status(400).json({ error: 'courseId required' });

  const pct = Math.min(100, Math.max(0, progressPercent || 0));
  const mod = currentModule || 1;
  const st = status || 'in-progress';

  stmts.updateCourseProgress.run(pct, mod, st, req.user.userId, courseId);

  if (st === 'completed') {
    stmts.logActivity.run(req.user.userId, 'course-complete', `Completed course: ${courseId}`, 200);
    stmts.addXP.run(200, req.user.userId);
    stmts.createNotification.run(req.user.userId, 'course', 'Course Completed!', `Congratulations! You completed a course. +200 XP`);
  }

  const ctx = buildAchievementContext(req.user.userId);
  const newAch = checkAchievements(req.user.userId, ctx);
  updateStreak(req.user.userId);

  res.json({ message: 'Progress updated', newAchievements: newAch.map(a => a.id) });
});

router.post('/courses/complete-lesson', (req, res) => {
  const { courseId, lessonId } = req.body;
  if (!courseId || !lessonId) return res.status(400).json({ error: 'courseId and lessonId required' });

  stmts.completeLesson.run(req.user.userId, courseId, lessonId);

  const xp = 25;
  stmts.addXP.run(xp, req.user.userId);
  stmts.logActivity.run(req.user.userId, 'lesson', `Completed lesson: ${lessonId}`, xp);

  // Add learning time (estimated 15 min per lesson)
  const progress = stmts.getProgress.get(req.user.userId);
  if (progress) {
    stmts.upsertProgress.run(
      req.user.userId,
      progress.total_learning_minutes + 15,
      progress.streak_days,
      progress.streak_last_date,
      progress.xp,
      progress.level,
      progress.level_name
    );
  }

  const ctx = buildAchievementContext(req.user.userId);
  const newAch = checkAchievements(req.user.userId, ctx);
  updateStreak(req.user.userId);

  const summary = summarizeEnrollment(req.user.userId, courseId);
  if (summary.enrollment) {
    stmts.updateCourseProgress.run(
      summary.progressPercent,
      summary.currentModule,
      summary.status,
      req.user.userId,
      courseId
    );
  }

  res.json({
    message: 'Lesson completed',
    xpEarned: xp,
    newAchievements: newAch.map(a => a.id),
    completedCount: summary.completedCount,
    progressPercent: summary.progressPercent,
    currentModule: summary.currentModule,
    status: summary.status,
    enrollment: {
      courseId,
      progressPercent: summary.progressPercent,
      currentModule: summary.currentModule,
      status: summary.status
    }
  });
});

router.post('/courses/uncomplete-lesson', (req, res) => {
  const { courseId, lessonId } = req.body;
  if (!courseId || !lessonId) return res.status(400).json({ error: 'courseId and lessonId required' });
  stmts.uncompleteLesson.run(req.user.userId, courseId, lessonId);

  const summary = summarizeEnrollment(req.user.userId, courseId);
  if (summary.enrollment) {
    stmts.updateCourseProgress.run(
      summary.progressPercent,
      summary.currentModule,
      summary.status,
      req.user.userId,
      courseId
    );
  }

  res.json({
    message: 'Lesson uncompleted',
    completedCount: summary.completedCount,
    progressPercent: summary.progressPercent,
    currentModule: summary.currentModule,
    status: summary.status,
    enrollment: {
      courseId,
      progressPercent: summary.progressPercent,
      currentModule: summary.currentModule,
      status: summary.status
    }
  });
});

router.get('/courses/:courseId/lessons', (req, res) => {
  const completed = stmts.getCompletedLessons.all(req.user.userId, req.params.courseId);
  res.json({ completedLessons: completed.map(l => l.lesson_id) });
});

// ============================================================
// Schedule
// ============================================================
router.get('/schedule', (req, res) => {
  const sessions = stmts.getUserSessions.all(req.user.userId);
  res.json({ sessions });
});

router.post('/schedule/book', (req, res) => {
  const { sessionType, title, tutorName, groupName, sessionDate, startTime, endTime, notes } = req.body;
  if (!sessionType || !title || !sessionDate || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = stmts.createSession.run(
    req.user.userId, sessionType, title, tutorName || null, groupName || null,
    sessionDate, startTime, endTime, notes || ''
  );

  stmts.logActivity.run(req.user.userId, 'booking', `Booked: ${title}`, 15);
  stmts.addXP.run(15, req.user.userId);

  const ctx = buildAchievementContext(req.user.userId);
  checkAchievements(req.user.userId, ctx);

  if (stmts.getSettings.get(req.user.userId)?.notif_sessions) {
    stmts.createNotification.run(req.user.userId, 'session', 'Session Booked', `"${title}" on ${sessionDate} at ${startTime}`);
  }

  res.json({ message: 'Session booked', sessionId: result.lastInsertRowid });
});

router.delete('/schedule/:id', (req, res) => {
  stmts.deleteSession.run(req.params.id, req.user.userId);
  res.json({ message: 'Session cancelled' });
});

// ============================================================
// Achievements
// ============================================================
router.get('/achievements', (req, res) => {
  const earned = stmts.getUserAchievements.all(req.user.userId);
  const earnedIds = earned.map(a => a.achievement_id);
  const earnedMap = {};
  earned.forEach(a => { earnedMap[a.achievement_id] = a.earned_at; });

  const progress = stmts.getProgress.get(req.user.userId) || { xp: 0, level: 1, level_name: 'Beginner' };
  const ctx = buildAchievementContext(req.user.userId);

  const all = ACHIEVEMENT_DEFS.map(ach => ({
    id: ach.id,
    name: ach.name,
    description: ach.desc,
    category: ach.category,
    xp: ach.xp,
    earned: earnedIds.includes(ach.id),
    earnedAt: earnedMap[ach.id] || null,
    progressPercent: earnedIds.includes(ach.id) ? 100 : getAchievementProgress(ach, ctx)
  }));

  res.json({
    achievements: all,
    earned: earnedIds.length,
    total: ACHIEVEMENT_DEFS.length,
    xp: progress.xp,
    level: progress.level,
    levelName: progress.level_name
  });
});

// ============================================================
// Notifications
// ============================================================
router.get('/notifications', (req, res) => {
  const notifications = stmts.getNotifications.all(req.user.userId, 20);
  const unread = stmts.getUnreadCount.get(req.user.userId).count;
  res.json({ notifications, unreadCount: unread });
});

router.post('/notifications/read/:id', (req, res) => {
  stmts.markNotificationRead.run(req.params.id, req.user.userId);
  res.json({ message: 'Marked as read' });
});

router.post('/notifications/read-all', (req, res) => {
  stmts.markAllRead.run(req.user.userId);
  res.json({ message: 'All marked as read' });
});

// ============================================================
// Settings
// ============================================================
router.get('/settings', (req, res) => {
  const settings = stmts.getSettings.get(req.user.userId);
  res.json({ settings: settings || { theme: 'light', text_size: 16, high_contrast: 0, notif_sessions: 1, notif_achievements: 1, notif_leaderboard: 0 } });
});

router.put('/settings', (req, res) => {
  const { theme, textSize, highContrast, notifSessions, notifAchievements, notifLeaderboard } = req.body;
  stmts.upsertSettings.run(
    req.user.userId,
    theme || 'light',
    textSize || 16,
    highContrast ? 1 : 0,
    notifSessions ? 1 : 0,
    notifAchievements ? 1 : 0,
    notifLeaderboard ? 1 : 0
  );
  res.json({ message: 'Settings saved' });
});

// ============================================================
// Profile
// ============================================================
router.put('/profile', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-24 characters (letters, numbers, underscores).' });
  }
  // Check uniqueness
  const existing = stmts.findUserByUsername.get(username);
  if (existing && existing.id !== req.user.userId) {
    return res.status(409).json({ error: 'Username already taken.' });
  }
  stmts.updateUsername.run(username, req.user.userId);
  res.json({ message: 'Profile updated', username });
});

// ============================================================
// Reset All Progress
// ============================================================
router.post('/reset-progress', (req, res) => {
  const userId = req.user.userId;
  const { db } = require('./db');
  db.prepare('DELETE FROM course_enrollments WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM completed_lessons WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM achievements WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM scheduled_sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM activity_log WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM friends WHERE user_id = ?').run(userId);
  stmts.upsertProgress.run(userId, 0, 0, null, 0, 1, 'Beginner');
  stmts.createNotification.run(userId, 'system', 'Progress Reset', 'All your progress has been reset. Start fresh!');
  res.json({ message: 'All progress reset' });
});

// ============================================================
// Leaderboard
// ============================================================
router.get('/leaderboard', (req, res) => {
  const top = stmts.getLeaderboard.all(10);
  const userProgress = stmts.getProgress.get(req.user.userId) || { xp: 0, level: 1, level_name: 'Beginner', streak_days: 0 };

  // Ensure current user appears in the leaderboard
  const userInList = top.some(u => u.id === req.user.userId);
  if (!userInList) {
    const coursesCompleted = stmts.getEnrollments.all(req.user.userId).filter(e => e.status === 'completed').length;
    top.push({
      id: req.user.userId,
      username: req.user.username,
      xp: userProgress.xp || 0,
      level: userProgress.level || 1,
      level_name: userProgress.level_name || 'Beginner',
      streak_days: userProgress.streak_days || 0,
      courses_completed: coursesCompleted
    });
    top.sort((a, b) => (b.xp || 0) - (a.xp || 0));
  }

  // Find user's rank
  const userRank = top.findIndex(u => u.id === req.user.userId) + 1;

  res.json({
    leaderboard: top.slice(0, 10),
    currentUser: {
      id: req.user.userId,
      username: req.user.username,
      rank: userRank,
      ...userProgress
    }
  });
});

// ============================================================
// Friends
// ============================================================
router.get('/friends', (req, res) => {
  const friends = stmts.getFriends.all(req.user.userId);
  res.json({ friends });
});

router.post('/friends/add', (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'friendId required' });
  stmts.addFriend.run(req.user.userId, friendId);

  const ctx = buildAchievementContext(req.user.userId);
  checkAchievements(req.user.userId, ctx);

  res.json({ message: 'Friend added' });
});

router.delete('/friends/:friendId', (req, res) => {
  stmts.removeFriend.run(req.user.userId, req.params.friendId);
  res.json({ message: 'Friend removed' });
});

// ============================================================
// Activity
// ============================================================
router.get('/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const activity = stmts.getActivity.all(req.user.userId, Math.min(limit, 50));
  res.json({ activity });
});

router.post('/activity/log', (req, res) => {
  const { action, detail, minutes } = req.body;
  const xp = minutes ? Math.floor(minutes / 3) : 5;

  stmts.logActivity.run(req.user.userId, action || 'activity', detail || '', xp);
  stmts.addXP.run(xp, req.user.userId);

  // Add learning time
  if (minutes) {
    const progress = stmts.getProgress.get(req.user.userId);
    if (progress) {
      stmts.upsertProgress.run(
        req.user.userId,
        progress.total_learning_minutes + minutes,
        progress.streak_days, progress.streak_last_date,
        progress.xp, progress.level, progress.level_name
      );
    }
  }

  updateStreak(req.user.userId);
  const ctx = buildAchievementContext(req.user.userId);
  checkAchievements(req.user.userId, ctx);

  res.json({ message: 'Logged', xpEarned: xp });
});

// ============================================================
// Helper: build achievement context for a user
// ============================================================
function buildAchievementContext(userId) {
  const db = require('./db');
  const enrollments = stmts.getEnrollments.all(userId);
  const achievementsEarned = stmts.getUserAchievements.all(userId);
  const sessions = stmts.getUserSessions.all(userId);
  const progress = stmts.getProgress.get(userId) || {};
  const friends = stmts.getFriends.all(userId);

  // Count all completed lessons across courses
  let totalLessons = 0;
  for (const e of enrollments) {
    const lessons = stmts.getCompletedLessons.all(userId, e.course_id);
    totalLessons += lessons.length;
  }

  return {
    lessonsCompleted: totalLessons,
    coursesEnrolled: enrollments.length,
    coursesCompleted: enrollments.filter(e => e.status === 'completed').length,
    advancedCompleted: 0, // would need course metadata
    quizzesPassed: 0,
    perfectQuizzes: 0,
    sessionsAttended: sessions.length,
    groupSessions: sessions.filter(s => s.session_type === 'group-study').length,
    friendCount: friends.length,
    studentsHelped: 0,
    streak: progress.streak_days || 0,
    earlyLesson: false,
    marathonSession: false,
  };
}

function getAchievementProgress(ach, ctx) {
  // Return estimated progress percentage for locked achievements
  const mapping = {
    'first-steps': Math.min(100, (ctx.lessonsCompleted / 1) * 100),
    'quick-learner': Math.min(100, (ctx.lessonsCompleted / 5) * 100),
    'bookworm': Math.min(100, (ctx.lessonsCompleted / 20) * 100),
    'explorer': Math.min(100, (ctx.coursesEnrolled / 3) * 100),
    'quiz-master': Math.min(100, (ctx.quizzesPassed / 10) * 100),
    'course-complete': Math.min(100, (ctx.coursesCompleted / 1) * 100),
    'deep-diver': Math.min(100, (ctx.advancedCompleted / 1) * 100),
    'scholar': Math.min(100, (ctx.coursesCompleted / 5) * 100),
    'perfectionist': Math.min(100, (ctx.perfectQuizzes / 5) * 100),
    'team-player': Math.min(100, (ctx.sessionsAttended / 3) * 100),
    'helping-hand': Math.min(100, (ctx.sessionsAttended / 10) * 100),
    'discussion-leader': Math.min(100, (ctx.groupSessions / 3) * 100),
    'social-butterfly': Math.min(100, (ctx.friendCount / 5) * 100),
    'mentor': Math.min(100, (ctx.studentsHelped / 10) * 100),
    'consistent': Math.min(100, (ctx.streak / 7) * 100),
    'unstoppable': Math.min(100, (ctx.streak / 30) * 100),
    'early-bird': 0,
    'marathon': 0,
  };
  return Math.round(mapping[ach.id] || 0);
}

module.exports = router;
