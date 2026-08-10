// ===================== SCHOOLS DIRECTORY =====================
// Step 6 (Phase 3.5): wired to GET /api/schools. Each row is a real
// Olongapo school from the seeded schools table (78 rows verified live).
//
// Behavior:
//   - Loads the school list at page paint from /api/schools.
//   - Builds the client-side filter state (category, letter, search).
//   - On any API failure, falls back to an empty list and logs a warning
//     so the page still renders cleanly.
//   - Clicking a school navigates to school-profile.html?id=<school_id>
//     using the integer primary key, NOT the URL-encoded name. The
//     profile page resolves the name from the same list.
//
// Field shape (from backend):
//   { id: <number>, school_name: <string> }
//
// Field shape (this file uses internally):
//   { id, name, category }  where category is always 'all' for now —
//   the seed data doesn't categorize schools, but the UI still exposes
//   the filter UI for future use.

(function () {
  const esc = (window.OlongNotes && window.OlongNotes.escapeHtml)
    || ((s) => String(s));

  const api = (window.OlongNotes && window.OlongNotes.api) || null;

  // ---------- DOM refs ----------
  const schoolsList = document.getElementById('schoolsList');
  const schoolsEmpty = document.getElementById('schoolsEmpty');
  const categoryEmpty = document.getElementById('categoryEmpty');
  const searchInput = document.getElementById('schoolSearchInput');
  const categoryList = document.getElementById('categoryList');
  const letterGrid = document.getElementById('letterGrid');
  const gridViewBtn = document.getElementById('gridViewBtn');
  const listViewBtn = document.getElementById('listViewBtn');
  const viewAllBtn = document.getElementById('viewAllBtn');

  const PAGE_SIZE = 12;

  // ---------- State ----------
  const state = {
    schools: [],      // raw rows from API
    category: 'all',
    letter: null,
    search: '',
    view: 'list',
    showAll: false,
  };

  // ---------- Icon SVGs (static markup, safe to inline) ----------
  const iconMarkup = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
      <path d="M6 12.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"/>
    </svg>`;

  const chevronMarkup = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 6 6 6-6 6"/>
    </svg>`;

  // ---------- Loading ----------
  async function loadSchools() {
    if (!api) {
      console.warn('[schools] api.js did not load — showing empty state.');
      render();
      return;
    }
    try {
      const data = await api.get('/schools');
      const rows = Array.isArray(data) ? data : [];
      // Normalize: keep server field name (id, school_name), add a `name`
      // alias for the UI layer.
      state.schools = rows.map((row) => ({
        id: row.id,
        name: row.school_name,
        category: 'all',  // seed doesn't categorize; UI filter remains for future use
      })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.warn('[schools] Failed to load /api/schools — empty list.', e);
      state.schools = [];
    }
    initLetterAvailability();
    render();
  }

  // ---------- Filter helpers ----------
  function availableLetters() {
    return new Set(state.schools.map((s) => s.name[0].toUpperCase()));
  }

  function initLetterAvailability() {
    const letters = availableLetters();
    letterGrid.querySelectorAll('.letter-btn').forEach((btn) => {
      if (!letters.has(btn.dataset.letter)) {
        btn.disabled = true;
      }
    });
  }

  function getFilteredSchools() {
    return state.schools.filter((school) => {
      const matchesCategory = state.category === 'all' || school.category === state.category;
      const matchesLetter = !state.letter || school.name.toUpperCase().startsWith(state.letter);
      const matchesSearch =
        !state.search || school.name.toLowerCase().includes(state.search.toLowerCase());
      return matchesCategory && matchesLetter && matchesSearch;
    });
  }

  // ---------- Render ----------
  function render() {
    const results = getFilteredSchools();
    const displayed = state.showAll ? results : results.slice(0, PAGE_SIZE);

    if (results.length <= PAGE_SIZE) {
      state.showAll = false;
      viewAllBtn.hidden = true;
    } else {
      viewAllBtn.hidden = false;
      viewAllBtn.textContent = state.showAll
        ? 'Show fewer schools'
        : `View all Schools (${results.length})`;
    }

    schoolsList.innerHTML = '';
    schoolsList.classList.toggle('is-grid', state.view === 'grid');

    if (results.length === 0) {
      // Category-specific empty state: when a non-"all" category is
      // selected, the seeded data has no schools tagged under it yet
      // (every school's category is hardcoded to 'all'). Show a soft
      // "check back soon" message rather than the generic "filters
      // excluded everything" message — those are different user
      // intents. Keep both messages in the DOM so the layout doesn't
      // jump on toggle.
      if (state.category !== 'all') {
        categoryEmpty.hidden = false;
        schoolsEmpty.hidden = true;
      } else {
        categoryEmpty.hidden = true;
        schoolsEmpty.hidden = false;
      }
      return;
    }
    categoryEmpty.hidden = true;
    schoolsEmpty.hidden = true;

    displayed.forEach((school) => {
      const li = document.createElement('li');
      li.className = 'school-row';
      li.tabIndex = 0;
      li.setAttribute('role', 'link');
      // Every dynamic field below is escaped (api.js escapeHtml).
      li.innerHTML = `
        <span class="school-row__icon" aria-hidden="true">${iconMarkup}</span>
        <span class="school-row__name">${esc(school.name)}</span>
        <span class="school-row__chevron" aria-hidden="true">${chevronMarkup}</span>
      `;

      const goToProfile = () => {
        // Use the integer school_id, not the name. The profile page
        // resolves the name itself from /api/schools.
        window.location.href = `school-profile.html?id=${encodeURIComponent(school.id)}`;
      };

      li.addEventListener('click', goToProfile);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToProfile();
        }
      });

      schoolsList.appendChild(li);
    });
  }

  // ---------- Wire up controls ----------
  categoryList.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-list__item');
    if (!btn || btn.disabled) return;
    categoryList.querySelectorAll('.category-list__item').forEach((el) => el.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.category = btn.dataset.category;
    state.showAll = false;
    render();
  });

  letterGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.letter-btn');
    if (!btn || btn.disabled) return;
    const letter = btn.dataset.letter;
    const alreadyActive = btn.classList.contains('is-active');

    letterGrid.querySelectorAll('.letter-btn').forEach((el) => el.classList.remove('is-active'));

    if (alreadyActive) {
      state.letter = null;
    } else {
      btn.classList.add('is-active');
      state.letter = letter;
    }
    state.showAll = false;
    render();
  });

  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    state.showAll = false;
    render();
  });

  function setView(view) {
    state.view = view;
    gridViewBtn.classList.toggle('is-active', view === 'grid');
    listViewBtn.classList.toggle('is-active', view === 'list');
    render();
  }

  gridViewBtn.addEventListener('click', () => setView('grid'));
  listViewBtn.addEventListener('click', () => setView('list'));

  viewAllBtn.addEventListener('click', () => {
    state.showAll = !state.showAll;
    render();
  });

  // ---------- Boot ----------
  loadSchools();
})();