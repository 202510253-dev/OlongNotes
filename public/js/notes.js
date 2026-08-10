// ===================== ALL NOTES (notes.html) =====================
// "View All" destination from the homepage Featured Notes teaser.
//
// What this page shows:
//   Every published note, sorted by popularity (likes + downloads)
//   descending, with a 20-per-page "Load more" affordance.
//
// The same popularity metric the homepage teaser uses is reused here
// — no new metric. The server doesn't currently expose a sort-by-pop
// option on /api/notes, so we sort the client-side over the fetched
// page. That's fine for the small per-page set the "Load more" model
// fetches (20 rows).
//
// Backend: GET /api/notes?limit=20&offset=N returns
//   { notes: [...], pagination: { total, limit, offset, has_more } }
// — we trust has_more to know when to hide the Load more button.
//
// Click-to-open: same routing as the rest of the site →
// document-viewer.html?id=<note_id>.
// =====================================================================

(function () {
  'use strict';

  const esc = (window.OlongNotes && window.OlongNotes.escapeHtml)
    || ((s) => String(s));
  const api = (window.OlongNotes && window.OlongNotes.api) || null;
  // Per-file-type icon — shared module drives bg + inner glyph by MIME.
  // Kept inline as a fallback for the (rare) case file-type-icons.js
  // fails to load; the notes page is the visual anchor so it always
  // gets a sensible badge.
  const sharedFileIcon = (window.OlongNotes && window.OlongNotes.fileIconMarkup);
  const sharedFileBadge = (window.OlongNotes && window.OlongNotes.fileTypeBadge);

  // ---------- DOM refs ----------
  const docGrid = document.getElementById('docGrid');
  const docEmpty = document.getElementById('docEmpty');
  const notesPagination = document.getElementById('notesPagination');
  const notesCount = document.getElementById('notesCount');

  // ---------- State ----------
  // We accumulate pages into state.notes so "Load more" appends rather
  // than replaces. Render reads from this list every time.
  const state = {
    notes: [],
    total: 0,
    hasMore: false,
    loading: false,
  };

  const PAGE_SIZE = 20;

  // ---------- Helpers (lifted from subject-notes.js, kept compatible) ----------
  function initials(name) {
    return name.split(' ').filter(Boolean).slice(0, 2)
      .map((w) => w[0]).join('').toUpperCase();
  }

  function initialsTintsFromName(name) {
    const palette = ['#e7833b', '#3d6bf0', '#2e9e5b', '#e0b23c', '#8b5cf6', '#e0556f'];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return palette[sum % palette.length];
  }

  function fileTypeBadge(fileType) {
    if (sharedFileBadge) return sharedFileBadge(fileType);
    if (!fileType) return 'FILE';
    if (fileType === 'application/pdf') return 'PDF';
    if (fileType.includes('word')) return 'DOCX';
    if (fileType.includes('sheet')) return 'XLSX';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return 'PPTX';
    if (fileType.includes('image/')) return 'IMG';
    return 'FILE';
  }

  // Heart + download SVG icons — kept in sync with the homepage teaser
  // renderer (js/script.js) so both pages display the same visual.
  const heartIconMarkup = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21s-7-4.5-9.5-9.2C.6 7.8 2.7 4 6.3 4c2 0 3.5 1 4.7 2.6C12.2 5 13.7 4 15.7 4c3.6 0 5.7 3.8 3.8 7.8C19 16.5 12 21 12 21z"/></svg>';
  const downloadIconMarkup = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>';
  // Per-file-type icon — shared with the rest of the site. Falls back to
  // a generic document badge if file-type-icons.js didn't load.
  const fileIconMarkup = (sharedFileIcon)
    || ((ft) => '<span class="doc-card__file-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg></span>');

  function adaptNoteFromApi(row) {
    return {
      id: row.id,
      title: row.title || 'Untitled',
      caption: row.annotation || '',
      author: (row.users && row.users.user_name) || 'Anonymous',
      likes: typeof row.likes_count === 'number' ? row.likes_count : 0,
      downloads: typeof row.download_count === 'number' ? row.download_count : 0,
      gradeLevel: row.grade_level || '',
      fileType: row.file_type || '',
      school: (row.schools && row.schools.school_name) || 'Unknown school',
      tint: initialsTintsFromName((row.users && row.users.user_name) || 'anon'),
    };
  }

  // ---------- Notes loader ----------
  // Loads one page starting at `offset`. On success, appends to
  // state.notes and updates pagination state. On failure, surfaces an
  // empty state but never throws — the page should always render.
  async function loadPage(offset) {
    if (!api) {
      docEmpty.hidden = false;
      return;
    }
    state.loading = true;
    if (notesPagination) notesPagination.setAttribute('aria-busy', 'true');

    try {
      const query = new URLSearchParams();
      query.set('limit', String(PAGE_SIZE));
      query.set('offset', String(offset));

      const data = await api.get(`/notes?${query.toString()}`);
      const payload = (data && typeof data === 'object') ? data : { notes: [] };
      const rows = Array.isArray(payload.notes) ? payload.notes : [];
      const pagination = payload.pagination || {};

      const mapped = rows.map(adaptNoteFromApi);
      state.notes = state.notes.concat(mapped);
      state.total = pagination.total || state.notes.length;
      state.hasMore = Boolean(pagination.has_more);
    } catch (e) {
      console.warn('[notes] Could not load page.', e);
      // If this was the FIRST page, show empty. Otherwise keep what we
      // already have and just stop loading more.
      if (offset === 0) state.notes = [];
    } finally {
      state.loading = false;
      if (notesPagination) notesPagination.removeAttribute('aria-busy');
    }
  }

  // ---------- Render ----------
  function render() {
    docEmpty.hidden = state.notes.length > 0;

    // Sort the accumulated notes by popularity (likes + downloads) DESC
    // so the global ordering matches the homepage teaser. Done client-
    // side per page-load because /api/notes doesn't expose a pop-sort
    // query param yet — fine at 20/page.
    const sorted = [...state.notes].sort(
      (a, b) => (b.likes + b.downloads) - (a.likes + a.downloads)
    );

  docGrid.innerHTML = '';
    sorted.forEach((doc) => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      card.innerHTML = `
        <div class="doc-card__top">
          ${fileIconMarkup(doc.fileType)}
          <span class="doc-badge">${esc(fileTypeBadge(doc.fileType))}</span>
        </div>
        <p class="doc-card__title">${esc(doc.title)}</p>
        <p class="doc-card__caption">${esc(doc.caption || `Notes on ${doc.title}.`)}</p>
        <div class="doc-card__tags">
          <span class="doc-card__tag">${esc(doc.school)}</span>
          <span class="doc-card__tag">${esc(doc.gradeLevel || '—')}</span>
        </div>
        <div class="doc-card__author">
          <span class="doc-card__avatar" style="--avatar-tint:${esc(doc.tint)}">${esc(initials(doc.author))}</span>
          <span><strong>Author:</strong> ${esc(doc.author)}</span>
        </div>
        <div class="doc-card__stats">
          <span class="doc-card__stat doc-card__stat--likes">${heartIconMarkup} ${esc(String(doc.likes))}</span>
          <span class="doc-card__stat doc-card__stat--downloads">${downloadIconMarkup} ${esc(String(doc.downloads))} downloads</span>
        </div>
        <button class="btn btn--outline btn--sm doc-card__open" type="button">Open File</button>
      `;

      card.querySelector('.doc-card__open').addEventListener('click', () => {
        window.location.href = `document-viewer.html?id=${encodeURIComponent(doc.id)}`;
      });

      docGrid.appendChild(card);
    });

    // Pagination element visibility: render() in this file builds the
    // page buttons (or an empty wrapper) when notesPagination exists.
    // The actual prev/next/page-number buttons are rendered by the
    // caller — this file is now a load-only consumer.
    if (state.total > 0) {
      notesCount.textContent = `Showing ${state.notes.length} of ${state.total} notes`;
    } else {
      notesCount.textContent = '';
    }
  }

  // ---------- Boot ----------
  // notes.html uses numbered pagination (rendered by the same module),
  // not a Load-More button — clicks are wired in the pagination
  // render path, not here. Nothing to wire at boot.
  (async function init() {
    await loadPage(0);
    render();
  })();
})();
