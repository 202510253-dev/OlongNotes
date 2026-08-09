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
  const loadedTabs = new Set();

  // ---------- DOM references ----------

  function $(id) { return document.getElementById(id); }

  const els = {};
  function cacheEls() {
    els.shell = $('profileShell');
    els.empty = $('profileEmpty');
    els.avatar = $('profileAvatar');
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
    els.settingsSaveBtn = $('settingsSaveBtn');
    els.settingsLogoutBtn = $('settingsLogoutBtn');
    els.overviewJoinedSettings = $('overviewJoinedSettings');
    els.overviewRoleSettings = $('overviewRoleSettings');
    els.overviewActivityList = $('overviewActivityList');
    els.settingsTabBtn = $('settingsTabBtn');
    els.notesSearch = $('notesSearch');
    els.newNoteBtn = $('newNoteBtn');
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
    els.avatar.textContent = initialsOf(displayName);
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

  // ---------- My Notes loader ----------

  // Renders the user's published notes. Each card mirrors the
  // prototype's .note-card markup so the existing CSS keeps working.
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
    const cards = notes.map((n) => {
      const subject = (n.subjects && n.subjects.subject_name) || 'General';
      const school = (n.schools && n.schools.school_name) || '';
      const updated = n.updated_at || n.created_at;
      const meta = [subject, n.grade_level].filter(Boolean).join(' · ');
      const schoolMeta = school ? `<span>·</span> ${escapeHtml(school)}` : '';
      const fileType = (n.file_type || '').split('/').pop() || '';
      const desc = n.annotation
        || (fileType ? `Uploaded as ${escapeHtml(fileType.toUpperCase())}.` : 'Uploaded note.');

      return (
        '<article class="note-card" data-note-id="' + escapeHtml(String(n.id)) + '">' +
          '<span class="note-card__icon" aria-hidden="true">' + NOTE_ICON_SVG + '</span>' +
          '<div class="note-card__body">' +
            '<div class="note-card__head">' +
              '<h3>' + escapeHtml(n.title || 'Untitled') + '</h3>' +
              '<span class="note-card__updated">' + escapeHtml(joinedLabel(updated)) + '</span>' +
            '</div>' +
            '<p class="note-card__meta">' + escapeHtml(meta) + schoolMeta + '</p>' +
            '<p class="note-card__desc">' + escapeHtml(desc) + '</p>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    els.notesList.innerHTML = cards;
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

  const NOTE_ICON_SVG =
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
      const cards = els.notesList ? els.notesList.querySelectorAll('.note-card') : [];
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
      // like a "..." menu (e.g. .note-card__actions / .actions).
      const target = e.target;
      if (target.closest('button, a, input, select, textarea, [data-no-navigate], .actions, .note-card__actions, .note-card__menu')) {
        return;
      }

      const card = target.closest('.note-card');
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
    updateBioCount();
  }

  function updateBioCount() {
    if (!els.settingsBioCount || !els.settingsBio) return;
    const len = els.settingsBio.value.length;
    els.settingsBioCount.textContent = len + ' / 500';
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
  // placeholders that get the .is-active style on click without
  // navigation. (Settings form lives in the Profile section.)
  function bindSettingsNav() {
    document.querySelectorAll('.settings-nav a').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (a.dataset.settingsNav === 'profile') {
          // Already the default view — just refocus the bio field for
          // a small UX nudge.
          document.querySelector('.settings-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        document.querySelectorAll('.settings-nav a').forEach((b) => b.classList.toggle('is-active', b === a));
      });
    });
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

    // Settings sub-nav, search filter, note-card navigation, new-note
    // button, save button, logout button.
    bindSettingsNav();
    bindNotesSearch();
    bindNotesCardClick();
    bindNewNoteButton();
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
      // Honor ?tab=<name> deep-link after the shell is up.
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && ['overview', 'notes', 'bookmarks', 'activity', 'settings'].includes(tab)) {
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
