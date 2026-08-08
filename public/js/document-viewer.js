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

  // Friendly, human-readable label for the file type shown in the
  // Statistics panel. The stored MIME strings for Office files are long
  // and cryptic (e.g. "application/vnd.openxmlformats-officedocument.
  // presentationml.presentation"), so we map known types to short labels
  // and fall back to the URL extension when the MIME is unknown.
  function getFileTypeLabel(fileType, fileUrl) {
    if (!fileType && !fileUrl) return 'Unknown';

    const type = String(fileType || '').toLowerCase();
    const url = String(fileUrl || '').toLowerCase();

    // Image types
    if (type.startsWith('image/')) {
      const imgMap = {
        png: 'PNG Image',
        jpeg: 'JPEG Image',
        jpg: 'JPEG Image',
        gif: 'GIF Image',
        webp: 'WebP Image',
        svg: 'SVG Image',
        bmp: 'BMP Image'
      };
      for (const ext of Object.keys(imgMap)) {
        if (type.includes(ext)) return imgMap[ext];
      }
      return 'Image';
    }

    // PDF
    if (type === 'application/pdf' || url.includes('.pdf')) {
      return 'PDF Document';
    }

    // Word — check MIME first, then the specific .docx/.doc match so the
    // "word" keyword inside MATLAB/excel-style types doesn't false-match.
    if (type.includes('msword') || type.includes('wordprocessingml') ||
        type.includes('ms-word') ||
        /\.(docx|dotx|docm)$/.test(url) ||
        /\.doc$/.test(url)) {
      return 'Word Document';
    }

    // PowerPoint — cover the raw MIME fragments users actually see
    // (e.g. "presentationml" from the pptx MIME) plus the legacy types.
    if (type.includes('presentationml') ||
        type.includes('powerpoint') ||
        type.includes('ms-powerpoint') ||
        /\.(pptx|ppsx|potx|pptm|potm|ppsm)$/.test(url) ||
        /\.ppt$/.test(url)) {
      return 'PowerPoint Presentation';
    }

    // Excel
    if (type.includes('excel') || type.includes('ms-excel') ||
        type.includes('spreadsheetml') ||
        /\.(xlsx|xlsm|xlsb)$/.test(url) ||
        /\.xls$/.test(url)) {
      return 'Excel Spreadsheet';
    }

    // Plain text
    if (type === 'text/plain' || url.includes('.txt')) {
      return 'Text File';
    }

    // Fallback — derive a label from the URL extension.
    const ext = url.split('#')[0].split('?')[0].split('.').pop();
    return ext ? `${ext.toUpperCase()} File` : 'File';
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
    // Word documents: official MIME types, or a .doc/.docx/.dotx/.docm
    // extension on the URL (some storage buckets / CDNs strip the MIME,
    // so we fall back to the extension like we already do for PDF/image).
const isWord =
      fileType === 'application/msword' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.template' ||
      fileType === 'application/vnd.ms-word' ||
      fileType === 'application/vnd.ms-word.document.macroEnabled.12' ||
      fileType === 'application/vnd.ms-word.template.macroEnabledTemplate.12' ||
      fileType.includes('word') ||
      /\.(docx?|dotx|docm)(\?|$)/i.test(row.file_url || '');
    // PowerPoint documents: official MIME types, or a .ppt/.pptx/.potx/
    // .ppsx/.pptm/.potm/.ppsm extension on the URL. Rendered via Google
    // Docs Viewer, same as Word.
    const isPowerPoint =
      fileType === 'application/vnd.ms-powerpoint' ||
      fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      fileType === 'application/vnd.openxmlformats-officedocument.presentationml.template' ||
      fileType === 'application/vnd.openxmlformats-officedocument.presentationml.slideshow' ||
      fileType === 'application/vnd.ms-powerpoint.presentation.macroEnabled.12' ||
      fileType === 'application/vnd.ms-powerpoint.template.macroEnabled.12' ||
      fileType === 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12' ||
      fileType.includes('powerpoint') ||
      fileType.includes('presentation') ||
      /\.(pptx?|potx|ppsx|pptm|potm|ppsm)(\?|$)/i.test(row.file_url || '');
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
      // Present when this note was uploaded as one of several files in a
      // multi-image upload. The viewer uses it to load the whole group
      // and render a gallery instead of a single image.
groupId: row.group_id || '',
      isPdf,
      isImage,
      isWord,
      isPowerPoint,
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
    document.getElementById('statFileType').textContent = getFileTypeLabel(doc.fileType, doc.fileUrl);

    // Pre-set the like / save buttons based on whether the current
    // viewer has already liked/bookmarked. Without this, the buttons
    // always show the inactive state on page load even when the user
    // has previously liked the note — confusing.
    document.getElementById('likeBtn')?.classList.toggle('is-active', doc.viewerHasLiked);
    document.getElementById('saveBtn')?.classList.toggle('is-active', doc.viewerHasBookmarked);
  }

  // ---------- Document page rendering ----------

// Render the actual file inline when possible (PDF, image, or Word via
  // Google Docs viewer). Falls back to the cover-page scaffolding when
  // the file type isn't one we can embed directly (e.g. pptx, xlsx).
  function renderFileEmbed(doc) {
    if (doc.isPdf && doc.fileUrl) {
      return `
        <iframe
          src="${esc(doc.fileUrl)}"
          title="${esc(doc.title)}"
          loading="lazy"
        ></iframe>
      `;
    }
if (doc.isImage && doc.fileUrl) {
      // Fixed-size image display that fits the viewer. No zoom/pan
      // controls — images scale to fit the available space, keep their
      // aspect ratio, and always show in full. Reliable on all devices
      // and simple to maintain (fixed display is the intended UX).
      return `
        <div class="viewer-image">
          <img
            class="viewer-image__img"
            src="${esc(doc.fileUrl)}"
            alt="${esc(doc.title)}"
            loading="lazy"
          />
        </div>
      `;
    }
// Word documents are previewed via Google's Docs Viewer. Wrap it in a
    // full-bleed container so it fills the viewer panel on all screens.
    // The loading spinner / iframe visibility is toggled from JS (see
    // wireWordLoadEvents) — we cannot use inline onload handlers because
    // the CSP (helmet) sets script-src-attr 'none', which blocks them.
    // The user-controlled file URL is escaped.
    if (doc.isWord && doc.fileUrl) {
      const encodedUrl = encodeURIComponent(doc.fileUrl);
      return `
        <div class="viewer-word">
          <div class="viewer-loading" id="wordLoading">Loading Word document…</div>
          <iframe
            class="viewer-word__frame"
            id="wordFrame"
            src="https://docs.google.com/gview?url=${encodedUrl}&embedded=true"
            title="${esc(doc.title)}"
            loading="lazy"
          ></iframe>
          <div class="viewer-word__bar">
            <span class="viewer-word__label"><strong>Word Document</strong> — Preview powered by Google Docs</span>
            <a class="viewer-word__download" href="${esc(doc.fileUrl)}" target="_blank" rel="noopener noreferrer">⬇ Download Original</a>
          </div>
        </div>
      `;
    }
    // PowerPoint documents are previewed via Google's Docs Viewer too.
    // We reuse the exact same Word container/styles (loading spinner,
    // full-bleed iframe, download bar) so the experience is consistent.
    // The user-controlled file URL is escaped; loading/iframe visibility
    // is toggled from JS (wirePowerPointLoadEvents) because the CSP
    // (helmet) blocks inline onload handlers.
    if (doc.isPowerPoint && doc.fileUrl) {
      const encodedUrl = encodeURIComponent(doc.fileUrl);
      return `
        <div class="viewer-word">
          <div class="viewer-loading" id="pptLoading">Loading PowerPoint presentation…</div>
          <iframe
            class="viewer-word__frame"
            id="pptFrame"
            src="https://docs.google.com/gview?url=${encodedUrl}&embedded=true"
            title="${esc(doc.title)}"
            loading="lazy"
          ></iframe>
          <div class="viewer-word__bar">
            <span class="viewer-word__label"><strong>PowerPoint Presentation</strong> — Preview powered by Google Docs</span>
            <a class="viewer-word__download" href="${esc(doc.fileUrl)}" target="_blank" rel="noopener noreferrer">⬇ Download Original</a>
          </div>
        </div>
      `;
    }
    return renderCoverPage(doc);
  }

  // Wire up the Word preview iframe without inline event handlers.
  // The CSP (helmet) sets script-src-attr 'none', so inline onload is
  // blocked. Instead we attach listeners from JS: hide the spinner once
  // the iframe loads, and show a "download directly" fallback if Google
  // Docs takes too long (or the file isn't reachable by the viewer).
  function wireWordLoadEvents(doc) {
    const iframe = document.getElementById('wordFrame');
    const loading = document.getElementById('wordLoading');
    if (!iframe) return;

    iframe.addEventListener('load', () => {
      if (loading) loading.style.display = 'none';
      iframe.style.display = 'block';
    });

    // Fallback — if the iframe hasn't fired 'load' within 10s, offer a
    // direct link instead of leaving an endless spinner.
    setTimeout(() => {
      if (loading && loading.style.display !== 'none') {
        loading.innerHTML = `
          Loading is taking too long.
          <a href="${esc(doc.fileUrl)}" target="_blank" rel="noopener noreferrer"
             style="color:#0066cc;">Open the document directly</a>
        `;
        iframe.style.display = 'none';
      }
    }, 10000);
  }

  // Wire up the PowerPoint preview iframe without inline event handlers.
  // Identical in behavior to wireWordLoadEvents. Uses its own element
  // IDs (pptFrame/pptLoading) so it never collides with a Word embed.
  function wirePowerPointLoadEvents(doc) {
    const iframe = document.getElementById('pptFrame');
    const loading = document.getElementById('pptLoading');
    if (!iframe) return;

    iframe.addEventListener('load', () => {
      if (loading) loading.style.display = 'none';
      iframe.style.display = 'block';
    });

    // Fallback — if the iframe hasn't fired 'load' within 10s, offer a
    // direct link instead of leaving an endless spinner.
    setTimeout(() => {
      if (loading && loading.style.display !== 'none') {
        loading.innerHTML = `
          Loading is taking too long.
          <a href="${esc(doc.fileUrl)}" target="_blank" rel="noopener noreferrer"
             style="color:#0066cc;">Open the presentation directly</a>
        `;
        iframe.style.display = 'none';
      }
    }, 10000);
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

// ---------- Multi-image gallery ----------
  //
  // When a note has a group_id (it was uploaded as part of a multi-image
  // set), the viewer fetches the whole group and shows a gallery with a
  // main image, prev/next navigation, a counter, and tappable thumbnails.
  // This lets the user see ALL uploaded images, not just the first one.
  // Navigation is wired from JS (CSP-safe; no inline onclick handlers).

  // Fetch every published note in the same group, adapted to viewer shape.
  async function loadGroupNotes(doc) {
    if (!api || !doc.groupId) return [];
    try {
      const rows = await api.get(`/notes/group/${encodeURIComponent(doc.groupId)}`);
      const items = (Array.isArray(rows) ? rows : []).map(adaptNote);
      // Only group images together (a multi-image upload). If the group
      // contains non-image files, fall back to the single-note view.
      return items.filter((n) => n.isImage && n.fileUrl);
    } catch (e) {
      console.error('[OlongNotes] Failed to load image group.', e);
      return [];
    }
  }

  // Render a gallery of images into the viewer page.
  function renderGallery(viewerPage, notes) {
    const escNoteUrl = (n) => esc(n.fileUrl);
    const escNoteTitle = (n) => esc(n.title);

    viewerPage.innerHTML = `
      <div class="gallery">
        <div class="gallery__main">
          <img
            class="gallery__image"
            data-index="0"
            src="${escNoteUrl(notes[0])}"
            alt="${escNoteTitle(notes[0])}"
            loading="eager"
          />
        </div>
        ${
          notes.length > 1
            ? `
            <div class="gallery__nav">
              <button class="gallery__btn" type="button" data-dir="-1" aria-label="Previous image">‹</button>
              <span class="gallery__counter">1 / ${notes.length}</span>
              <button class="gallery__btn" type="button" data-dir="1" aria-label="Next image">›</button>
            </div>
            <div class="gallery__thumbs">
              ${notes
                .map(
                  (n, i) => `
                  <button
                    class="gallery__thumb${i === 0 ? ' is-active' : ''}"
                    type="button"
                    data-index="${i}"
                    aria-label="Image ${i + 1}"
                  >
                    <img src="${escNoteUrl(n)}" alt="${escNoteTitle(n)}" loading="lazy" />
                  </button>`
                )
                .join('')}
            </div>`
            : ''
        }
      </div>
    `;

    // Wire prev/next + thumbnail navigation (CSP-safe).
    const img = viewerPage.querySelector('.gallery__image');
    const counter = viewerPage.querySelector('.gallery__counter');
    const thumbs = Array.from(viewerPage.querySelectorAll('.gallery__thumb'));
    let index = 0;

    const show = (i) => {
      index = (i + notes.length) % notes.length;
      img.src = notes[index].fileUrl;
      img.alt = notes[index].title;
      if (counter) counter.textContent = `${index + 1} / ${notes.length}`;
      thumbs.forEach((t, ti) => t.classList.toggle('is-active', ti === index));
    };

    viewerPage.querySelectorAll('.gallery__btn').forEach((btn) => {
      btn.addEventListener('click', () => show(index + Number(btn.dataset.dir || 0)));
    });
    thumbs.forEach((t) => {
      t.addEventListener('click', () => show(Number(t.dataset.index)));
    });
  }

  function renderPage(doc) {
    const viewerPage = document.getElementById('viewerPage');
    const viewerScrollarea = document.getElementById('viewerScrollarea');
    if (!viewerPage) return;

    // Multi-image upload: load the whole group and render a gallery.
    if (doc.groupId && doc.isImage) {
      loadGroupNotes(doc).then((notes) => {
        if (notes.length > 1) {
          renderGallery(viewerPage, notes);
        } else {
          renderSinglePage(doc, viewerPage, viewerScrollarea);
        }
      });
      return;
    }

    renderSinglePage(doc, viewerPage, viewerScrollarea);
  }

  // Render a single file (PDF / single image / Word / cover page).
  function renderSinglePage(doc, viewerPage, viewerScrollarea) {
    if (!viewerPage) return;
    viewerPage.innerHTML = renderFileEmbed(doc);
    // PDF, Word, and PowerPoint docs are embedded as full-bleed iframes
    // (Google Docs viewer for the Office files), so they share the same
    // full-bleed page/scrollarea classes. This keeps the viewer
    // mobile-friendly — the iframe fills the panel width. Images use a
    // fixed, fitted display inside the normal scrolling page.
    const fullBleed = doc.isPdf || doc.isWord || doc.isPowerPoint;
    viewerPage.classList.toggle('viewer-page--pdf', fullBleed);
    viewerScrollarea?.classList.toggle('viewer-scrollarea--pdf', fullBleed);
    // Attach CSP-safe load listeners for the Word/PowerPoint preview iframes.
    if (doc.isWord) wireWordLoadEvents(doc);
    if (doc.isPowerPoint) wirePowerPointLoadEvents(doc);
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

const viewerPage = document.getElementById('viewerPage');
    const viewerScrollarea = document.getElementById('viewerScrollarea');

// PDFs, Word, and PowerPoint docs have their own built-in zoom controls,
    // and images use a fixed fitted display — so the toolbar zoom buttons
    // are irrelevant for all of them. Disable them so they don't act like
    // dead "reload" buttons. Only the cover-page fallback keeps them enabled.
    if (doc.isPdf || doc.isWord || doc.isImage || doc.isPowerPoint) {
      ['zoomInBtn', 'zoomOutBtn', 'resetBtn'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.disabled = true;
      });
    }

    // Zoom controls for the cover-page fallback (no embeddable file).
    // PDF/Word/PowerPoint embeds have their own controls and images are
    // fixed, so this only scales the cover page.
    let coverZoom = 100;
    const zoomLevel = document.getElementById('zoomLevel');

    const applyCoverZoom = () => {
      if (doc.isPdf || doc.isImage || doc.isWord || doc.isPowerPoint) return;
      viewerPage.style.transform = `scale(${coverZoom / 100})`;
      zoomLevel.textContent = `${coverZoom}%`;
    };

    document.getElementById('zoomInBtn')?.addEventListener('click', () => {
      coverZoom = Math.min(coverZoom + 10, 200);
      applyCoverZoom();
    });

    document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
      coverZoom = Math.max(coverZoom - 10, 50);
      applyCoverZoom();
    });

    document.getElementById('resetBtn')?.addEventListener('click', () => {
      coverZoom = 100;
      applyCoverZoom();
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
