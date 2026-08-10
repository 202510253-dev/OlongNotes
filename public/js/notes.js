// ===================== ALL NOTES (notes.html) =====================
// "View All" destination from the homepage Featured Notes teaser.
//
// What this page shows:
//   Every published note, sorted by popularity (likes + downloads)
//   descending, paginated 8 per page with numbered pagination.
//
// Backend: GET /api/notes?limit=8&offset=N returns
//   { notes: [...], pagination: { total, limit, offset, has_more } }
// — we trust total + offset to compute page count and render
// prev / numbered buttons / next with ellipsis for gaps.
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
  // Single-page model: each fetch REPLACES state.notes (no append).
  // The pagination nav rebuilds from total + totalPages; the count
  // line reads "Showing X-Y of Z notes" off the slice.
  const state = {
    notes: [],
    page: 1,
    total: 0,
    totalPages: 0,
    loading: false,
  };

  const PAGE_SIZE = 8;

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
  // Loads one page (1-indexed). On success, REPLACES state.notes
  // (single-page model — no append). On failure, surfaces an empty
  // state but never throws — the page should always render.
  async function loadPage(pageNumber) {
    if (!api) {
      docEmpty.hidden = false;
      return;
    }
    state.loading = true;
    if (notesPagination) notesPagination.setAttribute('aria-busy', 'true');

    try {
      const targetPage = Math.max(1, parseInt(pageNumber, 10) || 1)
      const offset = (targetPage - 1) * PAGE_SIZE
      const query = new URLSearchParams()
      query.set('limit', String(PAGE_SIZE))
      query.set('offset', String(offset))

      const data = await api.get(`/notes?${query.toString()}`)
      const payload = (data && typeof data === 'object') ? data : { notes: [] }
      const rows = Array.isArray(payload.notes) ? payload.notes : []
      const pagination = payload.pagination || {}

      state.notes = rows.map(adaptNoteFromApi)
      state.page = targetPage
      state.total = pagination.total || state.notes.length
      state.totalPages = state.total > 0
        ? Math.max(1, Math.ceil(state.total / PAGE_SIZE))
        : 0
    } catch (e) {
      console.warn('[notes] Could not load page.', e)
      state.notes = []
      state.total = 0
      state.totalPages = 0
    } finally {
      state.loading = false
      if (notesPagination) notesPagination.removeAttribute('aria-busy')
    }
  }

  // ---------- Pagination builder ----------
  // Builds the innerHTML for the numbered pagination nav. Page window
  // is {1, last, current, current±1, current±2} deduped via Set; gaps
  // > 1 between consecutive entries render as an ellipsis span.
  //
  // Renamed local `window` → `pageWindow` to avoid shadowing the
  // browser global (eslint-disable on the original draft flagged it).
  function buildPaginationHtml(current, totalPages) {
    if (totalPages <= 1) return ''

    const pageWindow = new Set([1, totalPages, current, current - 1, current + 1, current - 2, current + 2])
    const sortedPages = [...pageWindow]
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b)

    const prevDisabled = current <= 1 ? ' is-disabled' : ''
    const nextDisabled = current >= totalPages ? ' is-disabled' : ''

    const parts = []
    parts.push(`<button type="button" class="notes-pagination__btn notes-pagination__nav${prevDisabled}" data-page="prev" aria-label="Previous page"${prevDisabled ? ' disabled' : ''}>‹</button>`)

    let prev = 0
    for (const p of sortedPages) {
      if (prev && p - prev > 1) {
        parts.push('<span class="notes-pagination__ellipsis" aria-hidden="true">…</span>')
      }
      const isCurrent = p === current
      parts.push(
        `<button type="button" class="notes-pagination__btn${isCurrent ? ' is-current' : ''}" data-page="${p}" aria-label="Page ${p}"${isCurrent ? ' aria-current="page"' : ''}>${p}</button>`
      )
      prev = p
    }

    parts.push(`<button type="button" class="notes-pagination__btn notes-pagination__nav${nextDisabled}" data-page="next" aria-label="Next page"${nextDisabled ? ' disabled' : ''}>›</button>`)

    return parts.join('')
  }

  // ---------- Render ----------
  function render() {
    docEmpty.hidden = state.notes.length > 0

    // Sort the page slice by popularity (likes + downloads) DESC so the
    // global ordering matches the homepage teaser. Done client-side per
    // page-load because /api/notes doesn't expose a pop-sort query
    // param yet — fine at 8/page.
    const sorted = [...state.notes].sort(
      (a, b) => (b.likes + b.downloads) - (a.likes + b.downloads)
    )

    docGrid.innerHTML = ''
    sorted.forEach((doc) => {
      const card = document.createElement('div')
      card.className = 'doc-card'
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
      `

      card.querySelector('.doc-card__open').addEventListener('click', () => {
        window.location.href = `document-viewer.html?id=${encodeURIComponent(doc.id)}`
      })

      docGrid.appendChild(card)
    })

    // ---------- Pagination nav ----------
    // Hide the nav when there's ≤ 1 page total; otherwise rebuild the
    // innerHTML from the page window and unhide.
    if (!notesPagination) {
      // Count line below still updates even if the nav was dropped.
      updateCount()
      return
    }

    if (state.totalPages <= 1) {
      notesPagination.innerHTML = ''
      notesPagination.hidden = true
    } else {
      notesPagination.innerHTML = buildPaginationHtml(state.page, state.totalPages)
      notesPagination.hidden = false
    }

    updateCount()
  }

  function updateCount() {
    if (!notesCount) return
    if (state.total <= 0) {
      notesCount.textContent = ''
      return
    }
    const start = (state.page - 1) * PAGE_SIZE + 1
    const end = Math.min(state.page * PAGE_SIZE, state.total)
    notesCount.textContent = `Showing ${start}-${end} of ${state.total} notes`
  }

  // ---------- Pagination click handler ----------
  // Single delegated handler on the nav element resolves the data-page
  // attribute: "prev" / "next" shift by ±1, a number jumps directly.
  // goToPage() clamps to the valid range and no-ops on same-page /
  // loading-state / out-of-range.
  async function goToPage(target) {
    if (state.loading) return
    let nextPage = state.page
    if (target === 'prev') nextPage = state.page - 1
    else if (target === 'next') nextPage = state.page + 1
    else {
      const n = parseInt(target, 10)
      if (!Number.isNaN(n)) nextPage = n
    }
    nextPage = Math.max(1, Math.min(nextPage, state.totalPages || 1))
    if (nextPage === state.page) return
    await loadPage(nextPage)
    render()
    // Scroll to the top of the grid so the new page is in view.
    const gridTop = document.getElementById('docGrid')
    if (gridTop && typeof gridTop.scrollIntoView === 'function') {
      gridTop.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (notesPagination) {
    notesPagination.addEventListener('click', (e) => {
      const btn = e.target.closest('.notes-pagination__btn')
      if (!btn || btn.disabled) return
      const target = btn.dataset.page
      if (!target) return
      goToPage(target)
    })
  }

  // ---------- Boot ----------
  (async function init() {
    await loadPage(1)
    render()
  })()
})()
