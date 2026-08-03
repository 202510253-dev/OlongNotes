// ===================== SUBJECT NOTES (browse by subject) =====================
// Step 6 (Phase 3.5): wired to live data.
//
// What this page shows:
//   All notes for one subject. Subject identity comes from the
//   `?subject=<id>` URL param. Notes come from
//   `GET /api/notes?subject_id=<id>`.
//   The hero title resolves from /api/subjects.
//
// Click-to-open:
//   Each doc card navigates to document-viewer.html?id=<note_id>
//   (same Step 4 routing as school-profile.html).

(function () {
  const esc = (window.OlongNotes && window.OlongNotes.escapeHtml)
    || ((s) => String(s));
  const api = (window.OlongNotes && window.OlongNotes.api) || null;

  // ---------- DOM refs ----------
  const heroTitle = document.getElementById('subjectNotesHeroTitle');
  const heroText = document.getElementById('subjectNotesHeroText');
  const docGrid = document.getElementById('docGrid');
  const docEmpty = document.getElementById('docEmpty');

  // ---------- State ----------
  const params = new URLSearchParams(window.location.search);
  const subjectIdParam = params.get('subject');
  const subjectId = subjectIdParam ? parseInt(subjectIdParam, 10) : null;

  // Will be filled in once /api/subjects resolves.
  const state = {
    notes: [],
    subjectName: 'Subject',
  };

  // ---------- Helpers ----------
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
    if (!fileType) return 'FILE';
    if (fileType === 'application/pdf') return 'PDF';
    if (fileType.includes('word')) return 'DOCX';
    if (fileType.includes('sheet')) return 'XLSX';
    if (fileType.includes('image/')) return 'IMG';
    return 'FILE';
  }

  function adaptNoteFromApi(row) {
    return {
      id: row.id,
      title: row.title || 'Untitled',
      caption: row.annotation || '',
      subjectName: (row.subjects && row.subjects.subject_name) || 'General',
      author: (row.users && row.users.user_name) || 'Anonymous',
      likes: typeof row.likes_count === 'number' ? row.likes_count : 0,
      downloads: typeof row.download_count === 'number' ? row.download_count : 0,
      gradeLevel: row.grade_level || '',
      fileType: row.file_type || '',
      school: (row.schools && row.schools.school_name) || 'Unknown school',
      tint: initialsTintsFromName((row.users && row.users.user_name) || 'anon'),
    };
  }

  // ---------- Subject name resolution ----------
  async function resolveSubjectName() {
    if (!api) {
      // Even with no API, the hero can still render with "Subject".
      heroTitle.textContent = `${state.subjectName} Notes`;
      heroText.textContent = `High-quality ${state.subjectName} learning materials shared by students and educators.`;
      return;
    }
    try {
      const data = await api.get('/subjects');
      const rows = Array.isArray(data) ? data : [];
      const match = rows.find((s) => s.id === subjectId);
      if (match) {
        state.subjectName = match.subject_name;
      }
    } catch (e) {
      console.warn('[subject-notes] Could not resolve subject name.', e);
    }
    heroTitle.textContent = `${state.subjectName} Notes`;
    heroText.textContent = `High-quality ${state.subjectName} learning materials shared by students and educators.`;
  }

  // ---------- Notes loader ----------
  async function loadNotes() {
    if (!api || !subjectId) {
      docEmpty.hidden = false;
      return;
    }
    try {
      const data = await api.get(`/notes?subject_id=${subjectId}&limit=100`);
      const rows = (data && Array.isArray(data.notes)) ? data.notes : [];
      state.notes = rows.map(adaptNoteFromApi);
    } catch (e) {
      console.warn('[subject-notes] Could not load notes.', e);
      state.notes = [];
    }
    renderDocs();
  }

  // ---------- Render ----------
  const fileIconMarkup = `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
         class="doc-card__file-icon">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>
      <path d="M14 3v5h5"/>
      <path d="M9 12h6M9 15.5h6M9 8.8h2.5"/>
    </svg>`;

  const heartIconMarkup = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5.2 3.6c2.1-.5 4.1.4 5.3 2.1a1 1 0 0 0 1.6 0c1.2-1.7 3.2-2.6 5.3-2.1 3.4.9 4.8 4.4 3.2 7.6-2.5 4.7-10 9.3-10 9.3Z"/>
    </svg>`;

  const downloadIconMarkup = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>
    </svg>`;

  function renderDocs() {
    docGrid.innerHTML = '';

    if (state.notes.length === 0) {
      docEmpty.hidden = false;
      return;
    }
    docEmpty.hidden = true;

    state.notes.forEach((doc) => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      card.innerHTML = `
        <div class="doc-card__top">
          ${fileIconMarkup}
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
  }

  // ---------- Boot ----------
  resolveSubjectName();
  loadNotes();
})();