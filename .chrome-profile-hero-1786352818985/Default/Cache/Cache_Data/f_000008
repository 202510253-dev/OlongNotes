/**
 * OlongNotes — Landing Page UI Interactions
 * Phase 5 wired: real auth (login / signup / logout) + upload to
 * POST /api/notes via the api.js helper. The dev role switcher is
 * gone — role is now resolved from the JWT + cached user in
 * localStorage (see resolveRole() below).
 *
 * ===========================================================
 * HOW THE ROLE IS DECIDED (see resolveRole() below)
 * ===========================================================
 * Resolved on every page load. Returns 'user' only if BOTH a token
 *   - 'olongnotes_token' (set by login via api.js setToken)
 *   - 'olongnotes_user'  (cached user object, set right after login)
 * exist in localStorage. Missing either → viewer. The token is NOT
 * validated client-side — first protected API call will return 401
 * and the auth flow handles it.
 *
 * Everything role-specific lives inside applyRole(role) — that's
 * the ONLY function that knows what a viewer vs. a user sees.
 */

/* -----------------------------------------------------
   Featured Notes
   Loaded from GET /api/notes?limit=4 on page load.
   Falls back to FEATURED_NOTES if the API is unreachable
   so the page still renders during local dev / outages.
----------------------------------------------------- */
const FEATURED_NOTES = [
  { title: 'General Mathematics Reviewer', school: 'Olongapo City National High School', grade: 'Grade 11', subject: 'Math', likes: 312, downloads: 1225 },
  { title: 'INTRO TO PHILOSOPHY Notes', school: 'Olongapo City National High School', grade: 'Grade 12', subject: 'Philosophy', likes: 264, downloads: 989 },
  { title: 'Statistics Problem Set', school: 'Rizal High School', grade: 'Grade 12', subject: 'Statistics', likes: 198, downloads: 845 },
  { title: 'Earth Science Diagrams', school: 'Subic Bay National High School', grade: 'Grade 11', subject: 'Science', likes: 151, downloads: 685 },
];

const UNIFIED_TINT = '#4a5c82';
// Every subject currently maps to the same tint, so a Proxy/default
// lookup replaces the 20-key object — same result, one line.
const SUBJECT_TINTS = new Proxy({}, { get: () => UNIFIED_TINT });

function hexToSoftTint(hex, alpha = 0.12) {
  const [r, g, b] = hex.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Generic document icon (SVG is reused for all file types — only the
// icon background color changes per file type via --icon-bg below).
const NOTE_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/></svg>`;

// Featured-card icon background colors keyed by the note's MIME type:
//   Word (.doc/.docx)        -> blue
//   Image (image/*)          -> grey
//   Everything else (incl. PPT, PDF) -> red
// Falls back to the unified subject tint for notes with no fileType yet.
const ICON_BG = {
  'application/msword': '#2F6FED',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '#2F6FED',
  'application/vnd.ms-powerpoint': '#E14B4B',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '#E14B4B',
  'application/pdf': '#E14B4B',
};
function iconBgFor(fileType, fallbackTint) {
  if (!fileType) return fallbackTint;
  if (fileType.startsWith('image/')) return '#6B7280';
  return ICON_BG[fileType] || '#E14B4B';
}
const CROWN_ICON_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8.5 7 11l5-6 5 6 4-2.5-1.8 9.5a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8L3 8.5Z"/></svg>`;
const HEART_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 2 1.8 4.5 1.8 6.6 1.3 8.6 2.2 9.8 3.9a1 1 0 0 0 1.6 0c1.2-1.7 3.2-2.6 5.3-2.1 3.4.9 4.8 4.4 3.2 7.6-2.5 4.7-10 9.3-10 9.3Z"/></svg>`;
const DOWNLOAD_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>`;

function formatCount(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);
}

/**
 * Adapt a backend note row (nested: users/schools/subjects) into the
 * flat shape the renderer expects. Backend returns no tint/rating/
 * ratingCount columns — those get stripped.
 */
function adaptNoteFromApi(row) {
  return {
    id: row.id,
    title: row.title || 'Untitled',
    school: (row.schools && row.schools.school_name) || 'Unknown school',
    grade: row.grade_level || '',
    subject: (row.subjects && row.subjects.subject_name) || 'General',
    likes: typeof row.likes_count === 'number' ? row.likes_count : 0,
    downloads: typeof row.download_count === 'number' ? row.download_count : 0,
    group_id: row.group_id || '',
    fileType: row.file_type || '',
  };
}

/**
 * Fetch featured notes from /api/notes. Returns an array (always —
 * never throws). On any error, returns the FEATURED_NOTES fallback
 * so the page still renders.
 */
async function fetchFeaturedNotes() {
  const ON = window.OlongNotes || {};
  if (!ON.api) {
    // api.js didn't load — use fallback silently.
    return FEATURED_NOTES;
  }
  try {
    // GET /api/featured already returns notes grouped by group_id
    // (multi-image uploads collapsed into one entry with `imageCount`).
    // We pass a cache-buster timestamp so the browser/any intermediary
    // never serves a stale featured list after a new upload. The
    // `limit=4` query param matches the server's FEATURED_LIMIT and
    // documents the contract — server-side limit avoids over-fetching.
    // 4 (not 5) divides cleanly into the 2-col mobile grid so there's
    // never an orphan row at any breakpoint.
    const data = await ON.api.get(`/featured?limit=4&t=${Date.now()}`);
    const featured = Array.isArray(data) ? data : [];

    // The backend already shapes each item with the fields the renderer
    // expects (id, title, school, grade, subject, likes, downloads,
    // imageCount). Map through adaptNoteFromApi only as a safety net for
    // any raw row that somehow lacks that shape.
    return featured.map((item) => {
      // Backend `featured` already carries imageCount. If for any reason
      // an item lacks the grouped shape (e.g. a cached raw row), derive
      // imageCount from a single note.
      const base = item.imageCount !== undefined
        ? item
        : { ...adaptNoteFromApi(item), imageCount: 1 };
      return base;
    });
  } catch (e) {
    console.warn('[OlongNotes] Failed to load featured notes — using fallback.', e);
    return FEATURED_NOTES;
  }
}

function renderFeaturedNotes(notes = FEATURED_NOTES) {
  const grid = document.getElementById('featuredNotesGrid');
  if (!grid) return;

  if (!notes.length) {
    grid.innerHTML = `<div class="featured-notes__empty">No featured notes yet.</div>`;
    return;
  }

  const ranked = [...notes].sort((a, b) => (b.likes + b.downloads) - (a.likes + a.downloads));

  // escapeHtml comes from js/api.js — every dynamic field here is
  // user/DB-controlled, so it must be escaped before innerHTML.
  const esc = (window.OlongNotes && window.OlongNotes.escapeHtml) || ((s) => String(s));

  grid.innerHTML = ranked
    .map((note, index) => {
      const tint = UNIFIED_TINT;
      const tintSoft = hexToSoftTint(tint);
      const iconBg = iconBgFor(note.fileType, tint);
      const rankBadge = index === 0 ? `<span class="featured-card__rank">${CROWN_ICON_SVG}Most Popular</span>` : '';
      // Multi-image uploads are collapsed into a single card (see
      // fetchFeaturedNotes). When that happens we show a small gallery
      // badge so visitors know the card represents several images.
      const galleryBadge = note.imageCount > 1
        ? `<span class="featured-card__gallery">🖼 ${note.imageCount} images</span>`
        : '';
      // Note: `data-note-id` carries the backend ID for Step 4 wiring
      // (document viewer fetches by ?id=X).
      return `
        <article class="featured-card" style="--tint:${tint}; --tint-soft:${tintSoft}; --icon-bg:${iconBg};" data-note-id="${esc(note.id || '')}">
          <div class="featured-card__top">
            <span class="featured-card__icon" aria-hidden="true">${NOTE_ICON_SVG}</span>
            ${galleryBadge}
            ${rankBadge}
          </div>
          <div class="featured-card__body">
            <h3 class="featured-card__title">${esc(note.title)}</h3>
            <p class="featured-card__school">${esc(note.school)}</p>
          </div>
          <div class="featured-card__tags">
            <span class="pill">${esc(note.grade)}</span>
            <span class="pill pill--subject">${esc(note.subject)}</span>
          </div>
          <div class="featured-card__stats">
            <span class="stat stat--likes">${HEART_ICON_SVG}${formatCount(note.likes)}</span>
            <span class="stat stat--downloads">${DOWNLOAD_ICON_SVG}${formatCount(note.downloads)}</span>
          </div>
        </article>
      `;
    })
    .join('');
}

/* -----------------------------------------------------
   Generic modal helper
   Every modal in this app (side drawer, auth modal, contributor
   modal, upload modal) follows the same open/close contract:
   toggle an "is-open" class + aria-hidden on the panel, toggle a
   body class, and close on backdrop click / close button / Escape.
   This wraps that once instead of repeating it four times.
----------------------------------------------------- */
function createModal({ panel, backdrop, closeBtn, bodyClass = 'modal-open', triggerAttr }) {
  if (!panel) return { open() {}, close() {}, isOpen: () => false };

  const preventTouchScroll = (e) => e.preventDefault();

  const open = () => {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    if (triggerAttr) triggerAttr.setAttribute('aria-expanded', 'true');
    document.body.classList.add(bodyClass);
    backdrop?.addEventListener('touchmove', preventTouchScroll, { passive: false });
  };

  const close = () => {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (triggerAttr) triggerAttr.setAttribute('aria-expanded', 'false');
    document.body.classList.remove(bodyClass);
    backdrop?.removeEventListener('touchmove', preventTouchScroll);
  };

  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
  });

  return { open, close, isOpen: () => panel.classList.contains('is-open') };
}

/* =======================================================
   ROLE RESOLUTION
   ======================================================= */

// Token comes from localStorage (set by login flow) — same key api.js uses.
// We cache the user object under 'olongnotes_user' so applyRole() can read
// role + username + initials without re-fetching. Cleared on logout.
const USER_STORAGE_KEY = 'olongnotes_user';

// Fire-and-forget POST to /api/activities. Used after the upload succeeds
// so the user's Recent Activities feed shows the new note immediately.
// Same shape as document-viewer's recordActivity — the backend also writes
// the same row from POST /api/notes (see routes/notes.js wire-up), so this
// is a safety net. Failures are silent.
function recordActivity(noteId, type) {
  const ON = window.OlongNotes || {};
  if (!ON.api || !ON.getToken || !ON.getToken()) return;
  ON.api
    .post('/activities', { note_id: noteId, activity_type: type }, { auth: true })
    .catch((e) => console.debug('[activities] record skipped:', e && e.message));
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
function writeStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_STORAGE_KEY);
  } catch (_) { /* private mode */ }
}

// Used by applyRole() + the auth flow. Returns 'user' only if we actually
// have BOTH a token AND a cached user record. Missing either → viewer.
// We do NOT validate the token here — first protected call will 401 and
// the auth flow handles that. This is "best-effort" session detection,
// which matches how the prototype toggled roles.
function resolveRole() {
  const token = (window.OlongNotes && window.OlongNotes.getToken && window.OlongNotes.getToken()) || null;
  const user = readStoredUser();
  return (token && user) ? 'user' : 'viewer';
}

// Returns a {name, initials, role} object — falls back to a neutral
// placeholder if storage is empty. applyRole() reads from this.
function currentDisplayUser() {
  const u = readStoredUser();
  if (!u) return null;
  return {
    name: u.username || 'Member',
    initials: (u.username || '?').slice(0, 2).toUpperCase(),
    role: u.role || 'user',
  };
}

// EDIT 5: role gate for upload actions.
function roleAllowedForUpload() {
  const u = readStoredUser();
  return u && ['limited', 'verified', 'admin'].includes(u.role);
}

/* =======================================================
   APPLY ROLE
   The one function that knows what each perspective looks
   like. Everything else just wires up behavior; this wires
   up *visibility*.

   Defined at module scope and queries the DOM directly on
   every call, so it is safe to invoke immediately on
   DOMContentLoaded — even before the larger init blocks
   that reference the same elements. This guarantees the
   Log In / Sign Up buttons are hidden (and the profile
   chip/icon shown) for signed-in users regardless of
   whether any later init code throws.
   ======================================================= */
function applyRole(role) {
  document.body.dataset.role = role;

  const isUser = role === 'user';
  const user = currentDisplayUser();

  // Modern navbar (index.html): guest actions group + profile chip.
  const navGuestActions = document.getElementById('navGuestActions');
  const navProfileChip = document.getElementById('navProfileChip');
  const navProfileName = document.getElementById('navProfileName');
  const navProfileAvatar = document.getElementById('navProfileAvatar');

  if (navGuestActions) navGuestActions.hidden = isUser;
  if (navProfileChip) navProfileChip.hidden = !isUser;
  if (isUser && user) {
    if (navProfileName) navProfileName.textContent = user.name;
    if (navProfileAvatar) navProfileAvatar.textContent = user.initials;
  }

  // Legacy navbar (most other pages): Log In + Sign Up + profile icon.
  const legacyLoginBtn = document.getElementById('navLoginBtn');
  const legacySignupBtn = document.getElementById('navSignupBtn');
  const legacyProfileIcon = document.querySelector('.profile-icon');

  if (legacyLoginBtn) legacyLoginBtn.hidden = isUser;
  if (legacySignupBtn) legacySignupBtn.hidden = isUser;
  if (legacyProfileIcon) legacyProfileIcon.hidden = !isUser;

  const heroContribBtn = document.getElementById('heroContribBtn');
  const heroUploadBtn = document.getElementById('heroUploadBtn');
  const topContributorsSection = document.getElementById('topContributorsSection');

  if (heroContribBtn) heroContribBtn.hidden = isUser;
  if (heroUploadBtn) heroUploadBtn.hidden = !isUser;
  if (topContributorsSection) topContributorsSection.hidden = !isUser;

  // Auth modal shouldn't stay open for a signed-in user.
  if (isUser) {
    document.getElementById('authModal')?.classList.remove('is-open');
    document.body.classList.remove('modal-open');
  }

  // Notify any auth-aware helpers (auth-drawer.js: hides the Recent
  // Activities link for anonymous viewers). Fire it on every role
  // change so login → the link appears without a page reload.
  window.dispatchEvent(new CustomEvent('olongnotes:auth-changed', { detail: { role } }));
}

document.addEventListener('DOMContentLoaded', () => {
  /* =======================================================
     APPLY ROLE — run FIRST
     The one function that knows what each perspective looks
     like. Resolved from the real session (JWT + cached user)
     so on every page the Log In / Sign Up buttons are hidden
     (and the profile chip/icon shown) as soon as the DOM is
     ready. Running it here — before any potentially-fragile
     init code below — guarantees the auth-state visibility is
     always applied, even if a later init block throws and the
     rest of DOMContentLoaded aborts.
     ======================================================= */
  applyRole(resolveRole());

  // Load featured notes from /api/notes?limit=4, then render.
  // fetchFeaturedNotes() never throws — on error it falls back to
  // FEATURED_NOTES so the page still renders.
  fetchFeaturedNotes().then(renderFeaturedNotes);

  // Click delegation on the featured grid → navigate to the document
  // viewer by backend note ID. Cards carry data-note-id from Step 3.
  const featuredGrid = document.getElementById('featuredNotesGrid');
  featuredGrid?.addEventListener('click', (e) => {
    const card = e.target.closest('.featured-card[data-note-id]');
    if (!card) return;
    const id = card.getAttribute('data-note-id');
    if (!id) return;
    window.location.href = `document-viewer.html?id=${encodeURIComponent(id)}`;
  });

  /* ---------------- Side drawer ---------------- */
  const navBurger = document.getElementById('navBurger');
  const sideDrawer = createModal({
    panel: document.getElementById('sideDrawer'),
    backdrop: document.getElementById('sideDrawerBackdrop'),
    closeBtn: document.getElementById('sideDrawerClose'),
    triggerAttr: navBurger,
  });
  navBurger?.addEventListener('click', () => (sideDrawer.isOpen() ? sideDrawer.close() : sideDrawer.open()));

  /* ---------------- Light / Dark theme toggle ----------------
   Add this block to script.js (anywhere after the DOM is ready
   is fine — same pattern as your other init blocks). It:
   - Reads a saved preference from localStorage if one exists.
   - Otherwise falls back to the OS-level prefers-color-scheme.
   - Sets data-theme="dark" on <html> (style.css's dark overrides
     are all scoped to `[data-theme="dark"]`, so this one
     attribute is all that's needed to flip the whole site).
   - Keeps the existing toggle button's aria-pressed in sync so
     its CSS (.theme-toggle[aria-pressed="true"] .theme-toggle__thumb)
     keeps working exactly as already styled.
------------------------------------------------------------- */
(() => {
  const THEME_KEY = 'olongnotes-theme';
  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');

  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
    // Swap every .site-logo to the variant that has contrast against
    // the current theme. The original logo is dark-on-light; the
    // white version is for dark mode. We iterate every instance so
    // navbar + side-drawer + footer (and every page that shares the
    // markup) flip in one place. Called both on initial load and on
    // toggle click, so the correct variant is showing before paint
    // (no flash of the wrong-colored logo on page load in dark mode).
    document.querySelectorAll('img.site-logo').forEach((img) => {
      img.src = theme === 'dark' ? 'img/olongnotesW.png' : 'img/olongnotes.png';
    });
  };

  const getStoredTheme = () => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (err) {
      return null;
    }
  };

  const storeTheme = (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* ignore write errors (private browsing, etc.) */
    }
  };

  // Initial theme: saved preference wins; otherwise OS setting.
  const initialTheme = getStoredTheme() || (systemPrefersDark.matches ? 'dark' : 'light');
  applyTheme(initialTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = root.getAttribute('data-theme') === 'dark';
      const nextTheme = isDark ? 'light' : 'dark';
      applyTheme(nextTheme);
      storeTheme(nextTheme);
    });
  }

  // If the person never explicitly chose (no saved preference),
  // keep following the OS setting live.
  systemPrefersDark.addEventListener('change', (e) => {
    if (!getStoredTheme()) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
})();

  /* ---------------- Sticky navbar shadow ---------------- */
  const navbar = document.getElementById('navbar');
  window.addEventListener(
    'scroll',
    () => {
      if (!navbar) return;
      navbar.style.boxShadow = window.scrollY > 8
        ? '0 4px 16px rgba(11, 31, 77, 0.10)'
        : '0 2px 8px rgba(11, 31, 77, 0.06)';
    },
    { passive: true }
  );

  /* ---------------- Populate filter dropdowns on page load ---------------- */
  async function populateFilters() {
    const ON = window.OlongNotes || {};

    // Schools
    const schoolSelect = document.getElementById('schoolFilter');
    if (schoolSelect && ON.api) {
      try {
        const schools = await ON.api.get('/schools');
        if (schools && Array.isArray(schools)) {
          const options = '<option value="">All Schools</option>' +
            schools.map(s => `<option value="${s.id}">${s.school_name}</option>`).join('');
          schoolSelect.innerHTML = options;
        }
      } catch (e) {
        console.error('[OlongNotes] Failed to load schools', e);
      }
    }

    // Subjects
    const subjectSelect = document.getElementById('subjectFilter');
    if (subjectSelect && ON.api) {
      try {
        const subjects = await ON.api.get('/subjects?education_level=senior_high');
        const data = subjects?.subjects || subjects || [];
        if (Array.isArray(data) && data.length > 0) {
          const options = '<option value="">All Subjects</option>' +
            data.map(s => `<option value="${s.id}">${s.subject_name}</option>`).join('');
          subjectSelect.innerHTML = options;
        }
      } catch (e) {
        console.error('[OlongNotes] Failed to load subjects', e);
      }
    }

    // Grade levels (static)
    const gradeSelect = document.getElementById('gradeFilter');
    if (gradeSelect) {
      const grades = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
      const options = '<option value="">All Grade Levels</option>' +
        grades.map(g => `<option value="${g}">${g}</option>`).join('');
      gradeSelect.innerHTML = options;
    }
  }

  // Populate dropdowns when API is ready
  if (window.OlongNotes && window.OlongNotes.api) {
    populateFilters();
  } else {
    // Wait for API to be available
    let attempts = 0;
    const waitForAPI = setInterval(() => {
      if (window.OlongNotes?.api) {
        clearInterval(waitForAPI);
        populateFilters();
      }
      attempts++;
      if (attempts > 50) clearInterval(waitForAPI);
    }, 100);
  }

  /* ---------------- Search button handler — navigate with filters ---------------- */
  const searchBtn = document.getElementById('searchBtn');
  const schoolSelect = document.getElementById('schoolFilter');
  const gradeSelect = document.getElementById('gradeFilter');
  const subjectSelect = document.getElementById('subjectFilter');

  searchBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const params = new URLSearchParams();

    const schoolId = schoolSelect?.value;
    const grade = gradeSelect?.value;
    const subjectId = subjectSelect?.value;

    if (schoolId) params.set('school_id', schoolId);
    if (grade) params.set('grade_level', grade);
    if (subjectId) params.set('subject_id', subjectId);

    window.location.href = `subject-notes.html?${params.toString()}`;
  });

  /* ---------------- Hero "Browse Questions" button → Q&A page ---------------- */
  document.querySelectorAll('.hero__actions .btn--goldenrod').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      // The hero goldenrod button is the "Browse Questions" link. Let the
      // browser follow its href to the Q&A page (community.html). We only
      // guard the case where the element is genuinely a link and has an href.
      if (btn.tagName === 'A' && btn.getAttribute('href')) {
        return; // allow default navigation
      }
      e.preventDefault();
      window.location.href = 'community.html';
    });
  });

  /* ---------------- Auth modal (VIEWER only) ---------------- */
  const authCard = document.getElementById('authCard');
  const authModal = createModal({
    panel: document.getElementById('authModal'),
    backdrop: document.getElementById('authBackdrop'),
    closeBtn: document.getElementById('authClose'),
  });

  const openAuth = (mode) => {
    if (!authCard) return;
    authCard.classList.toggle('is-signup', mode === 'signup');
    authModal.open();
  };

  if (authCard) {
    document.getElementById('authGoSignUp')?.addEventListener('click', () => authCard.classList.add('is-signup'));
    document.getElementById('authGoSignIn')?.addEventListener('click', () => authCard.classList.remove('is-signup'));
    document.getElementById('navLoginBtn')?.addEventListener('click', () => openAuth('signin'));
    document.getElementById('navSignupBtn')?.addEventListener('click', () => openAuth('signup'));

    // EDIT 3: real login + signup against /api/auth/*.
    const ON = window.OlongNotes || {};
    const esc = ON.escapeHtml || ((s) => String(s ?? ''));
    const api = ON.api;
    const setToken = ON.setToken;

    const showAuthError = (msg) => {
      let el = authCard.querySelector('.auth-form__error');
      if (!el) {
        el = document.createElement('div');
        el.className = 'auth-form__error';
        el.setAttribute('role', 'alert');
        el.style.cssText = 'color:#c53030;background:#fed7d7;padding:8px 12px;border-radius:4px;margin:0 0 12px;font-size:13px;';
        authCard.querySelector('h2')?.insertAdjacentElement('afterend', el);
      }
      el.textContent = msg;
    };
    const clearAuthError = () => {
      const el = authCard.querySelector('.auth-form__error');
      if (el) el.remove();
    };

    const [loginForm, createForm] = Array.from(authCard.querySelectorAll('form.auth-form'));

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAuthError();
        const inputs = loginForm.querySelectorAll('input');
        const email = inputs[0]?.value?.trim() || '';
        const password = inputs[1]?.value || '';
        if (!email || !password) {
          showAuthError('Email and password required.');
          return;
        }
        try {
          const data = await api.post('/auth/login', { email, password });
          setToken(data.token);
          writeStoredUser(data.user);
          applyRole('user');
          authModal.close();
          loginForm.reset();
        } catch (err) {
          showAuthError(esc((err && err.message) || 'Login failed.'));
        }
      });
    }

    if (createForm) {
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAuthError();
        // Form order from index.html: full name, email, password
        const inputs = createForm.querySelectorAll('input');
        const fullName = inputs[0]?.value?.trim() || '';
        const email = inputs[1]?.value?.trim() || '';
        const password = inputs[2]?.value || '';
        if (!fullName || !email || !password) {
          showAuthError('All fields required.');
          return;
        }
        if (password.length < 8) {
          showAuthError('Password must be at least 8 characters.');
          return;
        }
        // Map full_name → username (server pattern: 3-20 chars, [a-zA-Z0-9_]).
        const username = fullName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
        if (username.length < 3) {
          showAuthError('Username must be at least 3 characters.');
          return;
        }
        try {
          await api.post('/auth/register', { username, email, password });
          // Register returns NO token. Chain a login.
          const login = await api.post('/auth/login', { email, password });
          setToken(login.token);
          writeStoredUser(login.user);
          applyRole('user');
          authModal.close();
          createForm.reset();
        } catch (err) {
          showAuthError(esc((err && err.message) || 'Sign-up failed.'));
        }
      });
    }
  }

  // EDIT 4 (continued): heroContribBtn now opens auth-modal in signup
  // mode (the contrib-modal was deleted along with this handler block).
  document.getElementById('heroContribBtn')?.addEventListener('click', () => openAuth('signup'));

  /* ---------------- Upload Notes modal (USER only) ---------------- */
  const uploadForm = document.getElementById('uploadForm');
  const noteFileInput = document.getElementById('noteFileInput');
  const noteFileDrop = document.getElementById('noteFileDrop');
const noteFileDropText = document.getElementById('noteFileDropText');
  const noteFileDropCount = document.getElementById('noteFileDropCount');
  const uploadSubjectField = document.getElementById('uploadSubjectField');
  const uploadSubjectSelect = document.getElementById('uploadSubjectSelect');
  const uploadGradeLevel = document.getElementById('uploadGradeLevel');
  const uploadCollegeFields = document.getElementById('uploadCollegeFields');
  const uploadCollegeCategorySelect = document.getElementById('uploadCollegeCategorySelect');
  const uploadCollegeProgramSelect = document.getElementById('uploadCollegeProgramSelect');
  const uploadCollegeMajorSelect = document.getElementById('uploadCollegeMajorSelect');
  const uploadSchoolSelect = document.getElementById('uploadSchoolSelect');
  const DEFAULT_NOTE_FILE_TEXT = 'Upload PDF, Word, PowerPoint, or an image';

// Custom-select enhancement is shared (community-shared.js): it works on
  // ANY native <select>, so we resolve it from the shared namespace here.
  const initCustomSelect = (window.OlongNotes?.shared?.initCustomSelect) || (() => {});

  [uploadGradeLevel, uploadSubjectSelect, uploadCollegeCategorySelect, uploadCollegeProgramSelect, uploadCollegeMajorSelect, uploadSchoolSelect]
    .forEach(initCustomSelect);

  // Home-page search-card filters: make School / Grade / Subject dropdowns
  // searchable + scrollable (same custom-select enhancement as the upload
  // modal). They render inside .select wrappers — see CSS for the
  // .select.cselect adjustments that keep the layout intact.
  [document.getElementById('schoolFilter'), document.getElementById('gradeFilter'), document.getElementById('subjectFilter')]
    .filter(Boolean)
    .forEach(initCustomSelect);

  const uploadModal = createModal({
    panel: document.getElementById('uploadModal'),
    backdrop: document.getElementById('uploadBackdrop'),
    closeBtn: document.getElementById('uploadClose'),
    bodyClass: 'upload-modal-open',
  });

  const createUploadOption = (value, label, disabled = false, selected = false) => {
    const option = document.createElement('option');
    option.value = value == null ? '' : String(value);
    option.textContent = label;
    if (disabled) option.disabled = true;
    if (selected) option.selected = true;
    return option;
  };

  const resetSelect = (select, placeholder, disabled = true) => {
    if (!select) return;
    select.innerHTML = '';
    select.appendChild(createUploadOption('', placeholder, true, true));
    select.disabled = disabled;
  };

  const populateSelect = (select, items, valueKey, labelKey, placeholder) => {
    if (!select) return;
    resetSelect(select, placeholder, !Array.isArray(items) || items.length === 0);
    if (!Array.isArray(items) || items.length === 0) return;
    select.disabled = false;
    items.forEach((item) => {
      const value = item[valueKey];
      const label = item[labelKey] || item[valueKey] || 'Unnamed';
      select.appendChild(createUploadOption(value, label));
    });
  };

  const mapGradeLevelToEducationLevel = (gradeLevel) => {
    if (gradeLevel === 'Grade 11' || gradeLevel === 'Grade 12') return 'senior_high';
    return 'k10';
  };

  const showUploadError = (msg) => {
    if (!uploadForm) return;
    let el = uploadForm.querySelector('.auth-form__error');
    if (!el) {
      el = document.createElement('div');
      el.className = 'auth-form__error';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'color:#c53030;background:#fed7d7;padding:8px 12px;border-radius:4px;margin:0 0 12px;font-size:13px;';
      uploadForm.querySelector('h2')?.insertAdjacentElement('afterend', el);
    }
    el.textContent = msg;
  };

  const MORE_SUBJECTS_VALUE = '__more_subjects__';
  let uploadFullSubjectList = []; // senior_high only — cached for "More subjects" expansion

  const subjectTrackStrand = (subject) => {
    const strand = subject.shs_strands;
    return {
      strandName: strand ? strand.strand_name : null,
      trackName: strand && strand.shs_tracks ? strand.shs_tracks.track_name : null,
    };
  };

  const populateSubjectSelectGrouped = (select, items, placeholder) => {
    if (!select) return;
    select.innerHTML = '';
    select.appendChild(createUploadOption('', placeholder, true, true));
    select.disabled = items.length === 0;
    if (items.length === 0) return;

    const grouped = new Map();
    items.forEach((item) => {
      const { trackName, strandName } = subjectTrackStrand(item);
      const track = trackName || 'Other';
      const strand = strandName || 'General';
      if (!grouped.has(track)) grouped.set(track, new Map());
      const strandMap = grouped.get(track);
      if (!strandMap.has(strand)) strandMap.set(strand, []);
      strandMap.get(strand).push(item);
    });

    grouped.forEach((strandMap, trackName) => {
      strandMap.forEach((subjects, strandName) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = `${trackName} — ${strandName}`;
        subjects.forEach((subject) => {
          optgroup.appendChild(createUploadOption(subject.id, subject.subject_name));
        });
        select.appendChild(optgroup);
      });
    });
  };

  const loadSubjectsForLevel = async (educationLevel) => {
    try {
      const data = await window.OlongNotes.api.get(`/subjects?education_level=${encodeURIComponent(educationLevel)}`);
      const subjects = Array.isArray(data) ? data : [];

      if (educationLevel === 'senior_high') {
        uploadFullSubjectList = subjects;
        const core = subjects.filter((s) => !s.shs_strands);
        resetSelect(uploadSubjectSelect, 'Select a subject', core.length === 0);
        core.forEach((s) => uploadSubjectSelect.appendChild(createUploadOption(s.id, s.subject_name)));
        if (subjects.length > core.length) {
          const moreOpt = createUploadOption(MORE_SUBJECTS_VALUE, 'More subjects...');
          moreOpt.dataset.action = 'more';
          uploadSubjectSelect.appendChild(moreOpt);
        }
        uploadSubjectSelect.disabled = false;
      } else {
        uploadFullSubjectList = [];
        populateSelect(uploadSubjectSelect, subjects, 'id', 'subject_name', 'Select a subject');
      }
    } catch (err) {
      resetSelect(uploadSubjectSelect, 'Unable to load subjects');
      showUploadError('Could not load subjects. Please try again.');
      console.error('[upload] Failed to load subjects for', educationLevel, err);
    }
  };

// College Department → Program (→ Major) cascade is shared with the
  // Q&A ask modal (community-shared.js → createCollegeCascade). We keep
  // the upload page's own wrappers so callers below don't change, but the
  // fetch/populate/disabled logic lives in ONE place.
// The college cascade lives in community-shared.js. script.js is also
  // loaded on pages that do NOT include community-shared.js (e.g.
  // subject-notes.html), so guard the whole block: only build the cascade
  // when the shared helper AND the college <select> fields exist. Without
  // this guard the call below would throw a TypeError and abort the
  // DOMContentLoaded handler before applyRole() runs — leaving the
  // Log In / Sign Up buttons visible for signed-in users.
  const collegeCascade =
    window.OlongNotes?.shared?.createCollegeCascade &&
    uploadCollegeCategorySelect && uploadCollegeProgramSelect && uploadCollegeMajorSelect
      ? window.OlongNotes.shared.createCollegeCascade({
          api: window.OlongNotes?.api,
          categorySelect: uploadCollegeCategorySelect,
          programSelect: uploadCollegeProgramSelect,
          majorSelect: uploadCollegeMajorSelect,
          onError: showUploadError,
        })
      : null;

  const loadCollegeCategories = () => collegeCascade?.populateDepartments();
  const loadProgramsForCategory = (categoryId) => collegeCascade?.loadProgramsForCategory?.(categoryId);
  const loadMajorsForProgram = (programId) => collegeCascade?.loadMajorsForProgram?.(programId);

  let uploadSchoolsLoaded = false;
  const loadSchoolsForUpload = async () => {
    if (uploadSchoolsLoaded || !uploadSchoolSelect) return;
    try {
      const data = await window.OlongNotes.api.get('/schools');
      const schools = Array.isArray(data) ? data : [];
      uploadSchoolSelect.innerHTML = '';
      uploadSchoolSelect.appendChild(createUploadOption('', 'No specific school', false, true));
      schools.forEach((s) => uploadSchoolSelect.appendChild(createUploadOption(s.id, s.school_name)));
      uploadSchoolsLoaded = true;
    } catch (err) {
      uploadSchoolSelect.innerHTML = '';
      uploadSchoolSelect.appendChild(createUploadOption('', 'No specific school', false, true));
      showUploadError('Could not load the schools list. You can still upload without selecting one.');
      console.error('[upload] Failed to load schools', err);
    }
  };

  const showCollegeMode = async () => {
    if (uploadSubjectField) uploadSubjectField.style.display = 'none';
    if (uploadSubjectSelect) uploadSubjectSelect.disabled = true;
    if (uploadCollegeFields) uploadCollegeFields.style.display = 'grid';
    await loadCollegeCategories();
  };

  const showK10OrShsMode = async (gradeLevel) => {
    if (uploadCollegeFields) uploadCollegeFields.style.display = 'none';
    resetSelect(uploadCollegeCategorySelect, 'Select a department', true);
    resetSelect(uploadCollegeProgramSelect, 'Select a program', true);
    resetSelect(uploadCollegeMajorSelect, 'Select a major (optional)', true);
    if (uploadSubjectField) uploadSubjectField.style.display = '';
    await loadSubjectsForLevel(mapGradeLevelToEducationLevel(gradeLevel));
  };

  const resetUploadFieldsToPlaceholder = () => {
    uploadFullSubjectList = [];
    if (uploadSubjectField) uploadSubjectField.style.display = '';
    resetSelect(uploadSubjectSelect, 'Select grade level first', true);
    if (uploadCollegeFields) uploadCollegeFields.style.display = 'none';
    resetSelect(uploadCollegeCategorySelect, 'Select a department', true);
    resetSelect(uploadCollegeProgramSelect, 'Select a program', true);
    resetSelect(uploadCollegeMajorSelect, 'Select a major (optional)', true);
    if (uploadSchoolSelect) {
      uploadSchoolSelect.value = '';
      uploadSchoolSelect.refreshCselect?.();
    }
  };

const openUploadModal = async () => {
    if (uploadGradeLevel) {
      uploadGradeLevel.value = '';
      uploadGradeLevel.refreshCselect?.();
    }
    resetUploadFieldsToPlaceholder();
    await loadSchoolsForUpload();
    uploadModal.open();
  };

  // Expose the existing upload-modal opener so other pages (e.g. the
  // profile page's "+ New Note" button) can reuse THIS modal + its form
  // logic/validation instead of building a new one. Guarded so callers
  // can gracefully fall back to index.html#upload if API/Auth is absent.
  try {
    window.OlongNotes = window.OlongNotes || {};
    window.OlongNotes.openUploadModal = openUploadModal;
  } catch (_) { /* best-effort */ }

  document.getElementById('heroUploadBtn')?.addEventListener('click', () => {
    if (!roleAllowedForUpload()) {
      alert('You need to be a contributor (limited, verified, or admin) to upload. Contact an admin to upgrade your account.');
      return;
    }
    openUploadModal();
  });

  noteFileInput?.addEventListener('change', () => {
    const files = noteFileInput.files;
    const count = files ? files.length : 0;
    if (count === 0) {
      noteFileDropText.textContent = DEFAULT_NOTE_FILE_TEXT;
      noteFileDrop.classList.remove('has-file');
      if (noteFileDropCount) noteFileDropCount.hidden = true;
      return;
    }
    if (count === 1) {
      noteFileDropText.textContent = files[0].name;
    } else {
      noteFileDropText.textContent = `${count} files selected`;
    }
    noteFileDrop.classList.add('has-file');
    if (noteFileDropCount) {
      noteFileDropCount.textContent = `${count} file(s)`;
      noteFileDropCount.hidden = false;
    }
  });

  uploadGradeLevel?.addEventListener('change', async () => {
    const selectedLevel = uploadGradeLevel.value;
    if (!selectedLevel) {
      resetUploadFieldsToPlaceholder();
    } else if (selectedLevel === 'College') {
      await showCollegeMode();
    } else {
      await showK10OrShsMode(selectedLevel);
    }
  });

  uploadCollegeCategorySelect?.addEventListener('change', async () => {
    await loadProgramsForCategory(uploadCollegeCategorySelect.value);
  });

  uploadCollegeProgramSelect?.addEventListener('change', async () => {
    await loadMajorsForProgram(uploadCollegeProgramSelect.value);
  });

  uploadSubjectSelect?.addEventListener('change', () => {
    if (uploadSubjectSelect.value === MORE_SUBJECTS_VALUE) {
      populateSubjectSelectGrouped(uploadSubjectSelect, uploadFullSubjectList, 'Select a subject');
    }
  });

// EDIT 5: real upload submit → POST /api/notes via api.upload().
  const handleUploadSubmit = async (e) => {
    e.preventDefault();

    // Prevent double-submit while an upload is in-flight (stacking guard).
    // This also covers the case where the button is clicked twice before
    // the modal closes — only one request is ever sent.
    if (uploadForm.dataset.uploading === '1') return;
    uploadForm.dataset.uploading = '1';

    try {
      const fd = new FormData(uploadForm);
      const gradeLevel = uploadGradeLevel?.value || '';

      // Subject is optional for K-10/SHS.
      let subjectId = '';
      if (gradeLevel === 'College') {
        const programOrMajorId = uploadCollegeMajorSelect?.value || uploadCollegeProgramSelect?.value || '';
        if (programOrMajorId && window.OlongNotes?.api) {
          try {
            const subjects = await window.OlongNotes.api.get(`/subjects?program_id=${encodeURIComponent(programOrMajorId)}`);
            const list = Array.isArray(subjects) ? subjects : [];
            if (list.length > 0) subjectId = String(list[0].id);
          } catch (_) {
            // Lookup failed — fall through with empty subjectId.
          }
        }
      } else {
        subjectId = uploadSubjectSelect?.value || '';
      }

      // Subject is required for K-10/SHS.
      if (!subjectId && gradeLevel !== 'College') {
        showUploadError('Please select a subject before uploading.');
        return;
      }

const remapped = new FormData();
      remapped.append('title', fd.get('title') || '');
      remapped.append('annotation', fd.get('caption') || '');
      remapped.append('grade_level', gradeLevel);
      if (subjectId) remapped.append('subject_id', subjectId);
      remapped.append('school_id', uploadSchoolSelect?.value || '');

      const fileList = noteFileInput?.files || [];
      let appended = 0;
      for (const file of fileList) {
        if (file && file.size > 0) {
          remapped.append('file', file);
          appended++;
        }
      }
      if (appended === 0) {
        showUploadError('Please select a file to upload.');
        return;
      }
      // tags intentionally dropped.

      const ON2 = window.OlongNotes || {};
      const esc2 = ON2.escapeHtml || ((s) => String(s ?? ''));

      const data = await ON2.api.upload('/notes', remapped, { auth: true });
      // The upload may create one note (single file) or several (grouped
      // images). Navigate to the first created note's viewer.
      const created = data && data.note;
      const notes = data && (data.notes || []);
      const firstNote = created || (notes && notes[0]);
      uploadModal.close();
      uploadForm.reset();
      resetUploadFieldsToPlaceholder();
      noteFileDropText.textContent = DEFAULT_NOTE_FILE_TEXT;
      noteFileDrop.classList.remove('has-file');
      if (noteFileDropCount) noteFileDropCount.hidden = true;
      if (firstNote && firstNote.id) {

        // Record the activity.
        recordActivity(firstNote.id, 'note_uploaded');
        window.location.href = `document-viewer.html?id=${encodeURIComponent(firstNote.id)}`;
      }
    } catch (err) {
      const ON2 = window.OlongNotes || {};
      const esc2 = ON2.escapeHtml || ((s) => String(s ?? ''));
      if (err && err.status === 401) {
        if (ON2.clearToken) ON2.clearToken();
        if (ON2.applyRole) ON2.applyRole('viewer');
        uploadModal.close();
        showUploadError('Your session expired. Please log in again to upload.');
        document.getElementById('authModal')?.classList.add('is-open');
        return;
      }
      showUploadError(esc2((err && err.message) || 'Upload failed.'));
    } finally {
      // Always release the lock so the user can retry on failure.
      delete uploadForm.dataset.uploading;
    }
  };

  if (uploadForm) {
    // Guard against double-binding: remove then re-add so hot-reloads /
    // multiple initializations never stack duplicate submit handlers.
    uploadForm.removeEventListener('submit', handleUploadSubmit);
    uploadForm.addEventListener('submit', handleUploadSubmit);
  }

  /* ---------------- CTA "Upload Notes" button (role-dependent target) ----------------
     EDIT 6: viewer path now opens auth-modal signup (no more contrib-modal). */
  document.getElementById('ctaContribBtn')?.addEventListener('click', () => {
    if (document.body.dataset.role === 'user') {
      if (!roleAllowedForUpload()) {
        alert('You need to be a contributor (limited, verified, or admin) to upload. Contact an admin to upgrade your account.');
        return;
      }
      openUploadModal();
    } else {
      openAuth('signup');
    }
  });

  /* ---------------- Discover / Learn / Interact ---------------- */
  const discoverScroll = document.getElementById('discoverScroll');
  const discoverItems = document.querySelectorAll('.discover-item');
  const discoverBadges = document.querySelectorAll('.discover-badge-item');
  const discoverVisuals = document.querySelectorAll('.discover-visual-item');
  const discoverProgressFill = document.getElementById('discoverProgressFill');
  const discoverGroups = [discoverItems, discoverBadges, discoverVisuals];

  const markActive = (nodeList, index) => {
    nodeList.forEach((item, i) => {
      item.classList.toggle('is-active', i === index);
      item.classList.toggle('is-passed', i < index);
    });
  };

  if (discoverScroll && discoverItems.length) {

    const isNarrowViewport = () => window.matchMedia('(max-width: 1100px)').matches;

    if (isNarrowViewport()) {
      // Mobile / tablet / small-laptop: no scroll-jacking. CSS keeps
      // every panel in normal, readable stacked flow with no overlap.
    } else {
      let ticking = false;

      const updateDiscover = () => {
        ticking = false;
        const rect = discoverScroll.getBoundingClientRect();
        const scrollable = discoverScroll.offsetHeight - window.innerHeight;
        const progress = Math.min(Math.max(scrollable > 0 ? -rect.top / scrollable : 0, 0), 0.999);
        const index = Math.floor(progress * discoverItems.length);

        discoverGroups.forEach((group) => markActive(group, index));
        if (discoverProgressFill) discoverProgressFill.style.width = `${progress * 100}%`;
      };

      const onDiscoverScroll = () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(updateDiscover);
        }
      };

      window.addEventListener('scroll', onDiscoverScroll, { passive: true });
      window.addEventListener('resize', onDiscoverScroll);
      updateDiscover();
    }
  }

  /* =======================================================
     APPLY ROLE
     The one function that knows what each perspective looks
     like. Everything above just wires up behavior; this wires
     up *visibility*.
     ======================================================= */
  // Modern navbar (index.html): guest actions group + profile chip.
  const navGuestActions = document.getElementById('navGuestActions');
  const navProfileChip = document.getElementById('navProfileChip');
  const navProfileName = document.getElementById('navProfileName');
  const navProfileAvatar = document.getElementById('navProfileAvatar');

  // Legacy navbar (document-viewer.html): profile icon.
  const legacyLoginBtn = document.getElementById('navLoginBtn');
  const legacySignupBtn = document.getElementById('navSignupBtn');
  const legacyProfileIcon = document.querySelector('.profile-icon');

const heroContribBtn = document.getElementById('heroContribBtn');
  const heroUploadBtn = document.getElementById('heroUploadBtn');
  const topContributorsSection = document.getElementById('topContributorsSection');

  /* NOTE: applyRole() is defined at module scope (above) and runs first
     in this handler, so the auth-state visibility is always applied even
     if a later init block throws. The `const` refs above are kept only
     for the click listeners below. */

  // EDIT 11: navbar profile chip → navigate to own profile (logout lives
  // in the Settings tab on the profile page — clicking the avatar should
  // take the user to their profile, not log them out).
  navProfileChip?.addEventListener('click', (e) => {
    e.preventDefault();
    const u = readStoredUser();
    const selfId = u && (u.id || u.user_id);
    if (!selfId) return;
    window.location.href = `profile.html?user=${encodeURIComponent(selfId)}`;
  });

  // Legacy navbar profile icon (document-viewer.html etc.) — same nav
  // behavior: logged in → own profile; logged out → bounce to index
  // with the auth modal open in signin mode (index.html owns the modal).
  legacyProfileIcon?.addEventListener('click', (e) => {
    e.preventDefault();
    const u = readStoredUser();
    const selfId = u && (u.id || u.user_id);
    if (selfId) {
      window.location.href = `profile.html?user=${encodeURIComponent(selfId)}`;
      return;
    }
    window.location.href = 'index.html?auth=signin';
  });

// EDIT 7: dev role switcher block — DELETED. Real session decides role.
  // (applyRole(resolveRole()) already ran at the top of this handler, so
  // the auth-state visibility is guaranteed even if a later block threw.)

  /* ---------------- ?auth= deep-link from other pages ----------------
   Other pages (recent-activities.html, etc.) don't carry the auth
   modal — when an unauthenticated viewer clicks Log In / Sign Up
   there, they're routed here with `?auth=signin` or `?auth=signup`
   and we open the modal in the requested mode. If the viewer is
   already signed in, no-op. The query string is cleaned from the
   address bar so a refresh doesn't re-open the modal. */
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('auth');
    if ((mode === 'signin' || mode === 'signup') && resolveRole() === 'viewer') {
      openAuth(mode === 'signup' ? 'signup' : 'signin');
      params.delete('auth');
      const cleaned = params.toString();
      const next = window.location.pathname + (cleaned ? `?${cleaned}` : '') + window.location.hash;
      window.history.replaceState({}, '', next);
    }
  } catch (_) { /* query-string inspection is best-effort */ }
});