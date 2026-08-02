// ===================== SUBJECTS DIRECTORY =====================
// Step 6 (Phase 3.5): wired to GET /api/subjects.
//
// What this page shows:
//   Each subject in the seeded subjects table (8 rows verified live).
//   Each tile links to subject-notes.html?subject=<id>.
//
// Field shape (from backend):
//   { id: <number>, subject_name: <string>, category_id: <number>,
//     note_count: <number> }
//
// UI notes:
//   - Sort works on the live `note_count` from the API. Default sort is
//     A–Z (only 8 rows, alphabetical is most useful).
//   - The category filter pills (All / STEM / Languages / Social Studies
//     / Technology / MAPEH & Values) are decorative for now — the DB
//     has `subjects.category_id` but no subject_categories table to map
//     ids to the UI labels. Step 7 work.

(function () {
  const esc = (window.OlongNotes && window.OlongNotes.escapeHtml)
    || ((s) => String(s));
  const api = (window.OlongNotes && window.OlongNotes.api) || null;

  // ---------- DOM refs ----------
  const grid = document.getElementById('subjectsGrid');
  const emptyState = document.getElementById('subjectsEmpty');
  const countLabel = document.getElementById('subjectsCount');
  const searchInput = document.getElementById('subjectSearchInput');
  const categoryFilters = document.getElementById('subjectCategoryFilters');
  const sortSelect = document.getElementById('subjectSortSelect');

  // ---------- State ----------
  const state = {
    subjects: [],     // raw rows from API
    search: '',
    category: 'all',
    sort: 'az',       // default to A-Z — only 8 rows, alphabetical is most useful
  };

  const chevronIcon = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
         class="subject-tile__chevron">
      <path d="m9 6 6 6-6 6"/>
    </svg>`;

  // ---------- Loading ----------
  async function loadSubjects() {
    if (!api) {
      console.warn('[subjects] api.js did not load — showing empty state.');
      render();
      return;
    }
    try {
      const data = await api.get('/subjects');
      const rows = Array.isArray(data) ? data : [];
      // Normalize: keep server fields, add `name` + `count` aliases for the UI.
      state.subjects = rows.map((row) => ({
        id: row.id,
        name: row.subject_name,
        category_id: row.category_id,
        // note_count comes from the backend (a per-row count of published
        // notes — see routes/catalog.js fetchNoteCounts). Defaults to 0
        // if the field is missing so older API responses don't break.
        count: typeof row.note_count === 'number' ? row.note_count : 0,
      }));
    } catch (e) {
      console.warn('[subjects] Failed to load /api/subjects — empty list.', e);
      state.subjects = [];
    }
    render();
  }

  // ---------- Filter + sort ----------
  function getVisibleSubjects() {
    let list = state.subjects.filter((s) => {
      const matchesSearch = !state.search
        || s.name.toLowerCase().includes(state.search.toLowerCase());
      // category_id is opaque to the frontend for now — keep the filter
      // UI but it doesn't filter anything until category metadata is
      // made available. Showing 'all' shows everything.
      const matchesCategory = state.category === 'all';
      return matchesSearch && matchesCategory;
    });

    switch (state.sort) {
      case 'fewest':
        list = [...list].sort((a, b) => a.count - b.count);
        break;
      case 'most':
        list = [...list].sort((a, b) => b.count - a.count);
        break;
      case 'za':
        list = [...list].sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'az':
      default:
        list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }

  // ---------- Render ----------
  function render() {
    const list = getVisibleSubjects();
    countLabel.textContent = `${list.length} subject${list.length === 1 ? '' : 's'}`;

    grid.innerHTML = '';

    if (list.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    list.forEach((subject) => {
      const tile = document.createElement('a');
      tile.className = 'subject-tile';
      // Use the integer subject_id in the URL — same convention as
      // schools.html → school-profile.html?id=<id>.
      tile.href = `subject-notes.html?subject=${encodeURIComponent(subject.id)}`;
      tile.innerHTML = `
        <span class="subject-tile__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
          </svg>
        </span>
        <span class="subject-tile__body">
          <p class="subject-tile__name">${esc(subject.name)}</p>
          <p class="subject-tile__count">${subject.count} Note${subject.count === 1 ? '' : 's'}</p>
        </span>
        ${chevronIcon}
      `;
      grid.appendChild(tile);
    });
  }

  // ---------- Wire up controls ----------
  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    render();
  });

  categoryFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    categoryFilters.querySelectorAll('.filter-pill').forEach((el) => el.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.category = btn.dataset.category;
    render();
  });

  sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  // ---------- Boot ----------
  loadSubjects();
})();