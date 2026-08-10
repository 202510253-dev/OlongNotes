// ===================== SCHOOL PROFILE =====================
// Step 6 (Phase 3.5): wired to live data.
//
// What this page shows:
//   The notes for one school. School identity comes from the `?id=<n>`
//   URL param. Notes come from `GET /api/notes?school_id=<id>`.
//   The sidebar subject list is built dynamically from
//   `GET /api/subjects` so the page reflects whatever the database
//   has — no hardcoded subject slugs.
//
// Click-to-open behaviour:
//   Each doc card navigates to document-viewer.html?id=<note_id>
//   (the same routing Step 4 established for the featured-notes flow).

(function () {
  const esc = (window.OlongNotes && window.OlongNotes.escapeHtml)
    || ((s) => String(s));
  const api = (window.OlongNotes && window.OlongNotes.api) || null;
  // Per-file-type icon (PDF / PPTX / DOCX / XLSX / IMG) — shared by
  // every page that renders document cards. Wraps the colored icon
  // span so callers don't repeat the wrapper template.
  const fileIconHtml = (window.OlongNotes && window.OlongNotes.fileIconMarkup)
    || ((ft) => {
        // Local fallback if file-type-icons.js failed to load.
        const generic = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 15.5h6M9 8.8h2.5"/></svg>';
        return `<span class="doc-card__file-icon" aria-hidden="true">${generic}</span>`;
      });

  // ---------- DOM refs ----------
  const subjectList = document.getElementById('subjectList');
  const subjectSearchInput = document.getElementById('subjectSearchInput');
  const docGrid = document.getElementById('docGrid');
  const docEmpty = document.getElementById('docEmpty');

  // ---------- State ----------
  const state = {
    schoolId: null,
    schoolInfo: { name: 'Loading…', location: 'Olongapo City, Philippines' },
    notes: [],          // rows returned by /api/notes?school_id=X
    subjects: [],       // rows returned by /api/subjects
    subject: 'all',
    search: '',
  };

  // ---------- Helpers ----------
  function initials(name) {
    return name.split(' ').filter(Boolean).slice(0, 2)
      .map((w) => w[0]).join('').toUpperCase();
  }

  function initialsTintsFromName(name) {
    // Same stable hex pick the prototype used. Picks a deterministic
    // tint from a fixed palette keyed off the name's char sum.
    const palette = ['#e7833b', '#3d6bf0', '#2e9e5b', '#e0b23c', '#8b5cf6', '#e0556f'];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return palette[sum % palette.length];
  }

  function fileTypeBadge(fileType) {
    return (window.OlongNotes && window.OlongNotes.fileTypeBadge)
      ? window.OlongNotes.fileTypeBadge(fileType)
      : ((!fileType) ? 'FILE'
         : (fileType === 'application/pdf') ? 'PDF'
         : fileType.includes('word') ? 'DOCX'
         : fileType.includes('sheet') ? 'XLSX'
         : fileType.includes('image/') ? 'IMG'
         : 'FILE');
  }

  // Map a backend note row to the doc-card shape the renderer expects.
  function adaptNoteFromApi(row) {
    return {
      id: row.id,
      title: row.title || 'Untitled',
      caption: row.annotation || '',
      subjectName: (row.subjects && row.subjects.subject_name) || 'General',
      subjectId: row.subject_id,
      author: (row.users && row.users.user_name) || 'Anonymous',
      // denormalized counters from Section 10.2 migration (live since
      // 2026-08-02). Default to 0 if a row pre-dates the migration.
      likes: typeof row.likes_count === 'number' ? row.likes_count : 0,
      downloads: typeof row.download_count === 'number' ? row.download_count : 0,
      gradeLevel: row.grade_level || '',
      fileType: row.file_type || '',
      tint: initialsTintsFromName((row.users && row.users.user_name) || 'anon'),
    };
  }

  // ---------- URL: pull school_id ----------
  function loadSchoolInfo() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    state.schoolId = idParam ? parseInt(idParam, 10) : null;

    // Try to find the school's name from the URL `name` param if present
    // (so the page paints with the name immediately, before the
    // notes load). If absent, fetch /api/schools and find it.
    const nameParam = params.get('name');
    if (nameParam) {
      state.schoolInfo.name = nameParam;
      document.getElementById('schoolHeroTitle').textContent = nameParam;
      document.getElementById('schoolName').textContent = nameParam;
      document.getElementById('schoolInitials').textContent = initials(nameParam);
    } else {
      // We don't know the name yet — keep "Loading…" until the API resolves.
    }
    document.getElementById('schoolLocation').textContent = state.schoolInfo.location;
  }

  // Resolve the school name from /api/schools if the URL didn't carry it.
  async function fetchSchoolName() {
    if (!api) return;
    try {
      const data = await api.get('/schools');
      const rows = Array.isArray(data) ? data : [];
      const match = rows.find((s) => s.id === state.schoolId);
      if (match) {
        state.schoolInfo.name = match.school_name;
        document.getElementById('schoolHeroTitle').textContent = match.school_name;
        document.getElementById('schoolName').textContent = match.school_name;
        document.getElementById('schoolInitials').textContent = initials(match.school_name);
      }
    } catch (e) {
      console.warn('[school-profile] Could not resolve school name.', e);
    }
  }

  // ---------- Subject sidebar (dynamic) ----------
  async function loadSubjects() {
    if (!api) return;
    try {
      const data = await api.get('/subjects');
      const rows = Array.isArray(data) ? data : [];
      state.subjects = rows;
      renderSubjectList();
    } catch (e) {
      console.warn('[school-profile] Could not load subjects.', e);
      // Leave the sidebar's static "All Subjects" only.
    }
  }

  function renderSubjectList() {
    // Wipe and rebuild the subject filter buttons. The first entry is
    // always "All Subjects" (data-subject="all").
    subjectList.innerHTML = '';
    const allLi = document.createElement('li');
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'subject-list__item is-active';
    allBtn.dataset.subject = 'all';
    allBtn.textContent = 'All Subjects';
    allLi.appendChild(allBtn);
    subjectList.appendChild(allLi);

    state.subjects.forEach((subject) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'subject-list__item';
      // store the integer subject_id, not the slug — sidebar buttons
      // compare against note.subject_id (integer).
      btn.dataset.subject = String(subject.id);
      btn.textContent = subject.subject_name;
      li.appendChild(btn);
      subjectList.appendChild(li);
    });
  }

  // ---------- Notes loader ----------
  async function loadNotes() {
    if (!api || !state.schoolId) {
      docEmpty.hidden = false;
      return;
    }
    try {
      const data = await api.get(`/notes?school_id=${state.schoolId}&limit=100`);
      const rows = (data && Array.isArray(data.notes)) ? data.notes : [];
      state.notes = rows.map(adaptNoteFromApi);
    } catch (e) {
      console.warn('[school-profile] Could not load notes.', e);
      state.notes = [];
    }
    renderDocs();
  }

  // ---------- Filter ----------
  function getFilteredDocs() {
    return state.notes.filter((note) => {
      const matchesSubject =
        state.subject === 'all' || String(note.subjectId) === String(state.subject);
      const matchesSearch =
        !state.search ||
        note.title.toLowerCase().includes(state.search.toLowerCase()) ||
        note.caption.toLowerCase().includes(state.search.toLowerCase());
      return matchesSubject && matchesSearch;
    });
  }

  // ---------- Render ----------
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
    const results = getFilteredDocs();
    docGrid.innerHTML = '';

    if (results.length === 0) {
      docEmpty.hidden = false;
      return;
    }
    docEmpty.hidden = true;

    results.forEach((doc) => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      // Every dynamic field is escaped (api.js escapeHtml).
      card.innerHTML = `
        <div class="doc-card__top">
          ${fileIconHtml(doc.fileType)}
          <span class="doc-badge">${esc(fileTypeBadge(doc.fileType))}</span>
        </div>
        <p class="doc-card__title">${esc(doc.title)}</p>
        <p class="doc-card__caption">${esc(doc.caption || `Notes on ${doc.title}.`)}</p>
        <div class="doc-card__tags">
          <span class="doc-card__tag">${esc(doc.gradeLevel || '—')}</span>
          <span class="doc-card__tag">${esc(doc.subjectName)}</span>
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

      // Step 4 routing: navigate to document-viewer with the integer ID.
      card.querySelector('.doc-card__open').addEventListener('click', () => {
        window.location.href = `document-viewer.html?id=${encodeURIComponent(doc.id)}`;
      });

      docGrid.appendChild(card);
    });
  }

  // ---------- Wire up controls ----------
  subjectList.addEventListener('click', (e) => {
    const btn = e.target.closest('.subject-list__item');
    if (!btn) return;
    subjectList.querySelectorAll('.subject-list__item').forEach((el) => el.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.subject = btn.dataset.subject;
    renderDocs();
  });

  // Search input on the subject sidebar — filters the sidebar subject
  // list itself (same behaviour as the prototype).
  subjectSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    subjectList.querySelectorAll('.subject-list__item').forEach((btn) => {
      const li = btn.parentElement;
      const isAll = btn.dataset.subject === 'all';
      const matches = isAll || btn.textContent.toLowerCase().includes(query);
      li.hidden = !matches;
    });
  });

  // ---------- Boot ----------
  loadSchoolInfo();
  fetchSchoolName();
  loadSubjects();
  loadNotes();
})();