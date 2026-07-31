/**
 * OlongNotes — Landing Page UI Interactions
 * Same behavior as before, plus VIEWER / USER perspective handling.
 *
 * ===========================================================
 * HOW THE ROLE IS DECIDED (see resolveRole() below)
 * ===========================================================
 * Checked in this order, first match wins:
 *   1. FORCE_ROLE below       — hardcode 'viewer' or 'user' to pin it
 *   2. ?role=viewer|user      — URL param, shareable, no code edits
 *   3. localStorage           — remembers your last dev-switcher pick
 *   4. default: 'viewer'
 *
 * Everything role-specific lives inside applyRole(role) — that's the
 * ONLY function that knows what a viewer vs. a user sees. When
 * Supabase auth is wired in, replace resolveRole()'s body with a
 * real session check (e.g. supabase.auth.getSession()) and call
 * applyRole() with the result — nothing else in this file changes.
 *
 * The floating "Preview: Viewer / User" button and everything under
 * "DEV ROLE SWITCHER" is temporary scaffolding for building the UI.
 * Delete that section (and the button in index.html) once real auth
 * is in place.
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
    likes: typeof row.like_count === 'number' ? row.like_count : 0,
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

  const open = () => {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    if (triggerAttr) triggerAttr.setAttribute('aria-expanded', 'true');
    document.body.classList.add(bodyClass);
  };

  const close = () => {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (triggerAttr) triggerAttr.setAttribute('aria-expanded', 'false');
    document.body.classList.remove(bodyClass);
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

// Hardcode 'viewer' or 'user' here to pin the perspective while you
// work on one side specifically. Leave null to fall back to the URL
// param / localStorage / default below.
const FORCE_ROLE = null;

const ROLE_STORAGE_KEY = 'olongnotes_dev_role';

// Stand-in for whoever's "logged in" during the User preview.
// Swap this for real profile data once Supabase auth is wired in.
const MOCK_USER = {
  name: 'Juan Dela Cruz',
  initials: 'JD',
};

function resolveRole() {
  if (FORCE_ROLE === 'viewer' || FORCE_ROLE === 'user') return FORCE_ROLE;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('role');
  if (fromUrl === 'viewer' || fromUrl === 'user') return fromUrl;

  const fromStorage = window.localStorage?.getItem(ROLE_STORAGE_KEY);
  if (fromStorage === 'viewer' || fromStorage === 'user') return fromStorage;

  return 'viewer';
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

    authCard.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        console.info('[OlongNotes] Auth form placeholder — not yet implemented.');
      });
    });
  }

  /* ---------------- Become a Contributor modal (VIEWER path) ---------------- */
  const contribForm = document.getElementById('contribForm');
  const schoolIdInput = document.getElementById('schoolIdInput');
  const fileDrop = document.getElementById('fileDrop');
  const fileDropText = document.getElementById('fileDropText');
  const DEFAULT_FILE_TEXT = 'Upload a photo or scan of your school ID';

  const contribModal = createModal({
    panel: document.getElementById('contribModal'),
    backdrop: document.getElementById('contribBackdrop'),
    closeBtn: document.getElementById('contribClose'),
    bodyClass: 'contrib-modal-open',
  });

  document.getElementById('heroContribBtn')?.addEventListener('click', contribModal.open);

  schoolIdInput?.addEventListener('change', () => {
    const file = schoolIdInput.files?.[0];
    fileDropText.textContent = file ? file.name : DEFAULT_FILE_TEXT;
    fileDrop.classList.toggle('has-file', Boolean(file));
  });

  contribForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(contribForm);
    const values = Object.fromEntries(formData.entries());
    values.school_id = formData.get('school_id')?.name || null;

    console.info('[OlongNotes] Become a Contributor — form placeholder, not yet implemented.', values);

    contribModal.close();
    contribForm.reset();
    fileDropText.textContent = DEFAULT_FILE_TEXT;
    fileDrop.classList.remove('has-file');
  });

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

  document.getElementById('heroUploadBtn')?.addEventListener('click', uploadModal.open);

  noteFileInput?.addEventListener('change', () => {
    const file = noteFileInput.files?.[0];
    noteFileDropText.textContent = file ? file.name : DEFAULT_NOTE_FILE_TEXT;
    noteFileDrop.classList.toggle('has-file', Boolean(file));
  });

  uploadForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(uploadForm);
    const values = Object.fromEntries(formData.entries());
    values.note_file = formData.get('note_file')?.name || null;

    console.info('[OlongNotes] Upload Notes — form placeholder, not yet implemented.', values);

    uploadModal.close();
    uploadForm.reset();
    noteFileDropText.textContent = DEFAULT_NOTE_FILE_TEXT;
    noteFileDrop.classList.remove('has-file');
  });

  /* ---------------- CTA "Upload Notes" button (role-dependent target) ---------------- */
  // Viewer isn't verified yet -> contributor application.
  // User is already verified -> straight to the upload modal.
  document.getElementById('ctaContribBtn')?.addEventListener('click', () => {
    if (document.body.dataset.role === 'user') {
      uploadModal.open();
    } else {
      contribModal.open();
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

  /* =======================================================
     APPLY ROLE
     The one function that knows what each perspective looks
     like. Everything above just wires up behavior; this wires
     up *visibility*.
     ======================================================= */
  const navGuestActions = document.getElementById('navGuestActions');
  const navProfileChip = document.getElementById('navProfileChip');
  const navProfileName = document.getElementById('navProfileName');
  const navProfileAvatar = document.getElementById('navProfileAvatar');
  const heroContribBtn = document.getElementById('heroContribBtn');
  const heroUploadBtn = document.getElementById('heroUploadBtn');
  const topContributorsSection = document.getElementById('topContributorsSection');

  function applyRole(role) {
    document.body.dataset.role = role;

    const isUser = role === 'user';

    // Navbar: guest buttons vs. profile chip
    if (navGuestActions) navGuestActions.hidden = isUser;
    if (navProfileChip) navProfileChip.hidden = !isUser;
    if (isUser && navProfileName) navProfileName.textContent = MOCK_USER.name;
    if (isUser && navProfileAvatar) navProfileAvatar.textContent = MOCK_USER.initials;

    // Hero: Become a Contributor vs. Upload Notes
    if (heroContribBtn) heroContribBtn.hidden = isUser;
    if (heroUploadBtn) heroUploadBtn.hidden = !isUser;

    // Top Contributors section: viewer-hidden, user-visible
    if (topContributorsSection) topContributorsSection.hidden = !isUser;

    // Auth modal: only ever auto-shown for viewers. If we're switching
    // *into* viewer mode (e.g. via the dev switcher), reopen it so the
    // "first visit" experience can actually be previewed; switching
    // into user mode always closes it.
    if (authCard) {
      if (isUser) {
        authCard.closest('.auth-modal')?.classList.remove('is-open');
        document.body.classList.remove('modal-open');
      } else {
        openAuth('signin');
      }
    }
  }

  /* ---------------- DEV ROLE SWITCHER ----------------
     Temporary — delete this block + the button in index.html once
     Supabase auth decides the role for real. */
  const devSwitcher = document.getElementById('devRoleSwitcher');
  const devButtons = devSwitcher?.querySelectorAll('[data-role-btn]');

  function setDevActiveButton(role) {
    devButtons?.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.roleBtn === role));
  }

  devButtons?.forEach((btn) => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.roleBtn;
      window.localStorage?.setItem(ROLE_STORAGE_KEY, role);
      applyRole(role);
      setDevActiveButton(role);
    });
  });

  const initialRole = resolveRole();
  applyRole(initialRole);
  setDevActiveButton(initialRole);
});