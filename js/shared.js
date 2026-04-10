/* ============================================================
   MindShift — Shared JavaScript v2
   Navigation, dark mode, settings, animations, utilities
   ============================================================ */

// Demo responsive toggle: Cmd+M = mobile, Cmd+B = tablet, Cmd+Z = desktop
(function() {
  var demoOverlay = null;

  function closeDemoPreview() {
    if (demoOverlay) {
      demoOverlay.remove();
      demoOverlay = null;
      document.body.style.overflow = '';
    }
  }

  function openDemoPreview(deviceWidth, deviceHeight, label) {
    closeDemoPreview();

    demoOverlay = document.createElement('div');
    demoOverlay.id = 'demo-responsive-overlay';
    demoOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';

    // Scale iframe to fit in viewport if device is larger than screen
    var viewW = window.innerWidth - 80;
    var viewH = window.innerHeight - 80;
    var scale = Math.min(1, viewW / deviceWidth, viewH / deviceHeight);

    demoOverlay.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;">' +
        '<div style="display:flex;align-items:center;gap:16px;">' +
          '<span style="font-size:14px;font-weight:600;color:white;">' + label + ' (' + deviceWidth + ' x ' + deviceHeight + ')</span>' +
          '<button onclick="document.getElementById(\'demo-responsive-overlay\').remove();document.body.style.overflow=\'\';" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-size:13px;color:white;padding:4px 12px;">Close (Cmd+Z)</button>' +
        '</div>' +
        '<div style="width:' + deviceWidth + 'px;height:' + deviceHeight + 'px;border-radius:20px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,0.4);border:3px solid rgba(255,255,255,0.15);transform:scale(' + scale + ');transform-origin:top center;">' +
          '<iframe src="' + window.location.href + '" style="width:' + deviceWidth + 'px;height:' + deviceHeight + 'px;border:none;background:white;"></iframe>' +
        '</div>' +
      '</div>';

    document.body.appendChild(demoOverlay);
    document.body.style.overflow = 'hidden';

    demoOverlay.addEventListener('click', function(ev) {
      if (ev.target === demoOverlay) closeDemoPreview();
    });
  }

  document.addEventListener('keydown', function(e) {
    if (!e.metaKey && !e.ctrlKey) return;
    var key = e.key.toLowerCase();
    if (key !== 'm' && key !== 'b' && key !== 'z') return;

    e.preventDefault();
    e.stopPropagation();

    if (key === 'z') {
      closeDemoPreview();
      showToast('Desktop view');
    } else if (key === 'm') {
      openDemoPreview(375, 812, 'iPhone');
      showToast('Mobile preview');
    } else if (key === 'b') {
      openDemoPreview(1024, 768, 'iPad');
      showToast('Tablet preview');
    }
  });
})();

// Load Tidio chatbot
(function() {
  if (!document.querySelector('script[src*="tidio.co"]')) {
    var s = document.createElement('script');
    s.src = '//code.tidio.co/nrzwtff96awg6dmuvx7ezecruxg2izbt.js';
    s.async = true;
    document.body.appendChild(s);
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTextSize();
  initHighContrast();
  initSidebar();
  initMobileNav();
  initTabs();
  initFilterChips();
  initAnimations();
  setActiveNavItem();
  initRipple();
});


/* --- Theme (Dark/Light Mode) --- */
function initTheme() {
  const saved = localStorage.getItem('mindshift-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mindshift-theme', theme);
  // Update any toggle switches on the page
  document.querySelectorAll('[data-setting="theme"]').forEach(el => {
    el.checked = theme === 'dark';
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function isDarkMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}


/* --- Text Size --- */
function initTextSize() {
  const saved = localStorage.getItem('mindshift-text-size');
  if (saved) {
    document.documentElement.style.fontSize = saved + 'px';
  }
}

function setTextSize(size) {
  const clamped = Math.max(14, Math.min(22, size));
  document.documentElement.style.fontSize = clamped + 'px';
  localStorage.setItem('mindshift-text-size', clamped);
}

function getTextSize() {
  return parseInt(localStorage.getItem('mindshift-text-size') || '16');
}


/* --- High Contrast --- */
function initHighContrast() {
  const hc = localStorage.getItem('mindshift-high-contrast');
  if (hc === '1' || hc === 'true') {
    document.documentElement.classList.add('high-contrast');
  }
}

/* --- Sidebar Toggle (Mobile) --- */
function initSidebar() {
  const toggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');

  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('visible');
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('visible');
    }
  });

  // Apply profile pic after topbar is rendered
  applyUserProfilePic();
}


/* --- Mobile Public Nav --- */
function initMobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', links.classList.contains('open'));
  });
}


/* --- Active Nav Item --- */
function setActiveNavItem() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href');
    if (!href) return;
    const hrefPage = href.split('/').pop().split('?')[0];
    if (hrefPage === currentPage) {
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
    } else {
      item.classList.remove('active');
      item.removeAttribute('aria-current');
    }
  });
}


/* --- Tab Switching --- */
function initTabs() {
  document.querySelectorAll('.tab-bar').forEach(bar => {
    const tabs = bar.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        const targetId = tab.dataset.tab;
        if (targetId) {
          const container = bar.closest('.tab-container') || bar.parentElement;
          container.querySelectorAll('.tab-panel').forEach(panel => {
            if (panel.id === targetId) {
              panel.hidden = false;
              panel.style.animation = 'fadeInUp 0.35s var(--ease-out) both';
            } else {
              panel.hidden = true;
              panel.style.animation = '';
            }
          });
        }
      });
    });
  });
}


/* --- Filter Chips --- */
function initFilterChips() {
  document.querySelectorAll('.filter-group').forEach(group => {
    const chips = group.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (!group.dataset.multi) {
          chips.forEach(c => c.classList.remove('active'));
        }
        chip.classList.toggle('active');
      });
    });
  });
}


/* --- Scroll Animations --- */
function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-animate]').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
}


/* --- Button Ripple Effect --- */
function initRipple() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    btn.style.setProperty('--ripple-x', x + '%');
    btn.style.setProperty('--ripple-y', y + '%');
  });
}


/* --- Toast Notification --- */
function showToast(message, duration = 2500) {
  showXPBanner(message, duration);
}

/* --- XP / Achievement Banner with Confetti --- */
function showXPBanner(message, duration) {
  duration = duration || 3000;
  // Remove existing banner
  var old = document.getElementById('xp-banner');
  if (old) old.remove();

  var banner = document.createElement('div');
  banner.id = 'xp-banner';
  banner.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%) translateY(-100%);z-index:10000;padding:14px 32px;background:linear-gradient(135deg,#2563EB,#1D4FD7);color:white;border-radius:0 0 16px 16px;font-size:15px;font-weight:600;font-family:Inter,sans-serif;box-shadow:0 8px 32px rgba(37,99,235,0.35);text-align:center;transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1);max-width:90vw;';
  banner.textContent = message;
  document.body.appendChild(banner);

  // Slide in
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      banner.style.transform = 'translateX(-50%) translateY(0)';
    });
  });

  // Spawn confetti
  spawnConfetti();

  // Slide out
  setTimeout(function() {
    banner.style.transform = 'translateX(-50%) translateY(-100%)';
    setTimeout(function() { banner.remove(); }, 500);
  }, duration);
}

function spawnConfetti() {
  var colors = ['#2563EB','#3B82F6','#60A5FA','#F59E0B','#FBBF24','#10B981','#34D399','#8B5CF6','#A78BFA','#EC4899'];
  var container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:0;z-index:9999;pointer-events:none;overflow:visible;';
  document.body.appendChild(container);

  for (var i = 0; i < 40; i++) {
    var piece = document.createElement('div');
    var color = colors[Math.floor(Math.random() * colors.length)];
    var left = Math.random() * 100;
    var size = 6 + Math.random() * 6;
    var delay = Math.random() * 0.4;
    var duration = 1.5 + Math.random() * 1.5;
    var rotation = Math.random() * 360;
    var drift = (Math.random() - 0.5) * 120;
    var shape = Math.random() > 0.5 ? '50%' : '2px';

    piece.style.cssText = 'position:absolute;top:-10px;left:' + left + '%;width:' + size + 'px;height:' + size + 'px;background:' + color + ';border-radius:' + shape + ';opacity:1;transform:rotate(' + rotation + 'deg);animation:confettiFall ' + duration + 's ease-out ' + delay + 's forwards;';
    container.appendChild(piece);
  }

  // Add keyframes if not present
  if (!document.getElementById('confetti-style')) {
    var style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = '@keyframes confettiFall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg) translateX(var(--drift, 0px)); opacity: 0; } }';
    document.head.appendChild(style);
  }

  // Cleanup
  setTimeout(function() { container.remove(); }, 4000);
}


/* --- Utility: Format relative time --- */
function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

/* --- Notifications --- */
var _notifOpen = false;
async function toggleNotifPanel() {
  var panel = document.getElementById('notif-panel');
  if (!panel) return;
  _notifOpen = !_notifOpen;
  panel.style.display = _notifOpen ? 'block' : 'none';
  if (_notifOpen) await loadNotifications();
}

async function loadNotifications() {
  if (typeof API === 'undefined') return;
  var res = await API.getNotifications();
  var list = document.getElementById('notif-list');
  var badge = document.getElementById('notif-badge');
  if (!list || !res || res.error) return;

  var notifs = res.notifications || [];
  if (badge) badge.style.display = res.unreadCount > 0 ? 'block' : 'none';

  if (notifs.length === 0) {
    list.innerHTML = '<div style="padding:var(--space-6);color:var(--color-text-tertiary);font-size:var(--text-sm);text-align:center;">No notifications yet</div>';
    return;
  }
  var html = '';
  notifs.forEach(function(n) {
    var bg = n.read ? '' : 'background:var(--color-accent-blue-light);';
    html += '<div style="padding:var(--space-3) var(--space-5);border-bottom:1px solid var(--color-border-light);' + bg + 'cursor:pointer;" onclick="event.stopPropagation(); markNotifRead(' + n.id + ', this)">' +
      '<div style="font-size:var(--text-sm);font-weight:600;color:var(--color-text-primary);margin-bottom:2px;">' + (n.title || '') + '</div>' +
      '<div style="font-size:var(--text-xs);color:var(--color-text-secondary);line-height:1.4;">' + (n.message || '') + '</div>' +
      '<div style="font-size:10px;color:var(--color-text-tertiary);margin-top:4px;">' + timeAgo(n.created_at) + '</div>' +
    '</div>';
  });
  list.innerHTML = html;
}

async function markNotifRead(id, el) {
  if (typeof API !== 'undefined') await API.markNotificationRead(id);
  if (el) el.style.background = '';
}

async function markAllNotifRead() {
  if (typeof API !== 'undefined') await API.markAllNotificationsRead();
  await loadNotifications();
  var badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = 'none';
  showToast('All notifications marked as read');
}

// Close panel on outside click
document.addEventListener('click', function(e) {
  if (_notifOpen && !e.target.closest('.notif-wrapper')) {
    var panel = document.getElementById('notif-panel');
    if (panel) panel.style.display = 'none';
    _notifOpen = false;
  }
});

// Load notification badge count on page load
document.addEventListener('DOMContentLoaded', async function() {
  if (typeof API === 'undefined') return;
  try {
    var res = await API.getNotifications();
    var badge = document.getElementById('notif-badge');
    if (badge && res && res.unreadCount > 0) badge.style.display = 'block';
  } catch(e) {}
});

/* --- Profile Menu --- */
var _profileOpen = false;

function toggleProfileMenu() {
  var menu = document.getElementById('profile-menu');
  if (!menu) return;
  _profileOpen = !_profileOpen;
  menu.style.display = _profileOpen ? 'block' : 'none';
  if (_profileOpen) populateProfileMenu();
}

async function populateProfileMenu() {
  if (typeof API === 'undefined') return;
  try {
    var res = await API.me();
    if (res && res.user) {
      var name = res.user.username || 'User';
      var email = res.user.email || '';
      var initials = getInitials(name);
      var nameEl = document.getElementById('profile-menu-name');
      var emailEl = document.getElementById('profile-menu-email');
      var initialsEl = document.getElementById('profile-menu-initials');
      var avatarEl = document.getElementById('profile-avatar');
      if (nameEl) nameEl.textContent = name;
      if (emailEl) emailEl.textContent = email;
      if (initialsEl) initialsEl.textContent = initials;
      if (avatarEl) avatarEl.textContent = initials;
    }
  } catch(e) {}

  // Restore saved profile pic
  var savedPic = localStorage.getItem('mindshift-profile-pic');
  if (savedPic) {
    applyProfilePic(savedPic);
  }
}

function handleProfilePicChange(input) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    localStorage.setItem('mindshift-profile-pic', dataUrl);
    applyProfilePic(dataUrl);
    showToast('Profile picture updated!');
  };
  reader.readAsDataURL(input.files[0]);
}

function applyProfilePic(dataUrl) {
  // Profile menu avatar
  var img = document.getElementById('profile-menu-img');
  var initials = document.getElementById('profile-menu-initials');
  if (img) { img.src = dataUrl; img.style.display = 'block'; }
  if (initials) initials.style.display = 'none';

  // Topbar avatar
  var avatar = document.getElementById('profile-avatar');
  if (avatar) {
    avatar.style.backgroundImage = 'url(' + dataUrl + ')';
    avatar.style.backgroundSize = 'cover';
    avatar.style.backgroundPosition = 'center';
    avatar.textContent = '';
  }

  // All user avatars marked with data-user-avatar
  document.querySelectorAll('[data-user-avatar]').forEach(function(el) {
    el.style.backgroundImage = 'url(' + dataUrl + ')';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  });
}

// Call this after dynamically rendering content that includes user avatars
function applyUserProfilePic() {
  var savedPic = localStorage.getItem('mindshift-profile-pic');
  if (savedPic) applyProfilePic(savedPic);
}

// Close profile menu on outside click
document.addEventListener('click', function(e) {
  if (_profileOpen && !e.target.closest('.profile-wrapper')) {
    var menu = document.getElementById('profile-menu');
    if (menu) menu.style.display = 'none';
    _profileOpen = false;
  }
});

// Restore profile pic on page load
document.addEventListener('DOMContentLoaded', function() {
  var savedPic = localStorage.getItem('mindshift-profile-pic');
  if (savedPic) {
    // Small delay to let topbar render
    setTimeout(function() { applyProfilePic(savedPic); }, 100);
  }
});

/* --- Sign Out Handler --- */
async function handleSignOut() {
  if (typeof API !== 'undefined') {
    await API.logout();
  }
  sessionStorage.removeItem('mindshift_active');
  window.location.href = '../index.html';
}


/* --- Save/Load User Progress --- */
function saveProgress(key, data) {
  localStorage.setItem('mindshift-' + key, JSON.stringify(data));
}

function loadProgress(key, fallback) {
  try {
    const data = localStorage.getItem('mindshift-' + key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}


/* --- Sidebar HTML Generator --- */
function renderSidebar() {
  return `
    <div class="sidebar-overlay"></div>
    <aside class="sidebar" role="navigation" aria-label="Main navigation">
      <a href="dashboard.html" class="sidebar-logo">
        <img src="../assets/logo.png" alt="MindShift" style="height:30px;width:auto;">
        <span>MindShift</span>
      </a>

      <nav class="sidebar-nav">
        <div class="sidebar-section-label">Learn</div>
        <a href="dashboard.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          Dashboard
        </a>
        <a href="courses.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          Courses
        </a>
        <a href="schedule.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Schedule
        </a>
        <a href="tutors.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Tutors
        </a>

        <div class="sidebar-section-label">Progress</div>
        <a href="achievements.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
          Achievements
        </a>
        <a href="leaderboard.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Leaderboard
        </a>

        <div class="sidebar-section-label">More</div>
        <a href="about.html?app=1" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          About Us
        </a>
        <a href="contact.html?app=1" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Contact Us
        </a>
        <a href="settings.html" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          Settings
        </a>
      </nav>

      <div class="sidebar-footer">
        <button class="nav-item" onclick="handleSignOut()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
    </aside>
  `;
}


/* --- Topbar HTML Generator --- */
function renderTopbar(title) {
  return `
    <header class="topbar" role="banner">
      <div class="topbar-left">
        <button class="btn btn-icon btn-ghost sidebar-toggle nav-toggle" aria-label="Toggle navigation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
      <div class="topbar-right">
        <button class="btn btn-icon btn-ghost" aria-label="Toggle dark mode" onclick="toggleTheme()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        </button>
        <div class="notif-wrapper" style="position:relative;">
          <button class="btn btn-icon btn-ghost notif-btn" aria-label="Notifications" onclick="toggleNotifPanel()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            <span class="notif-badge" id="notif-badge" style="display:none;position:absolute;top:4px;right:4px;width:8px;height:8px;background:var(--color-error);border-radius:50%;"></span>
          </button>
          <div class="notif-panel" id="notif-panel" style="display:none;position:absolute;top:calc(100% + 8px);right:0;width:340px;max-height:400px;overflow-y:auto;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);z-index:200;">
            <div style="padding:var(--space-4) var(--space-5);border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:var(--text-md);">Notifications</strong>
              <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); markAllNotifRead();" style="font-size:var(--text-xs);">Mark all read</button>
            </div>
            <div id="notif-list" style="padding:var(--space-2) 0;">
              <div style="padding:var(--space-4) var(--space-5);color:var(--color-text-tertiary);font-size:var(--text-sm);text-align:center;">Loading...</div>
            </div>
          </div>
        </div>
        <div class="profile-wrapper" style="position:relative;">
          <button class="avatar profile-trigger" aria-label="Profile menu" onclick="toggleProfileMenu()" id="profile-avatar">JD</button>
          <div class="profile-menu" id="profile-menu" style="display:none;position:absolute;top:calc(100% + 8px);right:0;width:260px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);z-index:200;overflow:hidden;">
            <div style="padding:var(--space-5);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:var(--space-3);">
              <div class="avatar avatar-lg" id="profile-menu-avatar" style="cursor:pointer;position:relative;" onclick="document.getElementById('profile-pic-input').click()">
                <span id="profile-menu-initials">JD</span>
                <img id="profile-menu-img" style="display:none;width:100%;height:100%;object-fit:cover;border-radius:50%;position:absolute;inset:0;" alt="">
                <div style="position:absolute;inset:0;background:rgba(0,0,0,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.15s;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
              </div>
              <input type="file" id="profile-pic-input" accept="image/*" style="display:none;" onchange="handleProfilePicChange(this)">
              <div>
                <div id="profile-menu-name" style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--color-text-primary);">User</div>
                <div id="profile-menu-email" style="font-size:var(--text-xs);color:var(--color-text-tertiary);">user@email.com</div>
              </div>
            </div>
            <div style="padding:var(--space-2);">
              <a href="settings.html" class="profile-menu-item" style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);font-size:var(--text-sm);color:var(--color-text-secondary);text-decoration:none;border-radius:var(--radius-md);transition:background 0.15s,color 0.15s;" onmouseenter="this.style.background='var(--color-accent-blue-light)';this.style.color='var(--color-text-primary)'" onmouseleave="this.style.background='';this.style.color='var(--color-text-secondary)'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                Settings
              </a>
              <button class="profile-menu-item" onclick="handleSignOut()" style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);font-size:var(--text-sm);color:var(--color-error);text-decoration:none;border-radius:var(--radius-md);transition:background 0.15s;width:100%;border:none;background:none;cursor:pointer;text-align:left;" onmouseenter="this.style.background='var(--color-error-bg)'" onmouseleave="this.style.background=''">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}
 