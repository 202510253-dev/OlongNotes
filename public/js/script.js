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

const NOTE_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/></svg>`;
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
    const data = await ON.api.get('/notes?limit=4');
    const notes = (data && data.notes) || [];
    return notes.map(adaptNoteFromApi);
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
      const rankBadge = index === 0 ? `<span class="featured-card__rank">${CROWN_ICON_SVG}Most Popular</span>` : '';
      // Note: `data-note-id` carries the backend ID for Step 4 wiring
      // (document viewer fetches by ?id=X).
      return `
        <article class="featured-card" style="--tint:${tint}; --tint-soft:${tintSoft};" data-note-id="${esc(note.id || '')}">
          <div class="featured-card__top">
            <span class="featured-card__icon" aria-hidden="true">${NOTE_ICON_SVG}</span>
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

document.addEventListener('DOMContentLoaded', () => {
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

  /* ---------------- Placeholder buttons ---------------- */
  document.querySelectorAll('.search-card__btn, .hero__actions .btn--goldenrod').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      console.info('[OlongNotes] Placeholder action — not yet implemented.');
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
  const DEFAULT_NOTE_FILE_TEXT = 'Upload PDF, Word, PowerPoint, or an image';

  const uploadModal = createModal({
    panel: document.getElementById('uploadModal'),
    backdrop: document.getElementById('uploadBackdrop'),
    closeBtn: document.getElementById('uploadClose'),
    bodyClass: 'upload-modal-open',
  });

  // EDIT 6: heroUploadBtn now role-gates before opening.
  document.getElementById('heroUploadBtn')?.addEventListener('click', () => {
    if (!roleAllowedForUpload()) {
      alert('You need to be a contributor (limited, verified, or admin) to upload. Contact an admin to upgrade your account.');
      return;
    }
    uploadModal.open();
  });

  noteFileInput?.addEventListener('change', () => {
    const file = noteFileInput.files?.[0];
    noteFileDropText.textContent = file ? file.name : DEFAULT_NOTE_FILE_TEXT;
    noteFileDrop.classList.toggle('has-file', Boolean(file));
  });

  // EDIT 5: real upload submit → POST /api/notes via api.upload().
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fd = new FormData(uploadForm);
      const remapped = new FormData();
      remapped.append('title', fd.get('title') || '');
      remapped.append('annotation', fd.get('caption') || '');
      remapped.append('subject_id', fd.get('subject_id') || '');
      remapped.append('school_id', fd.get('school_id') || '');
      remapped.append('grade_level', fd.get('grade_level') || '');
      const file = fd.get('note_file');
      if (file && file.size > 0) remapped.append('file', file);
      // tags intentionally dropped.

      const ON2 = window.OlongNotes || {};
      const esc2 = ON2.escapeHtml || ((s) => String(s ?? ''));

      try {
        const data = await ON2.api.upload('/notes', remapped, { auth: true });
        uploadModal.close();
        uploadForm.reset();
        noteFileDropText.textContent = DEFAULT_NOTE_FILE_TEXT;
        noteFileDrop.classList.remove('has-file');
        if (data && data.note && data.note.id) {
          window.location.href = `document-viewer.html?id=${encodeURIComponent(data.note.id)}`;
        }
      } catch (err) {
        let el = uploadForm.querySelector('.auth-form__error');
        if (!el) {
          el = document.createElement('div');
          el.className = 'auth-form__error';
          el.setAttribute('role', 'alert');
          el.style.cssText = 'color:#c53030;background:#fed7d7;padding:8px 12px;border-radius:4px;margin:0 0 12px;font-size:13px;';
          uploadForm.querySelector('h2')?.insertAdjacentElement('afterend', el);
        }
        el.textContent = esc2((err && err.message) || 'Upload failed.');
      }
    });
  }

  /* ---------------- CTA "Upload Notes" button (role-dependent target) ----------------
     EDIT 6: viewer path now opens auth-modal signup (no more contrib-modal). */
  document.getElementById('ctaContribBtn')?.addEventListener('click', () => {
    if (document.body.dataset.role === 'user') {
      if (!roleAllowedForUpload()) {
        alert('You need to be a contributor (limited, verified, or admin) to upload. Contact an admin to upgrade your account.');
        return;
      }
      uploadModal.open();
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
    // Matches the @media (max-width: 1100px) breakpoint in style.css —
    // when the discover section collapses to stacked flow, the
    // scroll-pinned swap effect doesn't make sense, so skip the
    // scroll listener entirely.
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

  // Legacy navbar (other pages): standalone Log In / Sign Up buttons +
  // a .profile-icon button that's always visible today. We hide/show
  // these in lockstep with the modern navbar so login state reflects
  // everywhere, not just on the landing page.
  const legacyLoginBtn = document.getElementById('navLoginBtn');
  const legacySignupBtn = document.getElementById('navSignupBtn');
  const legacyProfileIcon = document.querySelector('.profile-icon');

  const heroContribBtn = document.getElementById('heroContribBtn');
  const heroUploadBtn = document.getElementById('heroUploadBtn');
  const topContributorsSection = document.getElementById('topContributorsSection');

  // EDIT 2: applyRole now reads from real user cache, drops MOCK_USER,
  // drops the "auto-open auth modal on viewer" behavior (we don't auto-prompt).
  function applyRole(role) {
    document.body.dataset.role = role;

    const isUser = role === 'user';
    const user = currentDisplayUser();

    // Modern navbar (index.html).
    if (navGuestActions) navGuestActions.hidden = isUser;
    if (navProfileChip) navProfileChip.hidden = !isUser;
    if (isUser && user) {
      if (navProfileName) navProfileName.textContent = user.name;
      if (navProfileAvatar) navProfileAvatar.textContent = user.initials;
    }

    // Legacy navbar (other pages): hide Log In + Sign Up when signed in,
    // show the profile icon. Reverse on logout.
    if (legacyLoginBtn) legacyLoginBtn.hidden = isUser;
    if (legacySignupBtn) legacySignupBtn.hidden = isUser;
    if (legacyProfileIcon) legacyProfileIcon.hidden = !isUser;

    if (heroContribBtn) heroContribBtn.hidden = isUser;
    if (heroUploadBtn) heroUploadBtn.hidden = !isUser;

    if (topContributorsSection) topContributorsSection.hidden = !isUser;

    if (isUser && authCard) {
      authCard.closest('.auth-modal')?.classList.remove('is-open');
      document.body.classList.remove('modal-open');
    }
  }

  // EDIT 11: navbar profile chip → logout.
  const ONlogout = window.OlongNotes || {};
  const apiLogout = ONlogout.api;
  const clearToken = ONlogout.clearToken;
  navProfileChip?.addEventListener('click', async () => {
    if (!confirm('Log out?')) return;
    try { await apiLogout.post('/auth/logout', {}, { auth: true }); }
    catch (_) { /* still log out on client even if backend call fails */ }
    clearToken();
    writeStoredUser(null);
    applyRole('viewer');
  });

  // EDIT 7: dev role switcher block — DELETED. Real session decides role.
  applyRole(resolveRole());
});