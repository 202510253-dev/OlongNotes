// ===================== DOCUMENT VIEWER =====================
// Loads a single note by ID from /api/notes/:id and renders it
// into the viewer UI. Wires Like / Save / Download / Report.
//
// URL: document-viewer.html?id=<note_id>
//
// All dynamic fields are rendered via textContent or escaped via
// window.OlongNotes.escapeHtml (api.js). Backend fields go through
// the adapter below before any DOM access.

(async function () {
  'use strict';

  const ON = window.OlongNotes || {};
  const api = ON.api;
  const esc = ON.escapeHtml || ((s) => String(s ?? ''));

  // ---------- Activity recorder ----------
  // Fire-and-forget POST to /api/activities. The backend writes the same
  // row directly from routes/notes.js for upload/delete (and now GET
  // views/likes/bookmarks too), so the client POST is a fallback / safety
  // net. Failures are silent — the activity log is best-effort metadata
  // and must never break the user's action.
  function recordActivity(noteId, type) {
    if (!api || !ON.getToken || !ON.getToken()) return;
    api
      .post('/activities', { note_id: noteId, activity_type: type }, { auth: true })
      .catch((e) => console.debug('[activities] record skipped:', e && e.message));
  }

  // ---------- Helpers ----------

  function initialsOf(name) {
    return String(name || '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  function formatCount(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
    return String(n);
  }

  function formatFileType(mime) {
    if (!mime) return '';
    // "application/pdf" -> "PDF", "image/png" -> "PNG", etc.
    const slash = mime.indexOf('/');
    const sub = slash >= 0 ? mime.slice(slash + 1) : mime;
    return sub.split('+')[0].toUpperCase();
  }

  function showError(message) {
    const main = document.querySelector('main') || document.body;
    main.innerHTML = `
      <div class="container" style="padding: 60px 20px; text-align: center;">
        <h2 style="margin-bottom: 12px;">Couldn't load this note</h2>
        <p style="color: var(--gray-600); margin-bottom: 24px;">${esc(message)}</p>
        <a href="index.html" class="btn btn--primary">Back to home</a>
      </div>
    `;
  }

  // ---------- Adapter: backend row → viewer shape ----------

  function adaptNote(row) {
    const fileType = row.file_type || '';
    const isPdf = fileType === 'application/pdf' || /\.pdf(\?|$)/i.test(row.file_url || '');
    const isImage = fileType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(row.file_url || '');
    return {
      id: row.id,
      title: row.title || 'Untitled',
      subject: (row.subjects && row.subjects.subject_name) || 'General',
      school: (row.schools && row.schools.school_name) || 'Unknown school',
      author: (row.users && row.users.user_name) || 'Anonymous',
      annotation: row.annotation || '',
      gradeLevel: row.grade_level || '',
      fileUrl: row.file_url || '',
      fileType,
      fileSize: row.file_size || 0,
      downloads: Number(row.download_count) || 0,
      // likes_count is denormalized on notes since the 2026-08-02
      // migration (Section 10.2 of databaseUpdate.txt). The trigger
      // on the likes table keeps it accurate, so we read it directly
      // here instead of starting at 0.
      likes: typeof row.likes_count === 'number' ? row.likes_count : 0,
      bookmarks: typeof row.bookmarks_count === 'number' ? row.bookmarks_count : 0,
      createdAt: row.created_at || '',
      // Backend returns these on GET /api/notes/:id when the request
      // carries a valid JWT. Default false so the page works for
      // anonymous viewers.
      viewerHasLiked: Boolean(row.viewer_has_liked),
      viewerHasBookmarked: Boolean(row.viewer_has_bookmarked),
      isPdf,
      isImage,
    };
  }

  // ---------- Note loader ----------

  async function loadNote() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      showError('No note ID was provided in the URL. Open a note from the home page.');
      return null;
    }
    if (!api) {
      showError('API helper is not loaded. Make sure js/api.js is loaded before this script.');
      return null;
    }

    try {
      const row = await api.get(`/notes/${encodeURIComponent(id)}`);
      return adaptNote(row);
    } catch (e) {
      console.error('[OlongNotes] Failed to load note.', e);
      if (e.status === 404) showError('This note doesn\'t exist, or it was removed.');
      else showError(e.message || 'Unable to load this note right now.');
      return null;
    }
  }

  // ---------- Sidebar population ----------

  function populateSidebar(doc) {
    document.getElementById('viewerDocName').textContent = `${doc.subject} — ${doc.title}`;
    document.getElementById('infoCourse').textContent = doc.subject;
    document.getElementById('infoSchool').textContent = doc.school;
    document.getElementById('infoAuthor').textContent = doc.author;
    document.getElementById('infoCaption').textContent =
      doc.annotation || `Notes on ${doc.title}.`;
    document.getElementById('infoGradeLevel').textContent = doc.gradeLevel || '—';

    document.getElementById('statLikes').textContent = formatCount(doc.likes);
    document.getElementById('statDownloads').textContent = formatCount(doc.downloads);
    document.getElementById('statFileType').textContent = formatFileType(doc.fileType) || 'FILE';

    // Pre-set the like / save buttons based on whether the current
    // viewer has already liked/bookmarked. Without this, the buttons
    // always show the inactive state on page load even when the user
    // has previously liked the note — confusing.
    document.getElementById('likeBtn')?.classList.toggle('is-active', doc.viewerHasLiked);
    document.getElementById('saveBtn')?.classList.toggle('is-active', doc.viewerHasBookmarked);
  }

  // ---------- Document page rendering ----------

  // Render the actual file inline when possible (PDF or image). Falls
  // back to the cover-page scaffolding when the file type isn't one
  // we can embed directly (e.g. docx, pptx).
  function renderFileEmbed(doc) {
    if (doc.isPdf && doc.fileUrl) {
      return `
        <div class="pdf-placeholder">
          <div class="pdf-placeholder-icon">📄</div>
          <p class="pdf-placeholder-title">${esc(doc.title)}</p>
          <p class="pdf-placeholder-desc">PDF documents open in a new tab for the best viewing experience.</p>
          <a href="${esc(doc.fileUrl)}" target="_blank" rel="noopener noreferrer" class="pdf-open-btn">
            Open PDF
          </a>
        </div>
      `;
    }
    if (doc.isImage && doc.fileUrl) {
      return `
        <div class="doc-page__image" style="text-align: center; padding: 24px;">
          <img src="${esc(doc.fileUrl)}"
               alt="${esc(doc.title)}"
               style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);" />
        </div>
        <div class="doc-page__pagenum">${esc(doc.title)}</div>
      `;
    }
    return renderCoverPage(doc);
  }

  // Fallback cover page when no embeddable file — uses real title,
  // subject, school, author (every dynamic field is escaped).
  function renderCoverPage(doc) {
    return `
      <div class="doc-page__cover">
        <div class="doc-page__logo" aria-hidden="true">${esc(initialsOf(doc.school))}</div>
        <p class="doc-page__school">${esc(doc.school)}</p>

        <p class="doc-page__kicker">${esc(doc.subject)}</p>
        <h1 class="doc-page__title">${esc(doc.title)}</h1>
        <span class="doc-page__subtitle">${esc(doc.gradeLevel || '')}</span>

        <div class="doc-page__art" aria-hidden="true">
          <svg width="200" height="140" viewBox="0 0 220 160" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="110" cy="80" r="66" fill="rgba(61,107,240,0.07)"/>
            <rect x="60" y="52" width="100" height="66" rx="8" fill="var(--navy-900, #101a3a)"/>
            <rect x="70" y="62" width="80" height="40" rx="3" fill="#ffffff" opacity="0.08"/>
            <path d="M92 82h36M92 90h24" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
          </svg>
        </div>

        <p class="doc-page__prepared">
          Prepared by:
          <strong>${esc(doc.author)}</strong>
        </p>
      </div>
      <div class="doc-page__pagenum">Cover</div>
    `;
  }

  function renderPage(doc) {
    const viewerPage = document.getElementById('viewerPage');
    if (!viewerPage) return;
    viewerPage.innerHTML = renderFileEmbed(doc);
  }

  // ---------- Toolbar handlers ----------

  function bindToolbar(doc) {
    // Back button — prefer history.back() when the user actually
    // navigated here from another page in this app. If they opened
    // the viewer directly (no history entry), the href falls back
    // to index.html so it still works.
    document.getElementById('viewerBackBtn')?.addEventListener('click', (e) => {
      if (window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    });

    let zoom = 100;
    const viewerPage = document.getElementById('viewerPage');
    const zoomLevel = document.getElementById('zoomLevel');
    const viewerScrollarea = document.getElementById('viewerScrollarea');

    const applyZoom = () => {
      // Only scale if we rendered the cover page (no PDF iframe to scale).
      if (doc.isPdf || doc.isImage) return;
      viewerPage.style.transform = `scale(${zoom / 100})`;
      zoomLevel.textContent = `${zoom}%`;
    };

    document.getElementById('zoomInBtn')?.addEventListener('click', () => {
      zoom = Math.min(zoom + 10, 200);
      applyZoom();
    });

    document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
      zoom = Math.max(zoom - 10, 50);
      applyZoom();
    });

    document.getElementById('resetBtn')?.addEventListener('click', () => {
      zoom = 100;
      applyZoom();
      viewerScrollarea?.scrollTo({ top: 0 });
    });

    document.getElementById('fullscreenBtn')?.addEventListener('click', () => {
      const panel = document.querySelector('.viewer-panel');
      if (!document.fullscreenElement) panel?.requestFullscreen?.();
      else document.exitFullscreen?.();
    });

    document.getElementById('toggleSidebarBtn')?.addEventListener('click', () => {
      document.getElementById('viewerSidebar')?.classList.toggle('is-collapsed');
    });

    document.getElementById('downloadBtn')?.addEventListener('click', () => downloadDocument(doc));
    document.getElementById('printBtn')?.addEventListener('click', () => window.print());

    document.getElementById('moreBtn')?.addEventListener('click', () => {
      showBanner(
        'More options are on the way. Stay tuned!',
        'saved',
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/></svg>`
      );
    });
  }

  // ---------- Download: GET /api/notes/:id/download → file_url ----------

  async function downloadDocument(doc) {
    if (!api) {
      showBanner('Network error — try again.', 'report', '');
      return;
    }
    try {
      const data = await api.get(`/notes/${encodeURIComponent(doc.id)}/download`);
      const url = data && data.file_url;
      if (!url) throw new Error('Backend did not return a file URL.');

      // Open in a new tab — browser handles download for the file type.
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = doc.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Optimistic increment — the backend's increment_download_count
      // RPC has already run before this response came back, so the DB
      // is at N+1. Reflect that in the UI immediately (no reload).
      // Keeping doc.downloads in sync means subsequent downloads
      // increment off the latest value, not the stale page-load value.
      doc.downloads = (Number(doc.downloads) || 0) + 1;
      const statDownloads = document.getElementById('statDownloads');
      if (statDownloads) statDownloads.textContent = formatCount(doc.downloads);
    } catch (e) {
      console.error('[OlongNotes] Download failed.', e);
      showBanner(e.message || 'Download failed.', 'report', '');
    }
  }

  // ---------- Action banner helpers ----------

  function showBanner(text, theme, icon) {
    const banner = document.getElementById('actionBanner');
    const bannerText = document.getElementById('actionBannerText');
    const bannerIcon = document.getElementById('actionBannerIcon');
    if (!banner || !bannerText) return;
    bannerText.textContent = text;
    banner.className = `action-banner action-banner--${theme}`;
    if (bannerIcon) bannerIcon.innerHTML = icon; // icon MUST be a hardcoded SVG constant from this file; never pass user input (C8-N1).
    banner.hidden = false;
  }

  function hideBanner() {
    document.getElementById('actionBanner').hidden = true;
  }

  const heartIconFilled = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5.2 3.6c2.1-.5 4.1.4 5.3 2.1a1 1 0 0 0 1.6 0c1.2-1.7 3.2-2.6 5.3-2.1 3.4.9 4.8 4.4 3.2 7.6-2.5 4.7-10 9.3-10 9.3Z"/></svg>`;
  const saveIconFilled = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z"/></svg>`;
  const flagIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M5 4h11l-1.5 4L16 12H5"/></svg>`;

  // ---------- Like ----------

  async function toggleLike(doc) {
    if (!api) return;
    try {
      const data = await api.post(`/notes/${encodeURIComponent(doc.id)}/like`, null, { auth: true });
      // Backend returns { message, liked, likes_count }. The server's
      // count is authoritative — when the user removes their like,
      // the count genuinely drops to 0 (or whatever the new value is).
      // We must NOT fall back to doc.likes on 0, because that would
      // make the UI lie when the user removes the last like. Use a
      // strict null check instead of || so 0 is preserved.
      const liked = Boolean(data && data.liked);
      const count = (data && typeof data.likes_count === 'number')
        ? data.likes_count
        : doc.likes;
      doc.likes = count;
      // Keep the pre-set flag in sync so a fresh page-load after a
      // navigate-back (which re-runs populateSidebar) shows the right
      // state. The server's `liked` field is the truth for THIS click.
      doc.viewerHasLiked = liked;

      const likeBtn = document.getElementById('likeBtn');
      const statLikes = document.getElementById('statLikes');
      likeBtn.classList.toggle('is-active', liked);
      if (statLikes) statLikes.textContent = formatCount(count);

      if (liked) {
        showBanner('Thank you! Your like helps others discover quality notes.', 'like', heartIconFilled);
        recordActivity(doc.id, 'note_liked');
      } else {
        hideBanner();
      }
    } catch (e) {
      if (e.status === 401) {
        showBanner('Log in to like this note.', 'report', '');
      } else {
        showBanner(e.message || 'Couldn\'t save your like. Try again.', 'report', '');
      }
    }
  }

  // ---------- Save / Bookmark ----------

  async function toggleSave(doc) {
    if (!api) return;
    try {
      const data = await api.post(`/notes/${encodeURIComponent(doc.id)}/bookmark`, null, { auth: true });
      const bookmarked = Boolean(data && data.bookmarked);
      // Keep in-memory bookmark count in sync — server's value is
      // authoritative, same null-vs-zero check as toggleLike.
      if (data && typeof data.bookmarks_count === 'number') {
        doc.bookmarks = data.bookmarks_count;
      }
      doc.viewerHasBookmarked = bookmarked;
      const saveBtn = document.getElementById('saveBtn');
      saveBtn.classList.toggle('is-active', bookmarked);
      if (bookmarked) {
        showBanner('Saved! You can find this note in your bookmarks.', 'saved', saveIconFilled);
        recordActivity(doc.id, 'note_bookmarked');
      } else {
        hideBanner();
      }
    } catch (e) {
      if (e.status === 401) {
        showBanner('Log in to bookmark this note.', 'report', '');
      } else {
        showBanner(e.message || 'Couldn\'t save. Try again.', 'report', '');
      }
    }
  }

  // ---------- Report ----------

  function bindReportModal(doc) {
    const reportBtn = document.getElementById('reportBtn');
    const reportModal = document.getElementById('reportModal');
    const reportModalBackdrop = document.getElementById('reportModalBackdrop');
    const reportModalClose = document.getElementById('reportModalClose');
    const reportOptions = document.getElementById('reportOptions');
    const reportOtherSection = document.getElementById('reportOtherSection');
    const reportOtherInput = document.getElementById('reportOtherInput');
    const reportModalDone = document.getElementById('reportModalDone');

    if (!reportBtn || !reportModal) return;

    let selectedReason = null;

    const updateDoneState = () => {
      if (!selectedReason) {
        reportModalDone.disabled = true;
        return;
      }
      if (selectedReason === 'Other') {
        reportModalDone.disabled = reportOtherInput.value.trim() === '';
        return;
      }
      reportModalDone.disabled = false;
    };

    const reset = () => {
      selectedReason = null;
      reportOptions.querySelectorAll('.report-option').forEach((el) => el.classList.remove('is-selected'));
      reportOtherSection.hidden = true;
      reportOtherInput.value = '';
      updateDoneState();
    };

    const open = () => { reset(); reportModal.hidden = false; };
    const close = () => { reportModal.hidden = true; };

    reportBtn.addEventListener('click', open);
    reportModalBackdrop?.addEventListener('click', close);
    reportModalClose?.addEventListener('click', close);

    reportOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.report-option');
      if (!btn) return;
      reportOptions.querySelectorAll('.report-option').forEach((el) => el.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      selectedReason = btn.dataset.reason;

      if (selectedReason === 'Other') {
        reportOtherSection.hidden = false;
        reportOtherInput.focus();
      } else {
        reportOtherSection.hidden = true;
      }
      updateDoneState();
    });

    reportOtherInput.addEventListener('input', updateDoneState);

    reportModalDone.addEventListener('click', async () => {
      if (reportModalDone.disabled || !api) return;
      const reason = selectedReason === 'Other'
        ? reportOtherInput.value.trim()
        : selectedReason;
      if (!reason) return;

      try {
        await api.post(
          `/notes/${encodeURIComponent(doc.id)}/report`,
          { reason },
          { auth: true }
        );
        recordActivity(doc.id, 'note_reported');
        reportBtn.classList.add('is-active');
        close();
        showBanner(`Thanks for flagging "${reason}." Our team will review this document shortly.`, 'report', flagIcon);
        setTimeout(() => reportBtn.classList.remove('is-active'), 1200);
      } catch (e) {
        if (e.status === 401) {
          showBanner('Log in to report this note.', 'report', '');
        } else {
          showBanner(e.message || 'Couldn\'t submit your report. Try again.', 'report', '');
        }
      }
    });
  }

  // ---------- Main ----------

  const doc = await loadNote();
  if (!doc) return;

  populateSidebar(doc);
  renderPage(doc);
  bindToolbar(doc);

  // Record the view in the activity log (backend also writes this from
  // GET /api/notes/:id; the client POST is a safety net for the case
  // where the backend opportunistic-JWT path missed the viewer).
  recordActivity(doc.id, 'note_viewed');

  document.getElementById('likeBtn')?.addEventListener('click', () => toggleLike(doc));
  document.getElementById('saveBtn')?.addEventListener('click', () => toggleSave(doc));
  bindReportModal(doc);
})();
