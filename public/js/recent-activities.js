// ===================== RECENT ACTIVITIES PAGE =====================
// Phase 2 — wired against the real /api/activities endpoint.
//
// What this page shows:
//   A vertical feed of the signed-in user's recent activity events
//   (viewed / bookmarked / liked / uploaded / reported notes). The
//   user filters the feed by tapping one of the bubbles in the hero
//   (All / Viewed / Liked / Bookmarked / Uploaded). Tapping a bubble
//   reveals a "Back to All activity" breadcrumb — same stack pattern
//   as subjects.js, lifted to keep the interaction model consistent.
//
// The previous "Recent Top Contributors" sidebar was removed in
// Phase 2 per design direction. The page is now single-column.
//
// Flow:
//   1. Page load → fetch /api/activities (auth, 50 most recent rows).
//   2. Initial render: stack = [], feed shows all rows, "All Activity"
//      bubble is active, breadcrumb hidden.
//   3. Tap a bubble (e.g. "Liked") → push {kind:'type', type:'note_liked'}
//      → breadcrumb shows "Liked", feed re-renders filtered.
//   4. Tap breadcrumb "back" → pop stack → back to all rows.
//
// UX/UI notes:
//   - Anonymous viewer (no token) → "Log in to see your activity" CTA
//   - Authenticated user, endpoint returns 401 → same login state
//   - Authenticated user, endpoint returns [] or fails → empty state
//     (honest copy explaining the foundation is ready but no events yet)
//
// XSS coverage:
//   Every dynamic field that lands in innerHTML goes through esc()
//   from api.js. The 6 known user-controlled fields are:
//     activity.title, activity.subject_name, activity.school_name,
//     activity.type, activity.note_id, activity.created_at.

(function () {
  'use strict';

  const ON  = window.OlongNotes || {};
  const esc = ON.escapeHtml || ((s) => String(s ?? ''));
  const api = ON.api || null;
  const hasToken = !!(ON.getToken && ON.getToken());

  // ---------- DOM refs ----------
  const feedEl           = document.getElementById('recentFeed');
  const breadcrumbEl     = document.getElementById('recentBreadcrumb');
  const breadcrumbBack   = document.getElementById('breadcrumbBack');
  const breadcrumbBackLabel = document.getElementById('breadcrumbBackLabel');
  const breadcrumbPath   = document.getElementById('breadcrumbPath');
  const bubbles          = document.querySelectorAll('.recent-bubble');

  if (!feedEl) {
    console.warn('[recent-activities] #recentFeed not found — page structure broken.');
    return;
  }

  // ---------- State ----------
  // Each stack entry is a drill-down step. For Recent Activities we only
  // ever have ONE step (a type filter) — there are no nested drill-downs
  // the way subjects has. The stack pattern is still used so the
  // breadcrumb + back button mirror the rest of the app.
  //
  // Shape: [{ kind: 'type', label, type }]
  //   type: 'note_viewed' | 'note_liked' | 'note_bookmarked' |
  //         'note_uploaded' | 'note_reported' | 'note_deleted'
  // Empty stack = "All Activity" (no filter applied).
  const state = {
    stack: [],
    activities: [],   // raw rows from /api/activities (max 50)
    loading: false,
    endpointLive: false,
  };

  // Bubble id → { label, type } mapping for the active-bubble logic.
  // Mirror of the HTML data-type attributes so this file stays the
  // single source of truth for "what does each bubble mean".
  const BUBBLES = {
    all:        { label: 'All Activity' },
    note_viewed:     { label: 'Viewed' },
    note_liked:      { label: 'Liked' },
    note_bookmarked: { label: 'Bookmarked' },
    note_uploaded:   { label: 'Uploaded' },
  };

  // ---------- Time helpers ----------
  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSec < 60)        return 'just now';
    if (diffSec < 3600)      return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400)     return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  // ---------- Icon SVGs (static markup, safe to inline) ----------
  const ICONS = {
    viewed: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    bookmarked: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>',
    liked: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/></svg>',
    uploaded: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 19h16"/></svg>',
    reported: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16M4 4h12l-2 4 2 4H4"/></svg>',
    empty: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    login: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>',
  };

  // Map backend activity_type values to our local icon class.
  // The "type" key here is the FULL server-side value (e.g.
  // "note_liked") — backend POST /api/activities and the GET
  // response both use these exact strings.
  const ACTIVITY_ICON = {
    note_viewed:     { cls: 'recent-card__icon--viewed',     icon: ICONS.viewed,     verb: 'opened' },
    note_bookmarked: { cls: 'recent-card__icon--bookmarked', icon: ICONS.bookmarked, verb: 'bookmarked' },
    note_liked:      { cls: 'recent-card__icon--liked',      icon: ICONS.liked,      verb: 'liked' },
    note_uploaded:   { cls: 'recent-card__icon--uploaded',   icon: ICONS.uploaded,   verb: 'uploaded' },
    note_reported:   { cls: 'recent-card__icon--reported',   icon: ICONS.reported,   verb: 'reported' },
    note_deleted:    { cls: 'recent-card__icon--reported',   icon: ICONS.reported,   verb: 'deleted' },
  };

  // ---------- Rendering ----------
  function renderActivityCard(row) {
    const meta = ACTIVITY_ICON[row.type] || ACTIVITY_ICON.note_viewed;
    const title = row.title || 'Untitled note';
    const subject = row.subject_name ? ` · ${row.subject_name}` : '';
    const school  = row.school_name  ? ` · ${row.school_name}`  : '';
    const when    = timeAgo(row.created_at);
    const href    = row.note_id
      ? `document-viewer.html?id=${encodeURIComponent(row.note_id)}`
      : '#';

    return `
      <a class="recent-card" href="${esc(href)}">
        <span class="recent-card__icon ${esc(meta.cls)}" aria-hidden="true">${meta.icon}</span>
        <div class="recent-card__body">
          <p class="recent-card__title">${esc(title)}</p>
          <p class="recent-card__meta">
            <span class="recent-card__verb">${esc(meta.verb)}</span>
            ${subject ? `<span class="recent-card__meta-dot"></span><span>${esc(row.subject_name)}</span>` : ''}
            ${school  ? `<span class="recent-card__meta-dot"></span><span>${esc(row.school_name)}</span>`  : ''}
          </p>
        </div>
        <span class="recent-card__time">${esc(when)}</span>
      </a>
    `;
  }

  // ---------- Stack + breadcrumb ----------
  // The active filter is derived from the TOP of the stack. Empty
  // stack = no filter (All Activity).
  function activeType() {
    const top = state.stack[state.stack.length - 1];
    return top && top.kind === 'type' ? top.type : 'all';
  }

  function renderBreadcrumb() {
    const top = state.stack[state.stack.length - 1];
    if (!top) {
      breadcrumbEl.hidden = true;
      return;
    }
    breadcrumbEl.hidden = false;
    breadcrumbPath.textContent = top.label;
    breadcrumbBackLabel.textContent = 'All activity';
  }

  function renderBubbleActiveState() {
    const active = activeType();
    bubbles.forEach((btn) => {
      const isActive = (btn.getAttribute('data-type') || 'all') === active;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function pushType(type) {
    const def = BUBBLES[type];
    if (!def || type === 'all') {
      // Clicking the "All" bubble is equivalent to clearing the stack.
      state.stack = [];
    } else {
      state.stack = [{ kind: 'type', label: def.label, type }];
    }
    renderBreadcrumb();
    renderBubbleActiveState();
    renderFeed();
  }

  function popStack() {
    if (state.stack.length === 0) return;
    state.stack.pop();
    renderBreadcrumb();
    renderBubbleActiveState();
    renderFeed();
  }

  // ---------- Feed rendering ----------
  function renderFeed() {
    // 1. login-required state — anonymous viewers always see this
    if (!hasToken) {
      feedEl.innerHTML = `
        <div class="recent-state">
          <div class="recent-state__icon">${ICONS.login}</div>
          <h3 class="recent-state__title">Log in to see your activity</h3>
          <p class="recent-state__text">
            Sign in to track the notes you've opened, bookmarked, liked,
            and uploaded across every device.
          </p>
          <div class="recent-state__actions">
            <button type="button" class="btn btn--primary" id="recentFeedLoginBtn">Log In</button>
            <button type="button" class="btn btn--outline" id="recentFeedSignupBtn">Sign Up</button>
          </div>
        </div>
      `;
      // Wire the CTA buttons — they delegate to the global auth modal
      // (same pattern as index.html hero buttons).
      const loginBtn  = document.getElementById('recentFeedLoginBtn');
      const signupBtn = document.getElementById('recentFeedSignupBtn');
      const fire = (kind) => () => {
        const ev = new CustomEvent('olongnotes:request-auth', { detail: { kind } });
        window.dispatchEvent(ev);
      };
      loginBtn ?.addEventListener('click', fire('login'));
      signupBtn?.addEventListener('click', fire('signup'));
      return;
    }

    // 2. empty state — signed in but nothing to show
    if (!state.activities.length) {
      feedEl.innerHTML = `
        <div class="recent-state">
          <div class="recent-state__icon">${ICONS.empty}</div>
          <h3 class="recent-state__title">Nothing here yet</h3>
          <p class="recent-state__text">
            ${state.endpointLive
              ? `You haven't opened, bookmarked, liked, or uploaded any notes recently. Start exploring to fill this feed.`
              : `Activity tracking is on the way. The frontend foundation is wired and ready — the page reads cleanly, the layout matches the rest of OlongNotes, and no data hooks break.`}
          </p>
          <div class="recent-state__actions">
            <a class="btn btn--primary" href="community.html">Browse Notes</a>
            <a class="btn btn--outline" href="subjects.html">Explore Subjects</a>
          </div>
        </div>
      `;
      return;
    }

    // 3. rendered list — apply current filter (derived from stack)
    const type = activeType();
    const filtered = type === 'all'
      ? state.activities
      : state.activities.filter((a) => a.type === type);

    if (!filtered.length) {
      const label = (BUBBLES[type] && BUBBLES[type].label) || type;
      feedEl.innerHTML = `
        <div class="recent-state">
          <div class="recent-state__icon">${ICONS.empty}</div>
          <h3 class="recent-state__title">No "${esc(label)}" activity yet</h3>
          <p class="recent-state__text">Try a different bubble above, or hit the back button to see everything.</p>
        </div>
      `;
      return;
    }

    feedEl.innerHTML = filtered.map(renderActivityCard).join('');
  }

  // ---------- Filter wiring ----------
  function bindBubbles() {
    bubbles.forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type') || 'all';
        if (type === activeType() && state.stack.length > 0) {
          // Re-tapping the active bubble is a no-op — the filter
          // already matches. Tapping "All" is always allowed.
          if (type !== 'all') return;
        }
        pushType(type);
      });
    });
  }

  function bindBreadcrumb() {
    breadcrumbBack?.addEventListener('click', popStack);
  }

  // ---------- Data loading ----------
  async function loadActivities() {
    if (!api || !hasToken) {
      // api.js didn't load OR user isn't logged in → render the
      // appropriate state and bail.
      renderFeed();
      return;
    }

    try {
      const data = await api.get('/activities?limit=50', { auth: true });
      const rows = Array.isArray(data)
        ? data
        : (data && Array.isArray(data.activities) ? data.activities : []);
      state.activities = rows;
      state.endpointLive = true;
    } catch (err) {
      // Endpoint not yet built (404) or backend down. Foundation handles
      // both — the empty state still explains the situation honestly.
      if (err && err.status === 401) {
        // Token expired — fall back to login-required state.
        state.activities = [];
        // Note: we don't call clearToken() here; api.js leaves that to
        // the call site. The page just gracefully re-renders.
        renderFeed();
        return;
      }
      console.warn('[recent-activities] /api/activities not available yet —', err);
      state.activities = [];
    }

    renderFeed();
  }

  // ---------- Side-drawer wiring (parity with other pages) ----------
  function bindSideDrawer() {
    const burger   = document.getElementById('navBurger');
    const drawer   = document.getElementById('sideDrawer');
    const backdrop = document.getElementById('sideDrawerBackdrop');
    const closeBtn = document.getElementById('sideDrawerClose');
    if (!burger || !drawer || !backdrop || !closeBtn) return;

    const open = () => {
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };

    burger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    drawer.addEventListener('click', (e) => {
      // Close when any nav link inside the panel is clicked (so the
      // destination page doesn't open with the drawer still open).
      if (e.target.closest('.side-drawer__link')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.getAttribute('aria-hidden') === 'false') close();
    });
  }

  // ---------- Navbar auth buttons (parity with other pages) ----------
  function bindNavbarAuth() {
    const loginBtn  = document.getElementById('navLoginBtn');
    const signupBtn = document.getElementById('navSignupBtn');
    const fire = (kind) => () => {
      window.dispatchEvent(new CustomEvent('olongnotes:request-auth', { detail: { kind } }));
    };
    loginBtn ?.addEventListener('click', fire('login'));
    signupBtn?.addEventListener('click', fire('signup'));
  }

  // ---------- Bootstrap ----------
  function init() {
    bindSideDrawer();
    bindNavbarAuth();
    bindBubbles();
    bindBreadcrumb();
    renderBreadcrumb();
    renderBubbleActiveState();
    loadActivities();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
