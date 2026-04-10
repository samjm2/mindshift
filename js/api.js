/* ============================================================
   MindShift — Frontend API Client
   All API calls go through this module
   ============================================================ */

const API = {
  // ---- Auth ----
  async signup(username, email, password) {
    return this._post('/api/auth/signup', { username, email, password });
  },

  async login(email, password) {
    const res = await this._post('/api/auth/login', { email, password });
    if (res.user) {
      sessionStorage.setItem('mindshift_active', '1');
    }
    return res;
  },

  async logout() {
    const res = await this._post('/api/auth/logout', {});
    sessionStorage.removeItem('mindshift_active');
    return res;
  },

  async me() {
    return this._get('/api/auth/me');
  },

  // ---- Dashboard ----
  async getDashboard() {
    return this._get('/api/dashboard');
  },

  // ---- Courses ----
  async getEnrollments() {
    return this._get('/api/courses/enrollments');
  },

  async enroll(courseId) {
    return this._post('/api/courses/enroll', { courseId });
  },

  async restartCourse(courseId) {
    return this._post('/api/courses/restart', { courseId });
  },

  async unenroll(courseId) {
    return this._post('/api/courses/unenroll', { courseId });
  },

  async updateCourseProgress(courseId, progressPercent, currentModule, status) {
    return this._post('/api/courses/progress', { courseId, progressPercent, currentModule, status });
  },

  async completeLesson(courseId, lessonId) {
    return this._post('/api/courses/complete-lesson', { courseId, lessonId });
  },

  async uncompleteLesson(courseId, lessonId) {
    return this._post('/api/courses/uncomplete-lesson', { courseId, lessonId });
  },

  async getCompletedLessons(courseId) {
    return this._get(`/api/courses/${courseId}/lessons`);
  },

  // ---- Schedule ----
  async getSchedule() {
    return this._get('/api/schedule');
  },

  async bookSession(data) {
    return this._post('/api/schedule/book', data);
  },

  async cancelSession(id) {
    return this._delete(`/api/schedule/${id}`);
  },

  // ---- Achievements ----
  async getAchievements() {
    return this._get('/api/achievements');
  },

  // ---- Notifications ----
  async getNotifications() {
    return this._get('/api/notifications');
  },

  async markNotificationRead(id) {
    return this._post(`/api/notifications/read/${id}`, {});
  },

  async markAllNotificationsRead() {
    return this._post('/api/notifications/read-all', {});
  },

  // ---- Settings ----
  async getSettings() {
    return this._get('/api/settings');
  },

  async saveSettings(settings) {
    return this._put('/api/settings', settings);
  },

  // ---- Profile ----
  async updateProfile(username) {
    return this._put('/api/profile', { username });
  },

  async resetProgress() {
    return this._post('/api/reset-progress', {});
  },

  // ---- Leaderboard ----
  async getLeaderboard() {
    return this._get('/api/leaderboard');
  },

  // ---- Friends ----
  async getFriends() {
    return this._get('/api/friends');
  },

  async addFriend(friendId) {
    return this._post('/api/friends/add', { friendId });
  },

  async removeFriend(friendId) {
    return this._delete(`/api/friends/${friendId}`);
  },

  // ---- Activity ----
  async getActivity(limit = 10) {
    return this._get(`/api/activity?limit=${limit}`);
  },

  async logActivity(action, detail, minutes) {
    return this._post('/api/activity/log', { action, detail, minutes });
  },

  // ---- Internal helpers ----
  async _get(url) {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (res.status === 401) {
        this._handleUnauth();
        return { error: 'Not authenticated' };
      }
      return res.json();
    } catch (err) {
      console.error('API GET error:', err);
      return { error: 'Network error' };
    }
  },

  async _post(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (res.status === 401) {
        this._handleUnauth();
      }
      data._status = res.status;
      return data;
    } catch (err) {
      console.error('API POST error:', err);
      return { error: 'Network error' };
    }
  },

  async _put(url, body) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin'
      });
      return res.json();
    } catch (err) {
      console.error('API PUT error:', err);
      return { error: 'Network error' };
    }
  },

  async _delete(url) {
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      return res.json();
    } catch (err) {
      console.error('API DELETE error:', err);
      return { error: 'Network error' };
    }
  },

  _handleUnauth() {
    // If we're on a protected page, redirect to login
    const page = window.location.pathname;
    const publicPages = ['/', '/index.html', '/pages/login.html', '/pages/about.html', '/pages/contact.html'];
    if (!publicPages.some(p => page.endsWith(p))) {
      window.location.href = '/pages/login.html';
    }
  }
};

// ---- Auth guard for protected pages ----
async function requireLogin() {
  const res = await API.me();
  if (res.error || !res.user) {
    window.location.href = '/pages/login.html';
    return null;
  }
  return res.user;
}

// ---- Shared device protection ----
(function() {
  const active = sessionStorage.getItem('mindshift_active');
  const page = window.location.pathname;
  const publicPages = ['/', '/index.html', '/pages/login.html', '/pages/about.html', '/pages/contact.html'];
  const isPublic = publicPages.some(p => page.endsWith(p));

  if (!isPublic && !active) {
    // Could be a new tab on shared device — verify session
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(r => {
        if (r.status === 401) {
          window.location.href = '/pages/login.html';
        } else {
          sessionStorage.setItem('mindshift_active', '1');
        }
      })
      .catch(() => {});
  }
})();
