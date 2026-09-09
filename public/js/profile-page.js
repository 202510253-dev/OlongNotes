// ===================== PROFILE PAGE LOADER =====================
// Phase 6 cut 1 — wired against /api/users/:id, /notes, /questions,
// /answers, /stats, and PATCH /api/users/:id for the Settings tab.
//
// Self-contained IIFE. Reads the api.js wrapper via window.OlongNotes
// (escapes its identity collision risk by checking at call time). All
// DB-derived strings pass through window.OlongNotes.escapeHtml before
// touching innerHTML — plain text fields use textContent instead.
//
// Lifecycle:
//   1. resolveTargetId() — pull ?user=<id> from URL, fall back to the
//      logged-in user's id. Bail to the empty state if neither.
//   2. activate(tabName) — tab strip + URL hash. Deep-linkable.
//   3. loadProfile(id) — hero + stats in parallel.
//   4. Tab-specific loaders fire the first time their tab opens (lazy).
//   5. Settings save button → PATCH /api/users/:id.

(function () {
  'use strict';

  const ON = window.OlongNotes || {};
  const api = ON.api;
  const escapeHtml = ON.escapeHtml || ((s) => String(s ?? ''));
  const getToken = ON.getToken || (() => null);

  // ---------- Utilities ----------

  // Reads JSON from localStorage without throwing (private mode etc.).
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }

  // Two-letter uppercase initials from any string. Empty string falls
  // back to "?". Same approach as script.js:257.
  function initialsOf(name) {
    if (!name) return '?';
    const cleaned = String(name).trim();
    if (!cleaned) return '?';
    return cleaned.slice(0, 2).toUpperCase();
  }

  // 1.2K / 1.2M formatting. Same algorithm as script.js:50.
  function formatCount(n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
    return String(n);
  }

  // "Today" / "3 days ago" / "June 2026" relative time, no locale.
  function joinedLabel(createdAt) {
    if (!createdAt) return '—';
    const t = new Date(createdAt).getTime();
    if (Number.isNaN(t)) return '—';
    const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
    if (days < 1) return 'Today';
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  }

  // Capitalizes the role label ("verified" → "Verified").
  function roleLabel(role) {
    if (!role) return 'Member';
    const lower = String(role).toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  // Empty-state helper for any list container.
  function setEmpty(container, message) {
    if (!container) return;
    container.innerHTML = `<p class="profile-card__empty">${escapeHtml(message)}</p>`;
  }

  // ---------- State ----------

  let currentProfile = null;     // last GET /api/users/:id response
  let currentStats = null;       // last GET /api/users/:id/stats response
  let currentTargetId = null;    // bigint id of the profile being viewed
  let currentUserId = null;      // bigint id of the logged-in viewer (or null)
  let schoolsLoaded = false;
  let userSettings = null;       // last GET /users/me/settings response
  let settingsLoaded = false;    // lazy flag for the settings fetch
  const loadedTabs = new Set();

  // Bookmarks tab state (owner only).
  let allBookmarks = [];        // full fetched GET /users/me/bookmarks list
  let allCollections = [];      // full fetched GET /users/me/folders list
  let bookmarkActivity = [];    // fetched GET /activities?type=note_bookmarked
  let bookmarksExpanded = false;
  let collectionsExpanded = false;
  // Rows shown in the list cards before "View All" is clicked.
  const SKIM_LIMIT = 6;

  // ---------- DOM references ----------

  function $(id) { return document.getElementById(id); }

const els = {};
  function cacheEls() {
    els.shell = $('profileShell');
    els.empty = $('profileEmpty');
    els.avatar = $('profileAvatar');
    els.avatarInitials = $('profileAvatarInitials');
    els.avatarImg = $('profileAvatarImg');
    els.avatarEdit = $('profileAvatarEdit');
    els.avatarInput = $('profileAvatarInput');
    els.bannerImg = $('profileBannerImg');
    els.bannerEdit = $('profileBannerEdit');
    els.bannerInput = $('profileBannerInput');
    els.name = $('profileName');
    els.badge = $('profileBadge');
    els.handle = $('profileHandle');
    els.bio = $('profileBio');
    els.city = $('profileCity');
    els.school = $('profileSchool');
    els.grade = $('profileGrade');
    els.statUploads = $('statUploads');
    els.statDownloads = $('statDownloads');
    els.statLikes = $('statLikes');
    els.statBookmarks = $('statBookmarks');
    els.overviewBio = $('overviewBio');
    els.overviewJoined = $('overviewJoined');
    els.overviewEmail = $('overviewEmail');
    els.notesList = $('notesList');
    els.notesSidebar = $('notesSidebar');
    els.notesHeading = $('notesHeading');
    els.notesSubheading = $('notesSubheading');
    els.activityList = $('activityList');
    els.activitySidebar = $('activitySidebar');
    els.settingsForm = $('settingsForm');
    els.settingsUsername = $('settingsUsername');
    els.settingsBio = $('settingsBio');
    els.settingsBioCount = $('settingsBioCount');
    els.settingsLocation = $('settingsLocation');
    els.settingsStrand = $('settingsStrand');
    els.settingsSchool = $('settingsSchool');
    els.settingsGrade = $('settingsGrade');
    els.settingsMessage = $('settingsMessage');
    els.privacyMessage = $('privacyMessage');
    els.notificationsMessage = $('notificationsMessage');
    els.securityMessage = $('securityMessage');
    els.securityCurrentPw = $('securityCurrentPw');
    els.securityNewPw = $('securityNewPw');
    els.securityConfirmPw = $('securityConfirmPw');
    els.securityUpdatePwBtn = $('securityUpdatePwBtn');
    els.securitySignOutAllBtn = $('securitySignOutAllBtn');
    els.privacyExportBtn = $('privacyExportBtn');
    els.settingsSaveBtn = $('settingsSaveBtn');
    els.settingsLogoutBtn = $('settingsLogoutBtn');
    els.overviewJoinedSettings = $('overviewJoinedSettings');
    els.overviewRoleSettings = $('overviewRoleSettings');
    els.overviewActivityList = $('overviewActivityList');
    els.settingsTabBtn = $('settingsTabBtn');
    els.notesSearch = $('notesSearch');
    els.newNoteBtn = $('newNoteBtn');
    els.bookmarksTabBtn = $('bookmarksTabBtn');
    els.bookmarksSearch = $('bookmarksSearch');
    els.bookmarksList = $('bookmarksList');
    els.bookmarksViewAll = $('bookmarksViewAll');
    els.addCollectionBtn = $('addCollectionBtn');
    els.collectionsList = $('collectionsList');
    els.collectionsViewAll = $('collectionsViewAll');
    els.collectionCreateForm = $('collectionCreateForm');
    els.collectionNameInput = $('collectionNameInput');
    els.collectionCreateBtn = $('collectionCreateBtn');
    els.collectionCancelBtn = $('collectionCancelBtn');
    els.bookmarkActivityList = $('bookmarkActivityList');
    els.catAllBookmarks = $('catAllBookmarks');
    els.catAllCollections = $('catAllCollections');
    els.catSubjects = $('catSubjects');
    els.confirmModal = $('profileConfirmModal');
    els.confirmBackdrop = $('profileConfirmBackdrop');
    els.confirmCancel = $('profileConfirmCancel');
    els.confirmOk = $('profileConfirmOk');
    els.confirmTitle = $('profileConfirmTitle');
    els.confirmMessage = $('profileConfirmMessage');
    els.collectionModal = $('collectionModal');
    els.collectionBackdrop = $('collectionBackdrop');
    els.collectionClose = $('collectionClose');
    els.collectionModalTitle = $('collectionModalTitle');
    els.collectionModalSubtitle = $('collectionModalSubtitle');
    els.collectionNotesList = $('collectionNotesList');
    els.collectionAddNotesBtn = $('collectionAddNotesBtn');
    els.collectionAddPicker = $('collectionAddPicker');
    els.collectionPickerList = $('collectionPickerList');
    els.collectionAddConfirmBtn = $('collectionAddConfirmBtn');
    els.collectionAddCancelBtn = $('collectionAddCancelBtn');
  }

  // ---------- Resolve target user ----------

  // Returns the public.users bigint id we should render. Order:
  //   1. ?user=<id> in the URL (the most explicit signal).
  //   2. The logged-in user's id from olongnotes_user (own profile view).
  //   3. null → caller shows the empty state.
  function resolveTargetId() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('user');
    if (fromUrl) {
      const id = parseInt(fromUrl);
      if (!Number.isNaN(id) && id > 0) return id;
    }
    const cached = readJSON('olongnotes_user');
    const cachedId = cached && (cached.id || cached.user_id);
    if (cachedId) {
      const id = parseInt(cachedId);
      if (!Number.isNaN(id) && id > 0) return id;
    }
    return null;
  }

  // ---------- Tab activation ----------

  // Single source of truth for switching tabs. Mirrors the prototype
  // exactly but writes ?tab=<name> to the URL so a refresh keeps the
  // active panel.
  function activate(tabName) {
    const tabs = document.querySelectorAll('.profile-tab');
    const panels = document.querySelectorAll('.profile-panel');
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tabName));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== tabName; });

    // Update URL without a navigation. Only write when different from
    // the current value so we don't churn history entries.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== tabName) {
        url.searchParams.set('tab', tabName);
        window.history.replaceState({}, '', url.toString());
      }
    } catch (_) { /* best-effort */ }

    // Lazy-load tab data on first activation.
    if (tabName === 'notes' && !loadedTabs.has('notes')) {
      loadedTabs.add('notes');
      loadMyNotes();
    } else if (tabName === 'activity' && !loadedTabs.has('activity')) {
      loadedTabs.add('activity');
      loadActivity();
    } else if (tabName === 'settings' && !loadedTabs.has('settings')) {
      loadedTabs.add('settings');
      loadSettingsForm();
    } else if (tabName === 'bookmarks' && !loadedTabs.has('bookmarks')) {
      // Owner-only (same gate as Settings): loadBookmarks() no-ops for
      // non-owners, so the panel just stays on its hidden state.
      loadedTabs.add('bookmarks');
      loadBookmarks();
    }
  }

  // ---------- Hero loader ----------

  // Fetches profile + stats in parallel. Renders the hero, the
  // overview About Me card, and reveals the shell. Hides the empty
  // state. Shows the Settings tab only when the viewer owns the profile.
  async function loadProfile(userId) {
    if (!api) {
      console.error('[profile] OlongNotes.api is not loaded.');
      showEmpty();
      return;
    }

    try {
      const [profileRes, statsRes] = await Promise.all([
        api.get(`/users/${encodeURIComponent(userId)}`),
        api.get(`/users/${encodeURIComponent(userId)}/stats`),
      ]);

      currentProfile = profileRes.user;
      currentStats = statsRes.stats;
      currentTargetId = userId;

      renderHero(currentProfile, currentStats);
      renderOverview(currentProfile);
      // Overview Recent Activity card — live feed from the user's
      // activity_log rows. Fires in parallel with the profile fetch
      // (loadOverviewActivity is fire-and-forget) so it doesn't gate
      // the hero render.
      loadOverviewActivity();
      // Don't auto-render Settings form here — it depends on whether
      // the viewer owns the profile and lazy-loads on tab activation.
      updateSettingsTabVisibility();
      updateBookmarksTabVisibility();

      if (els.shell) els.shell.hidden = false;
      if (els.empty) els.empty.hidden = true;
    } catch (err) {
      console.error('[profile] loadProfile failed:', err);
      // 404 → empty state; 5xx → same shell with an inline message.
      showEmpty();
    }
  }

function renderHero(user, stats) {
    if (!els.avatar || !user) return;
    const displayName = user.username || 'Member';
    // Avatar: if the user has a custom photo, show it (object-fit: cover
    // into the circular frame). Otherwise keep the initials fallback.
    const hasAvatar = user.avatar_url && user.avatar_url.trim();
    if (els.avatarInitials) els.avatarInitials.textContent = initialsOf(displayName);
    if (els.avatarImg) {
      els.avatarImg.hidden = !hasAvatar;
      if (hasAvatar) els.avatarImg.src = user.avatar_url;
      else els.avatarImg.removeAttribute('src');
    }
    // Banner: if the user has a custom cover image, show it (object-fit:
    // cover, center). Otherwise keep the navy gradient behind the overlay.
    const hasBanner = user.banner_url && user.banner_url.trim();
    if (els.bannerImg) {
      els.bannerImg.hidden = !hasBanner;
      if (hasBanner) els.bannerImg.src = user.banner_url;
      else els.bannerImg.removeAttribute('src');
    }
    if (els.name) els.name.textContent = displayName;
    if (els.badge) els.badge.textContent = roleLabel(user.role);
    if (els.handle) els.handle.textContent = `@${displayName} · Joined ${user.joined_label || joinedLabel(user.created_at)}`;
    if (els.bio) {
      els.bio.textContent = user.bio && user.bio.trim()
        ? user.bio
        : 'This user hasn\'t added a bio yet.';
    }

    // Hero meta row. Each piece falls back to an em-dash placeholder.
    setMeta(els.city, [
      SVG_PIN,
      user.location && user.location.trim() ? user.location : '—',
    ]);
    setMeta(els.school, [
      SVG_SCHOOL,
      user.school_name && user.school_name.trim() ? user.school_name : '—',
    ]);
    const gradeStrand = [user.grade_level, user.strand].filter(Boolean).join(' · ') || '—';
    setMeta(els.grade, [SVG_BOOK, gradeStrand]);

    if (els.statUploads) els.statUploads.textContent = formatCount((stats && stats.uploads) || 0);
    if (els.statDownloads) els.statDownloads.textContent = formatCount((stats && stats.downloads) || 0);
    // Hero "Likes" reflects what OTHERS think of this user's
    // contributions (likes_received), not how many likes they've given
    // out. Falls back gracefully for older API responses that lack it.
    if (els.statLikes) els.statLikes.textContent = formatCount((stats && stats.likes_received) || 0);
    if (els.statBookmarks) els.statBookmarks.textContent = formatCount((stats && stats.bookmarks) || 0);
  }

  // Replaces the children of `host` with [iconSpan, textSpan]. The
  // icon is preserved (it's a static SVG), only the text node after
  // it changes. Avoids building HTML for the meta line.
  function setMeta(host, [iconSvg, text]) {
    if (!host) return;
    // Keep the first child (the SVG), replace the rest.
    host.innerHTML = '';
    if (iconSvg) host.insertAdjacentHTML('afterbegin', iconSvg);
    const span = document.createElement('span');
    span.textContent = text;
    host.appendChild(span);
  }

  // Inline SVG snippets (used for the hero meta row). Kept identical
  // to the prototype's pattern; trailing whitespace doesn't matter
  // since they're inserted as innerHTML.
  const SVG_PIN =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 21s-7-4.35-7-10a7 7 0 0 1 14 0c0 5.65-7 10-7 10Z"/><circle cx="12" cy="11" r="2.5"/></svg>';
  const SVG_SCHOOL =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"/></svg>';
  const SVG_BOOK =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>';

  function renderOverview(user) {
    if (!user) return;
    if (els.overviewBio) {
      els.overviewBio.textContent = user.bio && user.bio.trim()
        ? user.bio
        : 'This user hasn\'t added a bio yet.';
    }
    if (els.overviewJoined) els.overviewJoined.textContent = user.joined_label || joinedLabel(user.created_at);
    if (els.overviewEmail) {
      // Email isn't returned by /api/users/:id for privacy — the
      // "Email" field is hidden in the settings form, so this row
      // intentionally shows the same handle as elsewhere.
      els.overviewEmail.textContent = `@${user.username || 'unknown'}`;
    }
    if (els.overviewJoinedSettings) els.overviewJoinedSettings.textContent = user.joined_label || joinedLabel(user.created_at);
    if (els.overviewRoleSettings) els.overviewRoleSettings.textContent = roleLabel(user.role);
  }

  // ---------- Overview Recent Activity ----------

  // Hits GET /api/users/:id/activities and renders the list directly
  // under the "Recent Activity" card on the Overview tab. No filter
  // chips (heart / download / bookmark) per the profile mockup — the
  // raw feed is shown top-to-bottom, newest first. The Activity tab
  // has its own structured view if the user wants the categorized
  // breakdown.
  async function loadOverviewActivity() {
    if (!currentTargetId || !api || !els.overviewActivityList) return;
    els.overviewActivityList.innerHTML = '<p class="profile-card__empty">Loading activity…</p>';

    try {
      const data = await api.get(`/users/${encodeURIComponent(currentTargetId)}/activities?limit=8`);
      const activities = (data && data.activities) || [];

      if (activities.length === 0) {
        els.overviewActivityList.innerHTML =
          '<p class="profile-card__empty">No recent activity yet — uploads, likes, and bookmarks will show up here.</p>';
        return;
      }

      els.overviewActivityList.innerHTML = activities.map(renderOverviewActivityItem).join('');
    } catch (err) {
      console.error('[profile] loadOverviewActivity failed:', err);
      els.overviewActivityList.innerHTML =
        '<p class="profile-card__empty">Could not load recent activity.</p>';
    }
  }

  // Renders a single activity_log row as a compact, scannable item.
  // Reuses the existing .activity-item + .activity-item__icon /
  // .activity-item__main / .activity-item__desc classes from the
  // prototype CSS so we don't need any new styles. The icon glyph
  // depends on the event type so the row reads at a glance.
  function renderOverviewActivityItem(a) {
    const desc = formatActivityDescription(a);
    const icon = activityIcon(a.type);
    const date = joinedLabel(a.created_at);
    return (
      '<div class="activity-item">' +
        '<span class="activity-item__icon" style="' + icon.style + '" aria-hidden="true">' + icon.svg + '</span>' +
        '<div class="activity-item__main">' +
          '<div class="activity-item__top">' +
            '<h4>' + desc + '</h4>' +
            '<span class="activity-item__date">' + escapeHtml(date) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // "Uploaded a new note: General Mathematics" / "Liked note: ..."
  // Returns an innerHTML-safe string for the activity-item title. We
  // build with plain text + escapeHtml so there's no XSS surface even
  // when the note title contains user-entered HTML.
  function formatActivityDescription(a) {
    const title = (a && a.title) || 'Untitled note';
    const verb = activityVerb(a.type);
    return escapeHtml(verb) + ': ' + escapeHtml(title);
  }

  // Maps an activity_log.activity_type value to a human-readable
  // verb. Unknown / new types fall back to the raw type so the row
  // still renders meaningfully.
  function activityVerb(type) {
    switch (type) {
      case 'note_uploaded':   return 'Uploaded a new note';
      case 'note_viewed':     return 'Viewed note';
      case 'note_liked':      return 'Liked note';
      case 'note_bookmarked': return 'Bookmarked note';
      case 'note_reported':   return 'Reported note';
      case 'note_deleted':    return 'Deleted note';
      default:                return type || 'Activity on note';
    }
  }

  // Returns the inline SVG + color hint for the activity row. Tinted
  // by event type so the list reads as a stream of distinct events.
  // Reuses the same color tokens as the prototype Activity tab.
  function activityIcon(type) {
    const palette = {
      note_uploaded:   { c: '#2F6FED', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/></svg>' },
      note_liked:      { c: '#E8546B', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21l8.84-8.61a5.5 5.5 0 0 0 0-7.78Z"/></svg>' },
      note_bookmarked: { c: '#9B5DE5', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/></svg>' },
      note_viewed:     { c: '#22B87A', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>' },
      note_reported:   { c: '#E07B00', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/></svg>' },
      note_deleted:    { c: '#8891A0', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>' },
    };
    const entry = palette[type] || { c: '#2F6FED', svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>' };
    return { svg: entry.svg, style: '--c:' + entry.c + ';' };
  }

  function showEmpty() {
    if (els.shell) els.shell.hidden = true;
    if (els.empty) els.empty.hidden = false;
  }

  // ---------- Settings tab visibility ----------

  // Hide the Settings tab for everyone except the profile owner. Admins
  // viewing their own profile keep the tab. Admins viewing someone
  // else's profile get the tab hidden too — we don't expose edit
  // rights beyond ownership in this cut.
  function updateSettingsTabVisibility() {
    if (!els.settingsTabBtn) return;
    const isOwner = currentUserId != null && currentTargetId === currentUserId;
    els.settingsTabBtn.hidden = !isOwner;

    // If Settings was the active tab and ownership flipped off, fall
    // back to Overview so the user isn't staring at an empty panel.
    if (!isOwner && els.settingsTabBtn.classList.contains('is-active')) {
      activate('overview');
    }
  }

// ---------- Custom avatar / banner upload (owner only) ----------

  // Client-side validation for the picked image. Returns an error string
  // or null if valid. Mirrors the BACKEND's PROFILE_IMAGE_MIMES exactly
  // (routes/users.js) and the 5MB cap — jpeg/png/webp only. Keeping the
  // two lists in sync avoids the "preview looks fine then server 400s"
  // jarring revert. The input accept="image/*" still narrows the picker
  // for UX; this re-checks the selected file's actual MIME.
  const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB — matches PROFILE_IMAGE_MAX_BYTES in routes/users.js
  const ALLOWED_IMAGE_MIMES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];
  function validateImageFile(file) {
    if (!file) return 'No file selected.';
    if (!ALLOWED_IMAGE_MIMES.includes(file.type)) {
      return 'Please choose an image file (JPG, PNG, or WebP).';
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return 'Image is too large. Maximum size is 5MB.';
    }
    return null;
  }

  // Shows a transient inline error near the hero. Kind = 'error' makes it
  // red; 'success' makes it green. Auto-hides after 4s.
  function showHeroNotice(text, kind) {
    // Reuse the settings message element (it's styled for both states) —
    // render it just above the hero so the error is visible without a
    // settings-tab dependency.
    let notice = document.getElementById('profileHeroNotice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'profileHeroNotice';
      notice.className = 'settings-message';
      const hero = document.querySelector('.profile-hero');
      hero && hero.parentNode.insertBefore(notice, hero);
    }
    notice.className = 'settings-message settings-message--' + (kind || 'success');
    notice.textContent = text;
    clearTimeout(notice._timer);
    notice._timer = setTimeout(() => { notice.hidden = true; }, 4000);
  }

  // Revoke a previously-created object URL (avoids a memory leak if the
  // user picks files repeatedly without a relayout).
  let pendingAvatarUrl = null;
  let pendingBannerUrl = null;

  // Generic upload flow shared by avatar + banner. Validates the file,
  // shows an immediate local preview (object URL), uploads via the
  // existing multipart POST endpoint, and on success updates the URL in
  // currentProfile + re-renders. On failure it reverts the preview back
  // to the previous state and shows an inline error.
  async function handleImageUpload({ kind, file, previewEl, imgEl, urlField }) {
    // Validate client-side.
    const err = validateImageFile(file);
    if (err) {
      showHeroNotice(err, 'error');
      return;
    }

    // Remember the current persisted URL so we can revert on failure.
    const previousUrl = (currentProfile && currentProfile[urlField]) || null;

    // Immediate local preview via object URL while the upload is in
    // flight so the UI doesn't feel frozen.
    const objectUrl = URL.createObjectURL(file);
    if (previewEl) {
      previewEl.hidden = false;
      previewEl.src = objectUrl;
    }
    if (kind === 'avatar') pendingAvatarUrl = objectUrl;
    else pendingBannerUrl = objectUrl;

    // Disable the edit buttons while uploading to prevent double-submits.
    if (els.avatarEdit) els.avatarEdit.disabled = true;
    if (els.bannerEdit) els.bannerEdit.disabled = true;

try {
      const formData = new FormData();
      formData.append('file', file);
      // The backend scopes the upload to the authenticated user via
      // req.user.id (PATCH /api/users/me/avatar and /me/banner), so we
      // don't pass the target id in the URL — ownership is implicit. The
      // api.patch helper forwards the FormData as multipart (isForm:true)
      // so multer can parse the uploaded file.
const res = await api.patch(
        `/users/me/${kind}`,
        formData,
        { auth: true, isForm: true }
      );
      // The backend returns the full updated profile as { user: profile },
      // shaped exactly like GET /api/users/:id — so the new URL lives at
      // res.user[urlField] (avatar_url or banner_url). Read it from there,
      // not off the top-level response.
      const updatedUser = (res && res.user) || {};
      // The backend returns { user: <profile> } where <profile> is shaped
      // exactly like GET /api/users/:id — so the persisted URL lives under
      // updatedUser[urlField] (avatar_url or banner_url). The previous
      // fallback chain (updatedUser.<other> / res.*) was dead: res is the
      // { user } envelope, so res.avatar_url was always undefined and could
      // only ever have masked a missing urlField with the wrong image.
      const newUrl = updatedUser[urlField];
      if (!newUrl) throw new Error('Upload succeeded but no URL was returned.');

      // Update in-memory profile + re-render so the persisted URL is used
      // (no longer the object URL).
      currentProfile[urlField] = newUrl;
      renderHero(currentProfile, currentStats || {});
      showHeroNotice('Photo updated.', 'success');
    } catch (e) {
      console.error(`[profile] ${kind} upload failed:`, e);
      // Revert the preview back to the previous state (photo or initials /
      // gradient fallback).
      if (imgEl) {
        if (previousUrl) { imgEl.src = previousUrl; imgEl.hidden = false; }
        else { imgEl.hidden = true; imgEl.removeAttribute('src'); }
      }
      if (e && e.status === 401) {
        if (ON.clearToken) ON.clearToken();
        showHeroNotice('Your session expired. Please log in again.', 'error');
      } else {
        showHeroNotice((e && e.message) || 'Upload failed. Please try again.', 'error');
      }
    } finally {
      if (els.avatarEdit) els.avatarEdit.disabled = false;
      if (els.bannerEdit) els.bannerEdit.disabled = false;
      // Clean up the pending object URL (the preview now uses the
      // persisted URL on success, or we've reverted on failure).
      const pending = kind === 'avatar' ? pendingAvatarUrl : pendingBannerUrl;
      if (pending) { try { URL.revokeObjectURL(pending); } catch (_) {} }
      if (kind === 'avatar') pendingAvatarUrl = null;
      else pendingBannerUrl = null;
    }
  }

// Wires the avatar + banner edit affordances. MUST only be called when
  // the viewer owns the profile. For non-owners the edit buttons AND the
  // hidden file inputs are REMOVED from the DOM entirely — not merely
  // hidden via CSS/`hidden` — so there is no reachable affordance, no
  // click handler, and no file input a viewer could trigger. This is a
  // hard ownership gate, not a cosmetic hide.
  function bindImageUploads() {
    const isOwner = Boolean(
      currentProfile && currentUserId != null && currentTargetId === currentUserId
    );

    if (!isOwner) {
      // Non-owner: strip the edit affordances from the DOM so they can't
      // be reached via DevTools, keyboard, or any event path.
      [els.avatarEdit, els.avatarInput, els.bannerEdit, els.bannerInput].forEach((el) => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      return;
    }

    // Avatar: clicking the overlay button opens the hidden file input.
    if (els.avatarEdit && els.avatarInput) {
      els.avatarEdit.hidden = false;
      els.avatarEdit.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.avatarInput.click();
      });
      els.avatarInput.addEventListener('change', () => {
        const file = els.avatarInput.files && els.avatarInput.files[0];
        els.avatarInput.value = '';
        if (file) {
          handleImageUpload({
            kind: 'avatar',
            file,
            previewEl: els.avatarImg,
            imgEl: els.avatarImg,
            urlField: 'avatar_url',
          });
        }
      });
    }

    // Banner: clicking the edit button opens the hidden file input.
    if (els.bannerEdit && els.bannerInput) {
      els.bannerEdit.hidden = false;
      els.bannerEdit.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.bannerInput.click();
      });
      els.bannerInput.addEventListener('change', () => {
        const file = els.bannerInput.files && els.bannerInput.files[0];
        els.bannerInput.value = '';
        if (file) {
          handleImageUpload({
            kind: 'banner',
            file,
            previewEl: els.bannerImg,
            imgEl: els.bannerImg,
            urlField: 'banner_url',
          });
        }
      });
    }
  }

  // ---------- My Notes loader ----------

  // Renders the user's published notes. Each card uses the same
  // .doc-card markup as the View All notes grid (notes.html) so My
  // Notes reads as part of the same family as every other notes
  // surface on the site — vertical layout, file-type badge,
  // like/download stats, Open File button.
  async function loadMyNotes() {
    if (!currentTargetId || !api) return;
    setEmpty(els.notesList, 'Loading notes…');

    try {
      const data = await api.get(`/users/${encodeURIComponent(currentTargetId)}/notes?limit=50`);
      const notes = (data && data.notes) || [];

      if (notes.length === 0) {
        if (els.notesHeading) els.notesHeading.textContent = 'My Notes';
        if (els.notesSubheading) els.notesSubheading.textContent = 'No notes yet — published uploads will show up here.';
        setEmpty(els.notesList, 'No notes yet.');
        renderNotesSidebar([]);
        return;
      }

      if (els.notesHeading) els.notesHeading.textContent = 'My Notes';
      if (els.notesSubheading) els.notesSubheading.textContent = `Showing ${notes.length} published note${notes.length === 1 ? '' : 's'}.`;

      renderNotes(notes);
      renderNotesSidebar(notes);
    } catch (err) {
      console.error('[profile] loadMyNotes failed:', err);
      setEmpty(els.notesList, 'Could not load notes. Please try again.');
      renderNotesSidebar([]);
    }
  }

  function renderNotes(notes) {
    if (!els.notesList) return;
    // Per-file-type icon (PDF / PPTX / DOCX / XLSX / IMG) — shared by
    // every page that renders document cards. Falls back to a generic
    // document badge if file-type-icons.js failed to load. We pass
    // "doc-card__file-icon" as the parent class so the new .doc-card
    // grid (matches notes.html View All style) sizes / rounds the
    // badge consistently with the rest of the site, while the shared
    // module drives color + inner glyph by MIME.
    const fileIconHtml = (window.OlongNotes && window.OlongNotes.fileIconMarkup)
      || ((ft) => '<span class="doc-card__file-icon" aria-hidden="true">' + DOC_ICON_SVG + '</span>');
    const badgeText = (window.OlongNotes && window.OlongNotes.fileTypeBadge)
      || ((ft) => (ft && ft.includes('pdf')) ? 'PDF' : (ft && ft.includes('image/')) ? 'IMG' : 'FILE');

    // Heart + download SVG icons — same icons used by notes.html so
    // stats read consistently between My Notes and View All.
    const heartIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21s-7-4.5-9.5-9.2C.6 7.8 2.7 4 6.3 4c2 0 3.5 1 4.7 2.6C12.2 5 13.7 4 15.7 4c3.6 0 5.7 3.8 3.8 7.8C19 16.5 12 21 12 21z"/></svg>';
    const downloadIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>';

    const cards = notes.map((n) => {
      const subject = (n.subjects && n.subjects.subject_name) || 'General';
      const school = (n.schools && n.schools.school_name) || '';
      const updated = n.updated_at || n.created_at;
      const fileType = n.file_type || '';
      const description = n.annotation
        || (fileType ? `Uploaded as ${escapeHtml(fileType.split('/').pop().toUpperCase())}.` : 'Uploaded note.');
      const likes = typeof n.likes_count === 'number' ? n.likes_count : 0;
      const downloads = typeof n.download_count === 'number' ? n.download_count : 0;

      return (
        '<article class="doc-card" data-note-id="' + escapeHtml(String(n.id)) + '">' +
          '<div class="doc-card__top">' +
            fileIconHtml(fileType, 'doc-card__file-icon') +
            '<span class="doc-card__badge">' + escapeHtml(badgeText(fileType)) + '</span>' +
          '</div>' +
          '<p class="doc-card__title">' + escapeHtml(n.title || 'Untitled') + '</p>' +
          '<p class="doc-card__caption">' + escapeHtml(description) + '</p>' +
          '<div class="doc-card__tags">' +
            (subject ? '<span class="doc-card__tag">' + escapeHtml(subject) + '</span>' : '') +
            (n.grade_level ? '<span class="doc-card__tag">' + escapeHtml(n.grade_level) + '</span>' : '') +
          '</div>' +
          '<div class="doc-card__stats">' +
            '<span class="doc-card__stat doc-card__stat--likes">' + heartIcon + ' ' + escapeHtml(String(likes)) + '</span>' +
            '<span class="doc-card__stat doc-card__stat--downloads">' + downloadIcon + ' ' + escapeHtml(String(downloads)) + ' downloads</span>' +
          '</div>' +
          '<button class="btn btn--outline btn--sm doc-card__open" type="button" data-open-note="' + escapeHtml(String(n.id)) + '">Open File</button>' +
        '</article>'
      );
    }).join('');

    els.notesList.innerHTML = cards;

    // Wire each card's "Open File" button to the same handler the
    // row-level click uses (routes to document-viewer.html). The card
    // itself is also clickable via the delegated handler below.
    els.notesList.querySelectorAll('[data-open-note]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-open-note');
        if (id) window.location.href = 'document-viewer.html?id=' + encodeURIComponent(id);
      });
    });
  }

  function renderNotesSidebar(notes) {
    if (!els.notesSidebar) return;
    // Top subjects — group by subject name and count.
    const counts = new Map();
    for (const n of notes) {
      const subj = (n.subjects && n.subjects.subject_name) || 'General';
      counts.set(subj, (counts.get(subj) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const total = notes.length;
    const rows = [
      '<li><span>All Notes</span><span>' + total + '</span></li>',
      ...ranked.map(([name, count]) => '<li><span>' + escapeHtml(name) + '</span><span>' + count + '</span></li>'),
    ].join('');

    els.notesSidebar.innerHTML =
      '<div class="profile-card">' +
        '<h2 class="profile-card__title">Categories</h2>' +
        '<ul class="category-list category-list--static">' + rows + '</ul>' +
      '</div>';
  }

  const DOC_ICON_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 2H16l4 4v16H6.5A1.5 1.5 0 0 1 5 20.5v-17A1.5 1.5 0 0 1 6.5 2Z"/><path d="M16 2v4h4M8.5 12h7M8.5 15.5h7M8.5 8.5h3"/></svg>';

  // ---------- "+ New Note" button → Upload Notes modal ----------

  // Wires the "+ New Note" button (top right of the notes list) to open
  // the SAME Upload Notes modal used across the app (id="uploadModal",
  // form + validation wired in js/script.js via window.OlongNotes).
  // We reuse the existing openUploadModal exposed by script.js instead of
  // building a new modal. Applies the same contributor role gate that the
  // home-page upload buttons use; falls back to index.html#upload if the
  // shared opener isn't available (e.g. script.js failed to load).
  function bindNewNoteButton() {
    if (!els.newNoteBtn) return;
    els.newNoteBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // Match script.js: uploads are restricted to contributors.
      const cached = readJSON('olongnotes_user');
      const allowed = cached && ['limited', 'verified', 'admin'].includes(cached.role);
      if (!allowed) {
        alert('You need to be a contributor (limited, verified, or admin) to upload. Contact an admin to upgrade your account.');
        return;
      }

      const openUpload = (window.OlongNotes && window.OlongNotes.openUploadModal);
      if (typeof openUpload === 'function') {
        openUpload();
        return;
      }

      // Graceful fallback: reuse the original link target.
      window.location.href = els.newNoteBtn.getAttribute('href') || 'index.html#upload';
    });
  }

  // Client-side search filter for the notes list. Runs on the already-
  // fetched 50 rows — no backend round-trip. Title + subject + grade
  // are all searched, case-insensitive.
  function bindNotesSearch() {
    if (!els.notesSearch) return;
    els.notesSearch.addEventListener('input', () => {
      const q = els.notesSearch.value.trim().toLowerCase();
      const cards = els.notesList ? els.notesList.querySelectorAll('.doc-card') : [];
      let visible = 0;
      cards.forEach((card) => {
        const text = card.textContent.toLowerCase();
        const match = !q || text.includes(q);
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      if (els.notesSubheading) {
        if (!q) {
          els.notesSubheading.textContent = cards.length === 0
            ? 'No notes yet.'
            : `Showing ${cards.length} published note${cards.length === 1 ? '' : 's'}.`;
        } else {
          els.notesSubheading.textContent = `${visible} match${visible === 1 ? '' : 'es'} for "${els.notesSearch.value}".`;
        }
      }
    });
  }

// ---------- Note card click → document viewer ----------

  // Makes each note card open the document viewer, matching the rest of
  // the app's established routing (used by school-profile.js and
  // subject-notes.js): document-viewer.html?id=<note_id>.
  //
  // The listener is delegated on the list container so it survives the
  // node re-renders from renderNotes() and the search filter. Clicks on
  // interactive elements are ignored so they keep their own behavior —
  // this is a generic guard that stays a no-op today but automatically
  // covers a future "..." menu/dropdown (or any .actions / button / link
  // / input) without needing rework.
  function bindNotesCardClick() {
    if (!els.notesList) return;
    els.notesList.addEventListener('click', (e) => {
      // Ignore clicks on interactive/actionable elements so they don't
      // also trigger navigation. This covers buttons, links, inputs,
      // any element marked [data-no-navigate], and future action areas
      // like a "..." menu (e.g. .doc-card__actions / .actions).
      const target = e.target;
      if (target.closest('button, a, input, select, textarea, [data-no-navigate], .actions, .doc-card__actions, .doc-card__menu')) {
        return;
      }

      const card = target.closest('.doc-card');
      if (!card) return;
      const id = card.dataset.noteId;
      if (!id) return;

      window.location.href = `document-viewer.html?id=${encodeURIComponent(id)}`;
    });
  }

  // ---------- Activity loader ----------

  // Fetches the user's questions + answers in parallel and renders the
  // Activity tab. Each section shows the top 3 entries with the
  // matching prototype styling. The sidebar shows contribution totals
  // and the user's top subjects.
  async function loadActivity() {
    if (!currentTargetId || !api) return;
    setEmpty(els.activityList, 'Loading activity…');

    try {
      const [questionsRes, answersRes] = await Promise.all([
        api.get(`/users/${encodeURIComponent(currentTargetId)}/questions?limit=50`),
        api.get(`/users/${encodeURIComponent(currentTargetId)}/answers?limit=50`),
      ]);
      const questions = (questionsRes && questionsRes.questions) || [];
      const answers = (answersRes && answersRes.answers) || [];

      renderActivity(questions, answers);
      renderActivitySidebar(questions, answers);
    } catch (err) {
      console.error('[profile] loadActivity failed:', err);
      setEmpty(els.activityList, 'Could not load activity. Please try again.');
    }
  }

  function renderActivity(questions, answers) {
    if (!els.activityList) return;

    const topAnswers = answers.slice(0, 3);
    const topQuestions = questions.slice(0, 3);

    const answersHtml = topAnswers.length === 0
      ? '<p class="profile-card__empty">No answers yet.</p>'
      : topAnswers.map((a) => renderAnswerItem(a)).join('');

    const questionsHtml = topQuestions.length === 0
      ? '<p class="profile-card__empty">No questions yet.</p>'
      : topQuestions.map((q) => renderQuestionItem(q)).join('');

    els.activityList.innerHTML =
      '<div class="profile-card activity-section">' +
        '<div class="activity-section__head">' +
          '<span class="activity-section__icon" style="--c:#22B87A;" aria-hidden="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
          '</span>' +
          '<div class="activity-section__title">' +
            '<h3>Answers (' + answers.length + ')</h3>' +
            '<p>Questions you\'ve answered</p>' +
          '</div>' +
        '</div>' +
        answersHtml +
      '</div>' +
      '<div class="profile-card activity-section">' +
        '<div class="activity-section__head">' +
          '<span class="activity-section__icon" style="--c:#2F6FED;" aria-hidden="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1.5 1-1.5 2.2"/><path d="M12 17.5h.01"/></svg>' +
          '</span>' +
          '<div class="activity-section__title">' +
            '<h3>Questions (' + questions.length + ')</h3>' +
            '<p>Questions you\'ve asked</p>' +
          '</div>' +
        '</div>' +
        questionsHtml +
      '</div>';
  }

  function renderAnswerItem(a) {
    const subj = (a.questions && a.questions.subjects && a.questions.subjects.subject_name) || 'General';
    const qTitle = (a.questions && a.questions.title) || 'Question';
    const qId = (a.questions && a.questions.id) || '';
    const accepted = a.is_accepted ? '<span class="activity-item__tag" style="background:rgba(34,184,122,.16);color:#1f7a55;border-color:transparent;">Accepted</span>' : '';
    const date = joinedLabel(a.created_at);
    return (
      '<div class="activity-item">' +
        '<span class="activity-item__icon" style="--c:#22B87A;" aria-hidden="true">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3L16 10"/></svg>' +
        '</span>' +
        '<div class="activity-item__main">' +
          '<div class="activity-item__top">' +
            '<h4><a href="question.html?id=' + encodeURIComponent(qId) + '" style="color:inherit;text-decoration:none;">' + escapeHtml(qTitle) + '</a></h4>' +
            '<span class="activity-item__date">' + escapeHtml(date) + '</span>' +
          '</div>' +
          '<p class="activity-item__desc">' + escapeHtml(a.content_preview || a.content || '') + '</p>' +
          '<div class="activity-item__meta">' +
            '<span class="activity-item__tag">' + escapeHtml(subj) + '</span>' +
            accepted +
            '<span class="activity-item__upvotes">' +
              '<span>Upvotes</span>' +
              '<strong>' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21h3V10H2v11Zm19-10a2 2 0 0 0-2-2h-6.3l.9-4.4.03-.3a1.5 1.5 0 0 0-.44-1.06L12.17 2 6.59 7.59A2 2 0 0 0 6 9v10a2 2 0 0 0 2 2h9a2 2 0 0 0 1.84-1.21l3-7A2 2 0 0 0 22 12v-1.03L21 11Z"/></svg>' +
                formatCount(a.likes_count || 0) +
              '</strong>' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderQuestionItem(q) {
    const subj = (q.subjects && q.subjects.subject_name) || 'General';
    const date = joinedLabel(q.created_at);
    return (
      '<div class="activity-item">' +
        '<span class="activity-item__icon" style="--c:#2F6FED;" aria-hidden="true">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.7 9.7a2.3 2.3 0 1 1 3.2 2.1c-.8.4-1.4.9-1.4 2"/><path d="M12 16.2h.01"/></svg>' +
        '</span>' +
        '<div class="activity-item__main">' +
          '<div class="activity-item__top">' +
            '<h4><a href="question.html?id=' + encodeURIComponent(q.id) + '" style="color:inherit;text-decoration:none;">' + escapeHtml(q.title || 'Untitled') + '</a></h4>' +
            '<span class="activity-item__date">' + escapeHtml(date) + '</span>' +
          '</div>' +
          '<div class="activity-item__meta">' +
            '<span class="activity-item__tag">' + escapeHtml(subj) + '</span>' +
            '<span class="activity-item__stat">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"/></svg>' +
              (q.answers_count || 0) + ' Answer' + (q.answers_count === 1 ? '' : 's') +
            '</span>' +
            '<span class="activity-item__stat">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>' +
              (q.likes_count || 0) + ' Likes' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderActivitySidebar(questions, answers) {
    if (!els.activitySidebar) return;

    // Top categories — combined question + answer counts grouped by
    // subject name. Answers contribute subject from the parent question.
    const counts = new Map();
    for (const q of questions) {
      const subj = (q.subjects && q.subjects.subject_name) || 'General';
      counts.set(subj, (counts.get(subj) || 0) + 1);
    }
    for (const a of answers) {
      const subj = (a.questions && a.questions.subjects && a.questions.subjects.subject_name) || 'General';
      counts.set(subj, (counts.get(subj) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Aggregate answer stats.
    const totalUpvotes = answers.reduce((sum, a) => sum + (a.likes_count || 0), 0);
    const verifiedAnswers = answers.filter((a) => a.is_accepted).length;

    const summaryRows = [
      '<li><span>Total Answers</span><span>' + answers.length + '</span></li>',
      '<li><span>Total Questions</span><span>' + questions.length + '</span></li>',
      '<li><span>Total Upvotes</span><span>' + totalUpvotes + '</span></li>',
      '<li><span>Verified Answers</span><span>' + verifiedAnswers + '</span></li>',
    ].join('');

    const topCats = ranked.length === 0
      ? '<li><span>No categories yet</span><span></span></li>'
      : ranked.map(([name, count]) => '<li><span>' + escapeHtml(name) + '</span><span>' + count + '</span></li>').join('');

    els.activitySidebar.innerHTML =
      '<div class="profile-card">' +
        '<h2 class="profile-card__title">Contribution Summary</h2>' +
        '<ul class="stat-list">' + summaryRows + '</ul>' +
      '</div>' +
      '<div class="profile-card">' +
        '<h2 class="profile-card__title">Top Categories</h2>' +
        '<ul class="category-list category-list--static">' + topCats + '</ul>' +
      '</div>';
  }

  // ---------- Bookmarks tab (owner only) ----------

  // The Bookmarks tab is a personal space backed by auth-scoped reads
  // (GET /users/me/*), so it only makes sense for the viewer who owns the
  // profile. Non-owners get the tab hidden, same gate as Settings.
  function updateBookmarksTabVisibility() {
    if (!els.bookmarksTabBtn) return;
    const isOwner = currentUserId != null && currentTargetId === currentUserId;
    els.bookmarksTabBtn.hidden = !isOwner;

    // Keep the panel itself off a non-owner's screen even if the HTML
    // somehow has it visible (belt-and-suspenders alongside the deep-link
    // guard in boot()).
    if (!isOwner) {
      document.querySelectorAll('.profile-panel[data-panel="bookmarks"]').forEach((p) => {
        p.hidden = true;
      });
    }
  }

  function isBookmarksOwner() {
    return currentUserId != null && currentTargetId === currentUserId;
  }

  // Fetches bookmarks + collections + bookmark activity in parallel and
  // renders all three surfaces + the sidebar counts. Reuses the shared
  // activity renderer (renderOverviewActivityItem) for the activity card.
  async function loadBookmarks() {
    if (!api || !isBookmarksOwner()) return;
    setEmpty(els.bookmarksList, 'Loading bookmarks…');
    setEmpty(els.collectionsList, 'Loading collections…');

    try {
      const [bookmarksRes, foldersRes, activityRes] = await Promise.all([
        api.get('/users/me/bookmarks?limit=100', { auth: true }),
        api.get('/users/me/folders', { auth: true }),
        api.get('/activities?type=note_bookmarked&limit=8', { auth: true }),
      ]);

      allBookmarks = (bookmarksRes && bookmarksRes.bookmarks) || [];
      allCollections = (foldersRes && foldersRes.folders) || [];
      bookmarkActivity = (activityRes && activityRes.activities) || [];

      renderBookmarks();
      renderCollections();
      renderBookmarkSidebar();
      renderBookmarkActivity();
    } catch (err) {
      console.error('[profile] loadBookmarks failed:', err);
      setEmpty(els.bookmarksList, 'Could not load bookmarks.');
      setEmpty(els.collectionsList, 'Could not load collections.');
      if (err && err.status === 401 && ON.clearToken) ON.clearToken();
    }
  }

  // Bookmarks rows call this on any input + toggle change, so the search
  // filter and the View All / Show Less state always agree.
  function filteredBookmarks() {
    const q = els.bookmarksSearch
      ? (els.bookmarksSearch.value || '').trim().toLowerCase()
      : '';
    if (!q) return allBookmarks;
    return allBookmarks.filter((b) => {
      const haystack = [
        b.title,
        (b.subjects && b.subjects.subject_name) || '',
        (b.schools && b.schools.school_name) || '',
        b.grade_level || '',
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  function renderBookmarks() {
    if (!els.bookmarksList) return;
    const visible = filteredBookmarks();
    const rows = bookmarksExpanded ? visible : visible.slice(0, SKIM_LIMIT);
    const hasMore = visible.length > SKIM_LIMIT;

    if (visible.length === 0) {
      setEmpty(els.bookmarksList, allBookmarks.length === 0
        ? 'No bookmarks yet — tap the bookmark icon on any note to save it here.'
        : 'No bookmarks match your search.');
    } else {
      els.bookmarksList.innerHTML = rows.map(renderBookmarkRow).join('');
    }

    if (els.bookmarksViewAll) {
      els.bookmarksViewAll.hidden = !hasMore;
      els.bookmarksViewAll.textContent = bookmarksExpanded ? 'Show Less' : 'View All';
    }
  }

  function renderBookmarkRow(b) {
    const noteId = b.id != null ? String(b.id) : '';
    const title = b.title || 'Untitled';
    const subject = (b.subjects && b.subjects.subject_name) || 'General';
    const school = (b.schools && b.schools.school_name) || '';
    const sub = [subject, school].filter(Boolean).join(' · ');
    return (
      '<li class="bookmark-row" data-open-bookmark="' + escapeHtml(noteId) + '">' +
        '<span class="bookmark-row__icon" style="--c:' + bookmarkColor(subject) + ';" aria-hidden="true">' + SVG_BOOKMARK_ICON + '</span>' +
        '<div class="bookmark-row__body">' +
          '<p class="bookmark-row__title">' + escapeHtml(title) + '</p>' +
          '<p class="bookmark-row__sub">' + escapeHtml(sub) + '</p>' +
        '</div>' +
        '<button class="bookmark-row__menu bookmark-row__menu--remove" type="button" data-unbookmark="' + escapeHtml(noteId) + '" aria-label="Remove bookmark: ' + escapeHtml(title) + '">' + SVG_X_ICON + '</button>' +
      '</li>'
    );
  }

  function renderCollections() {
    if (!els.collectionsList) return;
    const rows = collectionsExpanded ? allCollections : allCollections.slice(0, SKIM_LIMIT);
    const hasMore = allCollections.length > SKIM_LIMIT;

    if (allCollections.length === 0) {
      setEmpty(els.collectionsList, 'No collections yet — create one with "+ Add Collection".');
    } else {
      els.collectionsList.innerHTML = rows.map((f) => {
        const count = Number(f.note_count) || 0;
        return (
          '<li class="bookmark-row" data-open-folder="' + escapeHtml(String(f.id)) + '" role="button" tabindex="0" aria-label="Open collection: ' + escapeHtml(f.folder_name || '') + '">' +
            '<span class="bookmark-row__icon" style="--c:#2F6FED;" aria-hidden="true">' + SVG_FOLDER_ICON + '</span>' +
            '<div class="bookmark-row__body">' +
              '<p class="bookmark-row__title">' + escapeHtml(f.folder_name || 'Untitled') + '</p>' +
              '<p class="bookmark-row__sub">' + count + ' note' + (count === 1 ? '' : 's') + '</p>' +
            '</div>' +
            '<button class="bookmark-row__menu bookmark-row__menu--danger" type="button" data-delete-folder="' + escapeHtml(String(f.id)) + '" aria-label="Delete collection: ' + escapeHtml(f.folder_name || '') + '">' + SVG_TRASH_ICON + '</button>' +
          '</li>'
        );
      }).join('');
    }

    if (els.collectionsViewAll) {
      els.collectionsViewAll.hidden = !hasMore;
      els.collectionsViewAll.textContent = collectionsExpanded ? 'Show Less' : 'View All';
    }
  }

  // Sidebar "Categories": All Bookmarks / All Collections / distinct
  // Subjects, all derived from the live lists.
  function renderBookmarkSidebar() {
    const subjects = new Set();
    for (const b of allBookmarks) {
      subjects.add((b.subjects && b.subjects.subject_name) || 'General');
    }
    if (els.catAllBookmarks) els.catAllBookmarks.textContent = String(allBookmarks.length);
    if (els.catAllCollections) els.catAllCollections.textContent = String(allCollections.length);
    if (els.catSubjects) els.catSubjects.textContent = String(subjects.size);
  }

  function renderBookmarkActivity() {
    if (!els.bookmarkActivityList) return;
    if (bookmarkActivity.length === 0) {
      els.bookmarkActivityList.innerHTML = '<p class="profile-card__empty">No bookmark activity yet.</p>';
      return;
    }
    els.bookmarkActivityList.innerHTML = bookmarkActivity.map(renderOverviewActivityItem).join('');
  }

  // Returns a modal-driven yes/no dialog (replaces the browser confirm()).
  // Resolves true on confirm, false on cancel/backdrop/Escape. The message
  // is plain text (textContent) so user-derived copy never injects HTML.
  function confirmDialog({ title, message, okText = 'Remove' }) {
    return new Promise((resolve) => {
      if (!els.confirmModal) return resolve(false);
      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        els.confirmModal.hidden = true;
        cleanup();
        resolve(val);
      };
      const onCancel = () => finish(false);
      const onOk = () => finish(true);
      const onKey = (e) => {
        if (e.key === 'Escape') finish(false);
      };
      const onBackdrop = (e) => {
        if (e.target === els.confirmBackdrop) finish(false);
      };
      const onScroll = () => finish(false);
      const cleanup = () => {
        els.confirmOk.removeEventListener('click', onOk);
        els.confirmCancel.removeEventListener('click', onCancel);
        els.confirmBackdrop.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', onScroll, { capture: true });
      };

      els.confirmTitle.textContent = title;
      els.confirmMessage.textContent = message;
      els.confirmOk.textContent = okText;
      els.confirmModal.hidden = false;

      els.confirmOk.addEventListener('click', onOk);
      els.confirmCancel.addEventListener('click', onCancel);
      els.confirmBackdrop.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
      // Scrolling under the modal strands it (position:fixed) — treat it
      // like the backdrop click: the action is dismissed.
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
      els.confirmOk.focus();
    });
  }

  // Removes a bookmark via the same toggle endpoint the document viewer
  // uses (POST /notes/:id/bookmark), then re-renders in place. Confirmed
  // through the styled dialog (not the default error-styled icon).
  async function unbookmark(note) {
    if (!api || !isBookmarksOwner()) return;
    if (!note) return;
    const title = note.title || 'this note';
    const confirmed = await confirmDialog({
      title: 'Remove bookmark?',
      message: `Are you sure you want to remove \"${title}\" from your bookmarks?`,
      okText: 'Remove',
    });
    if (!confirmed) return;
    try {
      await api.post('/notes/' + encodeURIComponent(note.id) + '/bookmark', {}, { auth: true });
      allBookmarks = allBookmarks.filter((b) => String(b.id) !== String(note.id));
      renderBookmarks();
      renderBookmarkSidebar();
    } catch (err) {
      console.error('[profile] unbookmark failed:', err);
      alert((err && err.message) || 'Could not remove bookmark.');
    }
  }

  // Deletes a collection via DELETE /api/folders/:id. Deleting the folder
  // never touches the notes inside it — folder_items rows are removed, the
  // notes stay bookmarked as before.
  async function deleteCollection(folder) {
    if (!api || !isBookmarksOwner()) return;
    if (!folder) return;
    const name = folder.folder_name || 'this collection';
    const confirmed = await confirmDialog({
      title: 'Delete collection?',
      message: `Are you sure you want to delete \"${name}\"? The notes inside it will not be deleted.`,
      okText: 'Delete',
    });
    if (!confirmed) return;
    try {
      await api.delete('/folders/' + encodeURIComponent(folder.id), { auth: true });
      allCollections = allCollections.filter((f) => String(f.id) !== String(folder.id));
      renderCollections();
      renderBookmarkSidebar();
    } catch (err) {
      console.error('[profile] delete collection failed:', err);
      alert((err && err.message) || 'Could not delete collection.');
    }
  }

  // Creates a collection via POST /api/folders and appends it to the
  // rendered list. note_count starts at 0 (folders begin empty; notes are
  // added from the document viewer in a later cut).
  async function createCollection(name) {
    const res = await api.post('/folders', { folder_name: name }, { auth: true });
    const folder = (res && res.folder) || {};
    if (folder.id == null) {
      // Defensive: if the shape ever changes, refetch the full list
      // instead of guessing.
      await loadBookmarks();
      return;
    }
    allCollections = allCollections.concat({
      id: folder.id,
      folder_name: folder.folder_name || name,
      created_at: folder.created_at || null,
      note_count: 0,
    });
    renderCollections();
    renderBookmarkSidebar();
  }

  // ---------- Bookmarks wiring ----------

  // Bookmark list clicks: rows navigate to the document viewer; the X
  // (remove) button unbookmarks. Delegated so re-renders stay wired.
  function bindBookmarkListClick() {
    if (!els.bookmarksList) return;
    els.bookmarksList.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-unbookmark]');
      if (removeBtn) {
        const id = removeBtn.getAttribute('data-unbookmark');
        const note = allBookmarks.find((b) => String(b.id) === String(id));
        unbookmark(note);
        return;
      }
      const row = e.target.closest('[data-open-bookmark]');
      if (row) {
        const id = row.getAttribute('data-open-bookmark');
        if (id) window.location.href = 'document-viewer.html?id=' + encodeURIComponent(id);
      }
    });
  }

  function bindCollectionsListClick() {
    if (!els.collectionsList) return;
    els.collectionsList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-folder]');
      if (btn) {
        const id = btn.getAttribute('data-delete-folder');
        const folder = allCollections.find((f) => String(f.id) === String(id));
        deleteCollection(folder);
        return;
      }
      const row = e.target.closest('[data-open-folder]');
      if (row) {
        const id = row.getAttribute('data-open-folder');
        const folder = allCollections.find((f) => String(f.id) === String(id));
        openCollection(folder);
      }
    });
    // Keyboard access for the clickable collection rows.
    els.collectionsList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-open-folder]');
      if (row) {
        e.preventDefault();
        const id = row.getAttribute('data-open-folder');
        const folder = allCollections.find((f) => String(f.id) === String(id));
        openCollection(folder);
      }
    });
  }

  // ---------- Collection detail modal ----------

  let activeCollection = null;     // folder object being viewed
  let collectionNotes = [];        // notes currently inside the folder
  let userNotesForPicker = [];     // owner uploads offered in the picker

  function openCollection(folder) {
    if (!folder || !els.collectionModal) return;
    activeCollection = folder;
    if (els.collectionModalTitle) {
      els.collectionModalTitle.textContent = folder.folder_name || 'Collection';
    }
    if (els.collectionModalSubtitle) els.collectionModalSubtitle.textContent = 'Loading…';
    if (els.collectionNotesList) {
      els.collectionNotesList.innerHTML = '<li class="profile-card__empty">Loading notes…</li>';
    }
    if (els.collectionAddPicker) els.collectionAddPicker.hidden = true;
    els.collectionModal.hidden = false;
    loadCollectionNotes(folder.id);
    loadPickerNotes();
  }

  function closeCollectionModal() {
    if (!els.collectionModal) return;
    els.collectionModal.hidden = true;
    activeCollection = null;
  }

  // GET /api/folders/:id → folder + its notes.
  async function loadCollectionNotes(folderId) {
    if (!api) return;
    try {
      const data = await api.get('/folders/' + encodeURIComponent(folderId), { auth: true });
      collectionNotes = (data && data.notes) || [];
      renderCollectionNotes();
      if (els.collectionModalSubtitle) {
        const n = collectionNotes.length;
        els.collectionModalSubtitle.textContent = n + ' note' + (n === 1 ? '' : 's');
      }
    } catch (err) {
      console.error('[profile] loadCollectionNotes failed:', err);
      if (els.collectionNotesList) {
        els.collectionNotesList.innerHTML =
          '<li class="profile-card__empty">Could not load collection notes.</li>';
      }
    }
  }

  function renderCollectionNotes() {
    if (!els.collectionNotesList) return;
    if (collectionNotes.length === 0) {
      els.collectionNotesList.innerHTML =
        '<li class="collection-empty">' +
          '<span class="collection-empty__icon" aria-hidden="true">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z"/></svg>' +
          '</span>' +
          '<span>This collection is empty — click "Add Notes" to fill it.</span>' +
        '</li>';
      return;
    }
    els.collectionNotesList.innerHTML = collectionNotes.map((n) => {
      const subject = (n.subjects && n.subjects.subject_name) || 'General';
      const school = (n.schools && n.schools.school_name) || '';
      const sub = [subject, school].filter(Boolean).join(' · ') || 'Note';
      return (
        '<li class="collection-note-row" data-open-collection-note="' + escapeHtml(String(n.id)) + '" role="button" tabindex="0">' +
          '<div class="collection-note-row__body">' +
            '<p class="collection-note-row__title">' + escapeHtml(n.title || 'Untitled') + '</p>' +
            '<p class="collection-note-row__sub">' + escapeHtml(sub) + '</p>' +
          '</div>' +
          '<button class="collection-note-row__remove" type="button" data-remove-from-folder="' + escapeHtml(String(n.id)) + '" aria-label="Remove note from collection: ' + escapeHtml(n.title || '') + '">' + SVG_X_ICON + '</button>' +
        '</li>'
      );
    }).join('');
  }

  // GET /api/users/me/notes → owner's uploads for the picker.
  async function loadPickerNotes() {
    if (!api || !currentUserId) return;
    if (userNotesForPicker.length > 0) return;   // cached after first load
    if (!els.collectionPickerList) return;
    els.collectionPickerList.innerHTML = '<li class="profile-card__empty">Loading your notes…</li>';
    try {
      const data = await api.get('/users/' + encodeURIComponent(currentUserId) + '/notes?limit=100');
      userNotesForPicker = (data && data.notes) || [];
      renderPickerNotes();
    } catch (err) {
      console.error('[profile] loadPickerNotes failed:', err);
      els.collectionPickerList.innerHTML =
        '<li class="profile-card__empty">Could not load your notes.</li>';
    }
  }

  function renderPickerNotes() {
    if (!els.collectionPickerList) return;
    if (userNotesForPicker.length === 0) {
      els.collectionPickerList.innerHTML =
        '<li class="collection-empty">' +
          '<span class="collection-empty__icon" aria-hidden="true">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 19h16"/></svg>' +
          '</span>' +
          '<span>You haven\'t uploaded any notes yet.</span>' +
        '</li>';
      return;
    }
    const inCollection = new Set(collectionNotes.map((n) => String(n.id)));
    els.collectionPickerList.innerHTML = userNotesForPicker.map((n) => {
      const subject = (n.subjects && n.subjects.subject_name) || 'General';
      const already = inCollection.has(String(n.id));
      return (
        '<li class="collection-picker-row' + (already ? ' is-in-collection' : '') + '" data-picker-note="' + escapeHtml(String(n.id)) + '">' +
          '<input type="checkbox" data-picker-check="' + escapeHtml(String(n.id)) + '"' + (already ? ' disabled' : '') + ' aria-label="Select note: ' + escapeHtml(n.title || '') + '" />' +
          '<div class="collection-picker-row__body">' +
            '<p class="collection-picker-row__title">' + escapeHtml(n.title || 'Untitled') + '</p>' +
            '<p class="collection-picker-row__sub">' + escapeHtml(subject) + '</p>' +
          '</div>' +
        '</li>'
      );
    }).join('');
  }

  async function addSelectedToCollection() {
    if (!api || !activeCollection) return;
    if (!els.collectionPickerList) return;
    const checks = els.collectionPickerList.querySelectorAll('input[data-picker-check]:checked');
    const ids = Array.from(checks).map((c) => c.getAttribute('data-picker-check'));
    if (ids.length === 0) {
      alert('Select at least one note to add.');
      return;
    }
    if (els.collectionAddConfirmBtn) els.collectionAddConfirmBtn.disabled = true;
    try {
      await Promise.all(ids.map((noteId) =>
        api.post('/folders/' + encodeURIComponent(activeCollection.id) + '/items', { note_id: parseInt(noteId, 10) }, { auth: true })
      ));
      // Refresh the folder's notes + the collections list counts.
      await loadCollectionNotes(activeCollection.id);
      renderPickerNotes();
      await refreshCollections();
    } catch (err) {
      console.error('[profile] addSelectedToCollection failed:', err);
      alert((err && err.message) || 'Could not add notes to collection.');
    } finally {
      if (els.collectionAddConfirmBtn) els.collectionAddConfirmBtn.disabled = false;
    }
  }

  async function removeFromCollection(noteId) {
    if (!api || !activeCollection) return;
    const confirmed = await confirmDialog({
      title: 'Remove note?',
      message: 'Remove this note from the collection? The note itself will not be deleted.',
      okText: 'Remove',
    });
    if (!confirmed) return;
    try {
      await api.delete('/folders/' + encodeURIComponent(activeCollection.id) + '/items/' + encodeURIComponent(noteId), { auth: true });
      await loadCollectionNotes(activeCollection.id);
      renderPickerNotes();
      await refreshCollections();
    } catch (err) {
      console.error('[profile] removeFromCollection failed:', err);
      alert((err && err.message) || 'Could not remove note from collection.');
    }
  }

  // Re-fetch GET /users/me/folders after add/remove so the sidebar counts
  // and the row list stay in sync with what the modal changed.
  async function refreshCollections() {
    if (!api || !isBookmarksOwner()) return;
    try {
      const res = await api.get('/users/me/folders', { auth: true });
      allCollections = (res && res.folders) || [];
      renderCollections();
      renderBookmarkSidebar();
    } catch (err) {
      console.error('[profile] refreshCollections failed:', err);
    }
  }

  function bindCollectionModal() {
    if (!els.collectionModal) return;
    els.collectionClose?.addEventListener('click', closeCollectionModal);
    els.collectionBackdrop?.addEventListener('click', (e) => {
      if (e.target === els.collectionBackdrop) closeCollectionModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.collectionModal && !els.collectionModal.hidden) {
        closeCollectionModal();
      }
    });
    // Closing on scroll: the modal is position:fixed, so scrolling the
    // page (or a container under it) strands it mid-viewport. Capture
    // phase catches scrolls from every scrollable ancestor, but we
    // keep scrolling INSIDE the modal's own scrollable body alive.
    window.addEventListener('scroll', (e) => {
      const t = e.target;
      if (t instanceof Element && els.collectionModal && els.collectionModal.contains(t)) return;
      if (els.collectionModal && !els.collectionModal.hidden) closeCollectionModal();
    }, { capture: true, passive: true });
    els.collectionAddNotesBtn?.addEventListener('click', () => {
      if (els.collectionAddPicker) els.collectionAddPicker.hidden = !els.collectionAddPicker.hidden;
    });
    els.collectionAddCancelBtn?.addEventListener('click', () => {
      if (els.collectionAddPicker) els.collectionAddPicker.hidden = true;
    });
    els.collectionAddConfirmBtn?.addEventListener('click', addSelectedToCollection);

    // Notes list: click navigates to the note; the X removes it.
    els.collectionNotesList?.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-from-folder]');
      if (removeBtn) {
        removeFromCollection(removeBtn.getAttribute('data-remove-from-folder'));
        return;
      }
      const row = e.target.closest('[data-open-collection-note]');
      if (row) {
        const id = row.getAttribute('data-open-collection-note');
        if (id) window.location.href = 'document-viewer.html?id=' + encodeURIComponent(id);
      }
    });

    // Picker rows: clicking anywhere on the row toggles its checkbox.
    els.collectionPickerList?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-picker-note]');
      if (!row || e.target.closest('input')) return;
      const check = row.querySelector('input[data-picker-check]');
      if (check && !check.disabled) check.checked = !check.checked;
    });
  }

  // Search filters the already-fetched bookmark rows client-side (same
  // approach as the notes search). No backend round-trip per keystroke.
  function bindBookmarksSearch() {
    if (!els.bookmarksSearch) return;
    els.bookmarksSearch.addEventListener('input', () => renderBookmarks());
  }

  function bindBookmarksToggles() {
    if (els.bookmarksViewAll) {
      els.bookmarksViewAll.addEventListener('click', () => {
        bookmarksExpanded = !bookmarksExpanded;
        renderBookmarks();
      });
    }
    if (els.collectionsViewAll) {
      els.collectionsViewAll.addEventListener('click', () => {
        collectionsExpanded = !collectionsExpanded;
        renderCollections();
      });
    }
  }

  // "+ Add Collection" toggles an inline form (no modal). Submitting
  // calls POST /api/folders; Enter or the Create button both submit.
  function bindCollectionCreate() {
    if (!els.addCollectionBtn || !els.collectionCreateForm) return;

    els.addCollectionBtn.addEventListener('click', () => {
      els.collectionCreateForm.hidden = !els.collectionCreateForm.hidden;
      if (!els.collectionCreateForm.hidden && els.collectionNameInput) {
        els.collectionNameInput.value = '';
        els.collectionNameInput.focus();
      }
    });

    if (els.collectionCancelBtn) {
      els.collectionCancelBtn.addEventListener('click', () => {
        els.collectionCreateForm.hidden = true;
      });
    }

    els.collectionCreateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (els.collectionNameInput && els.collectionNameInput.value || '').trim();
      if (!name) {
        if (els.collectionNameInput) els.collectionNameInput.focus();
        return;
      }
      if (els.collectionCreateBtn) els.collectionCreateBtn.disabled = true;
      try {
        await createCollection(name);
        if (els.collectionCreateForm) els.collectionCreateForm.hidden = true;
      } catch (err) {
        console.error('[profile] create collection failed:', err);
        alert((err && err.message) || 'Could not create collection.');
      } finally {
        if (els.collectionCreateBtn) els.collectionCreateBtn.disabled = false;
      }
    });
  }

  // Stable per-subject tint so each bookmark row keeps the varied color
  // feel of the original static mockup without hardcoding subject names.
  function bookmarkColor(subject) {
    let hash = 0;
    for (let i = 0; i < subject.length; i++) {
      hash = (hash * 31 + subject.charCodeAt(i)) >>> 0;
    }
    return BOOKMARK_PALETTE[hash % BOOKMARK_PALETTE.length];
  }

  // Inline SVG snippets for the bookmark / collection rows.
  const BOOKMARK_PALETTE = ['#2F6FED', '#22B87A', '#9B5DE5', '#E07B00', '#E8546B', '#17A2B8'];
  const SVG_BOOKMARK_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/></svg>';
  const SVG_FOLDER_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z"/></svg>';
  const SVG_X_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const SVG_TRASH_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m19 6-1.2 14a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 6"/></svg>';

  // ---------- Settings form ----------

  // Populates the settings form from the loaded profile + fetched
  // schools list. Save button validates and PATCHes.
  async function loadSettingsForm() {
    if (!currentProfile || !els.settingsForm) return;

    // Only the owner can edit. Double-check before populating.
    if (currentUserId == null || currentTargetId !== currentUserId) {
      els.settingsForm.innerHTML =
        '<p class="profile-card__empty">You can only edit your own profile.</p>';
      if (els.settingsSaveBtn) els.settingsSaveBtn.disabled = true;
      return;
    }

    // Prefill values from the profile we already have.
    els.settingsUsername.value = currentProfile.username || '';
    els.settingsBio.value = currentProfile.bio || '';
    els.settingsLocation.value = currentProfile.location || '';
    els.settingsStrand.value = currentProfile.strand || '';
    els.settingsGrade.value = currentProfile.grade_level || '';
    updateBioCount();

    // Fetch schools lazily (once). Falls back to the existing select
    // option if the call fails — saving will still work without school_id.
    if (!schoolsLoaded) {
      try {
        const schools = await api.get('/schools');
        if (Array.isArray(schools)) {
          els.settingsSchool.innerHTML = '<option value="">No school</option>' +
            schools.map((s) => '<option value="' + escapeHtml(String(s.id)) + '">' + escapeHtml(s.school_name) + '</option>').join('');
          schoolsLoaded = true;
        }
      } catch (err) {
        console.warn('[profile] schools load failed:', err);
      }
    }
    els.settingsSchool.value = currentProfile.school_id ? String(currentProfile.school_id) : '';
    // The custom-select trigger mirrors the native select's display value;
    // setting .value directly doesn't mutate the DOM, so sync it manually.
    if (els.settingsSchool.refreshCselect) els.settingsSchool.refreshCselect();
    if (els.settingsGrade.refreshCselect) els.settingsGrade.refreshCselect();
    updateBioCount();

    // Pull the Privacy / Notifications settings once so the toggles
    // reflect the saved values (same owner gate as the form above).
    await loadUserSettings();
  }

  function updateBioCount() {
    if (!els.settingsBioCount || !els.settingsBio) return;
    const len = els.settingsBio.value.length;
    els.settingsBioCount.textContent = len + ' / 500';
  }

  // ---------- Privacy / Notifications settings ----------

  // Displays feedback inside whichever settings panel owns `el`.
  function showPanelMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = 'settings-message settings-message--' + (kind || 'success');
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.hidden = true; }, 4000);
  }

  // Fetches /users/me/settings once and syncs every `[data-setting]`
  // toggle. `is_private` is stored inverted (checked = public).
  async function loadUserSettings() {
    if (!api || !getToken()) return;
    if (settingsLoaded && userSettings) return;
    try {
      const res = await api.get('/users/me/settings', { auth: true });
      userSettings = (res && res.settings) || {};
      settingsLoaded = true;
    } catch (err) {
      console.warn('[profile] settings load failed:', err);
      userSettings = {};
    }
    document.querySelectorAll('.settings-toggle input[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      if (!(key in userSettings)) return;
      input.checked = (key === 'is_private') ? !userSettings[key] : !!userSettings[key];
    });
  }

  // Persists a single setting toggle. Optimistic: flips first, reverts
  // on failure. Guest/expired sessions and pre-migration databases both
  // fall back to an inline error message.
  function isOwnSettings() {
    return currentUserId != null && currentTargetId === currentUserId;
  }

  async function saveSettingToggle(input) {
    if (!isOwnSettings()) return;
    const key = input.dataset.setting;
    const panel = input.closest('[data-settings-panel]');
    const messageEl = panel ? panel.querySelector('.settings-message') : null;
    const previous = input.checked;
    const value = (key === 'is_private') ? !input.checked : input.checked;

    input.disabled = true;
    try {
      const res = await api.patch('/users/me/settings', { [key]: value }, { auth: true });
      userSettings = (res && res.settings) || { ...userSettings, [key]: value };
      showPanelMessage(messageEl, 'Saved.', 'success');
    } catch (err) {
      input.checked = previous;
      if (err && err.status === 401) {
        if (ON.clearToken) ON.clearToken();
        showPanelMessage(messageEl, 'Your session expired. Please log in again.', 'error');
      } else {
        showPanelMessage(messageEl, (err && err.message) || 'Could not save this setting.', 'error');
      }
    } finally {
      input.disabled = false;
    }
  }

  // Exports the owner's data as a JSON file download.
  async function exportMyData() {
    if (!isOwnSettings()) return;
    if (!els.privacyMessage) return;
    if (!api || !getToken()) {
      showPanelMessage(els.privacyMessage, 'Your session has expired. Please log in again.', 'error');
      return;
    }
    els.privacyExportBtn.disabled = true;
    els.privacyExportBtn.textContent = 'Exporting…';
    try {
      const data = await api.get('/users/me/export', { auth: true });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'olongnotes-export-' + (currentTargetId || 'me') + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showPanelMessage(els.privacyMessage, 'Your data has been exported.', 'success');
    } catch (err) {
      console.error('[profile] export failed:', err);
      showPanelMessage(els.privacyMessage, (err && err.message) || 'Could not export your data.', 'error');
    } finally {
      els.privacyExportBtn.disabled = false;
      els.privacyExportBtn.textContent = 'Export';
    }
  }

  // ---------- Security actions ----------

  async function updatePassword() {
    if (!isOwnSettings()) return;
    if (!els.securityMessage) return;
    const current = els.securityCurrentPw ? els.securityCurrentPw.value : '';
    const next = els.securityNewPw ? els.securityNewPw.value : '';
    const confirm = els.securityConfirmPw ? els.securityConfirmPw.value : '';

    if (!current) return showPanelMessage(els.securityMessage, 'Enter your current password.', 'error');
    if (next.length < 8) return showPanelMessage(els.securityMessage, 'New password must be at least 8 characters.', 'error');
    if (next !== confirm) return showPanelMessage(els.securityMessage, 'New passwords do not match.', 'error');

    els.securityUpdatePwBtn.disabled = true;
    els.securityUpdatePwBtn.textContent = 'Updating…';
    try {
      const res = await api.post('/auth/change-password', {
        current_password: current,
        new_password: next,
      }, { auth: true });
      if (els.securityCurrentPw) els.securityCurrentPw.value = '';
      if (els.securityNewPw) els.securityNewPw.value = '';
      if (els.securityConfirmPw) els.securityConfirmPw.value = '';
      showPanelMessage(els.securityMessage, (res && res.message) || 'Password updated successfully.', 'success');
    } catch (err) {
      showPanelMessage(els.securityMessage, (err && err.message) || 'Could not update your password.', 'error');
    } finally {
      els.securityUpdatePwBtn.disabled = false;
      els.securityUpdatePwBtn.textContent = 'Update Password';
    }
  }

  async function signOutAllSessions() {
    if (!isOwnSettings()) return;
    if (!els.securityMessage) return;
    if (!getToken()) {
      showPanelMessage(els.securityMessage, 'Your session has expired. Please log in again.', 'error');
      return;
    }
    const ok = await confirmDialog({
      title: 'Sign out of all sessions?',
      message: 'This ends every session on every device, including this one. You will need to log in again.',
      okText: 'Sign out all',
    });
    if (!ok) return;

    els.securitySignOutAllBtn.disabled = true;
    try {
      await api.post('/auth/signout-all', null, { auth: true });
      if (ON.clearToken) ON.clearToken();
      try { localStorage.removeItem('olongnotes_user'); } catch (_) {}
      window.location.href = 'index.html';
    } catch (err) {
      console.error('[profile] signout-all failed:', err);
      showPanelMessage(els.securityMessage, (err && err.message) || 'Could not sign out all sessions.', 'error');
      els.securitySignOutAllBtn.disabled = false;
    }
  }

  // Show a transient message above the settings form. Used for both
  // success and error feedback after a save attempt.
  function showSettingsMessage(text, kind) {
    if (!els.settingsMessage) return;
    els.settingsMessage.textContent = text;
    els.settingsMessage.className = 'settings-message settings-message--' + (kind || 'success');
    els.settingsMessage.hidden = false;
    clearTimeout(els.settingsMessage._timer);
    els.settingsMessage._timer = setTimeout(() => {
      els.settingsMessage.hidden = true;
    }, 4000);
  }

  async function saveSettings() {
    if (!api || !currentTargetId) return;
    if (!getToken()) {
      showSettingsMessage('Your session has expired. Please log in again.', 'error');
      return;
    }
    if (currentUserId == null || currentTargetId !== currentUserId) {
      showSettingsMessage('You can only edit your own profile.', 'error');
      return;
    }

    const payload = {
      username: els.settingsUsername.value.trim(),
      bio: els.settingsBio.value.trim(),
      location: els.settingsLocation.value.trim(),
      strand: els.settingsStrand.value.trim(),
      grade_level: els.settingsGrade.value || null,
      school_id: els.settingsSchool.value ? parseInt(els.settingsSchool.value) : null,
    };

    els.settingsSaveBtn.disabled = true;
    try {
      const res = await api.patch(`/users/${encodeURIComponent(currentTargetId)}`, payload, { auth: true });
      currentProfile = res.user;
      // Re-render the hero + overview so the new values are visible
      // everywhere without a page reload.
      renderHero(currentProfile, currentStats || {});
      renderOverview(currentProfile);
      // Keep the cached localStorage user in sync so other pages
      // (script.js) see the new username/initials too.
      const cached = readJSON('olongnotes_user');
      if (cached && cached.id === currentTargetId) {
        cached.username = currentProfile.username;
        try { localStorage.setItem('olongnotes_user', JSON.stringify(cached)); } catch (_) {}
      }
      showSettingsMessage('Profile updated.', 'success');
    } catch (err) {
      console.error('[profile] saveSettings failed:', err);
      if (err && err.status === 401) {
        if (ON.clearToken) ON.clearToken();
        showSettingsMessage('Your session expired. Please log in again.', 'error');
      } else {
        showSettingsMessage((err && err.message) || 'Could not save changes.', 'error');
      }
    } finally {
      els.settingsSaveBtn.disabled = false;
    }
  }

  // ---------- Settings nav (left rail) ----------

  // The left rail has stub links for Privacy / Notifications / Security
  // in this cut. Only the Profile tab is wired; the others are visual
  // Switches the visible settings panel on click. The Privacy,
  // Notifications, and Security panels are static previews, so nothing
  // is loaded — only the active nav item and the visible panel change.
  function switchSettingsPanel(name) {
    document.querySelectorAll('.settings-nav a').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.settingsNav === name);
    });
    document.querySelectorAll('.settings-content [data-settings-panel]').forEach((p) => {
      p.hidden = p.dataset.settingsPanel !== name;
    });
    const actions = document.querySelector('.settings-actions');
    if (actions) actions.hidden = name !== 'profile';
  }

  function bindSettingsNav() {
    document.querySelectorAll('.settings-nav a').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const name = a.dataset.settingsNav;
        switchSettingsPanel(name);
        if (name === 'profile') {
          document.querySelector('.settings-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // Wires the Privacy / Notifications toggles and the Security
  // actions (password change, sign-out-all, data export).
  function bindSettingsControls() {
    document.querySelectorAll('.settings-toggle input[data-setting]').forEach((input) => {
      input.addEventListener('change', () => saveSettingToggle(input));
    });
    els.privacyExportBtn?.addEventListener('click', exportMyData);
    els.securityUpdatePwBtn?.addEventListener('click', updatePassword);
    els.securitySignOutAllBtn?.addEventListener('click', signOutAllSessions);
  }

  // ---------- Logout from settings ----------

  // Mirrors script.js:1093 — POST /api/auth/logout, clear local
  // token, navigate home. Lives here so the Settings tab has its own
  // logout path that doesn't depend on the navbar profile chip.
  async function logoutFromSettings() {
    if (!confirm('Log out of OlongNotes?')) return;
    try { await api.post('/auth/logout', {}, { auth: true }); }
    catch (_) { /* best-effort */ }
    if (ON.clearToken) ON.clearToken();
    try { localStorage.removeItem('olongnotes_user'); } catch (_) {}
    window.location.href = 'index.html';
  }

  // ---------- Boot ----------

  function boot() {
    cacheEls();

    // The shared custom-select enhancement (community-shared.js) wraps the
    // School / Grade dropdowns in the same searchable dropdown UI used
    // across the app. It re-renders via a MutationObserver whenever the
    // native options change, so populating them later still works.
    const initCustomSelect = (window.OlongNotes?.shared?.initCustomSelect) || (() => {});
    [els.settingsSchool, els.settingsGrade].forEach((el) => el && initCustomSelect(el));

    // The current viewer comes from the same localStorage key
    // script.js uses. We need it for the Settings tab visibility check.
    const cached = readJSON('olongnotes_user');
    if (cached && cached.id) {
      const id = parseInt(cached.id);
      if (!Number.isNaN(id)) currentUserId = id;
    }

    // Wire tab strip.
    document.querySelectorAll('.profile-tab').forEach((tab) => {
      tab.addEventListener('click', () => activate(tab.dataset.tab));
    });

    // Settings sub-nav, search filter, doc-card navigation, new-note
    // button, save button, logout button.
    bindSettingsNav();
    bindNotesSearch();
    bindNotesCardClick();
    bindNewNoteButton();
    bindBookmarkListClick();
    bindCollectionsListClick();
    bindBookmarksSearch();
    bindBookmarksToggles();
    bindCollectionCreate();
    bindCollectionModal();
    bindSettingsControls();
    els.settingsSaveBtn?.addEventListener('click', saveSettings);
    els.settingsLogoutBtn?.addEventListener('click', logoutFromSettings);
    els.settingsBio?.addEventListener('input', updateBioCount);

    // Decide which profile to load.
    const targetId = resolveTargetId();
    if (!targetId) {
      showEmpty();
      return;
    }
loadProfile(targetId).then(() => {
      // Wire the avatar/banner edit affordances now that ownership is
      // known (currentUserId + currentTargetId are set). For owners this
      // unhides + binds the buttons; for non-owners it's a no-op so the
      // affordances stay hidden.
      bindImageUploads();
      // Honor ?tab=<name> deep-link after the shell is up. The bookmarks
      // tab is owner-only, so a non-owner's deep link falls back to
      // Overview rather than an empty/hidden panel.
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'bookmarks' && (currentUserId == null || currentTargetId !== currentUserId)) {
        activate('overview');
      } else if (tab && ['overview', 'notes', 'bookmarks', 'activity', 'settings'].includes(tab)) {
        activate(tab);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
