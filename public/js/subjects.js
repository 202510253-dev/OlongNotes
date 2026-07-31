// ===================== SUBJECTS DIRECTORY =====================
(function () {
  const ICONS = {
    calculator: `<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M8 15h2M12 11h2M12 15h2M16 11h2M16 15h2"/>`,
    flask: `<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 2.9h10.4A2 2 0 0 0 19 18l-5-9V3"/>`,
    bookOpen: `<path d="M12 6.5C10.5 5 8 4.2 5.5 4.2v13.6c2.5 0 5 .8 6.5 2.3 1.5-1.5 4-2.3 6.5-2.3V4.2c-2.5 0-5 .8-6.5 2.3Z"/>`,
    globe: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.4 3.8 8.5s-1.3 6.1-3.8 8.5c-2.5-2.4-3.8-5.4-3.8-8.5S9.5 5.9 12 3.5Z"/>`,
    messageCircle: `<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.6-.8L3 20l1-5.4A8.5 8.5 0 1 1 21 11.5Z"/>`,
    monitor: `<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>`,
    music: `<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>`,
    heart: `<path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5.2 3.6c2.1-.5 4.1.4 5.3 2.1a1 1 0 0 0 1.6 0c1.2-1.7 3.2-2.6 5.3-2.1 3.4.9 4.8 4.4 3.2 7.6-2.5 4.7-10 9.3-10 9.3Z"/>`,
    cpu: `<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>`,
    search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
    briefcase: `<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`,
    messageSquare: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>`,
    leaf: `<path d="M11 20A7 7 0 0 1 4 13V4h9a7 7 0 0 1 7 7v0a9 9 0 0 1-9 9Z"/><path d="M4 13c4-1 8-4 9-9"/>`,
    atom: `<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9" ry="3.8"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)"/>`,
    barChart: `<path d="M4 20V10M12 20V4M20 20v-7"/>`,
    code: `<path d="m9 6-6 6 6 6M15 6l6 6-6 6"/>`,
    database: `<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5V12c0 1.7 3.6 3 8 3s8-1.3 8-3V5.5"/><path d="M4 12v6.5c0 1.7 3.6 3 8 3s8-1.3 8-3V12"/>`,
    book: `<path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z"/>`,
    pencil: `<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`,
    typeAa: `<text x="3.5" y="17.5" font-size="14" font-family="Poppins, sans-serif" font-weight="700" fill="currentColor" stroke="none">Aa</text>`,
    mic: `<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M9 21h6"/>`,
    newspaper: `<path d="M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4Z"/><path d="M4 4v16"/><path d="M8 8h7M8 12h7M8 16h4"/>`,
    scale: `<path d="M12 3v18M9 21h6"/><path d="M5 7h14"/><path d="m5 7-3 6a3 3 0 0 0 6 0Z"/><path d="m19 7-3 6a3 3 0 0 0 6 0Z"/>`,
    trendingUp: `<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>`,
    mapPin: `<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>`,
    landmark: `<path d="M4 21h16M5 21V10M9 21V10M15 21V10M19 21V10M3 10l9-6 9 6"/>`,
    lightbulb: `<path d="M9 18h6M10 22h4M12 2a6 6 0 0 0-4 10.4c.8.7 1 1.4 1 2.6h6c0-1.2.2-1.9 1-2.6A6 6 0 0 0 12 2Z"/>`,
    brain: `<path d="M9 3.5a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 9.7v1.4A3 3 0 0 0 6 13.9v.6a3 3 0 0 0 3 3h1V3.5Z"/><path d="M15 3.5a3 3 0 0 1 3 3v.5a3 3 0 0 1 2 2.7v1.4a3 3 0 0 1-2 2.8v.6a3 3 0 0 1-3 3h-1V3.5Z"/>`,
    users: `<circle cx="8.5" cy="8" r="3"/><path d="M2.5 19c1-3 3.3-4.6 6-4.6s5 1.6 6 4.6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.3 14.6c2.1.3 3.7 1.7 4.4 3.9"/>`,
    user: `<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5"/>`,
    heartPulse: `<path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5.2 3.6c2.1-.5 4.1.4 5.3 2.1a1 1 0 0 0 1.6 0c1.2-1.7 3.2-2.6 5.3-2.1 3.4.9 4.8 4.4 3.2 7.6-2.5 4.7-10 9.3-10 9.3Z"/><path d="M4 11h3l1.4-3 2 4.5L12 10l1 1h4"/>`,
    running: `<circle cx="14.5" cy="4.5" r="1.8"/><path d="m7 21 2-5.5 3-1.8-1-3.7 3.5 1 1.5 3.2"/><path d="m9.5 13.7-3 1.3-2 4"/>`,
  };

  const SUBJECTS = [
    { name: 'Mathematics', count: 245, category: 'stem', icon: 'calculator' },
    { name: 'Science', count: 198, category: 'stem', icon: 'flask' },
    { name: 'English', count: 176, category: 'languages', icon: 'bookOpen' },
    { name: 'Araling Panlipunan', count: 153, category: 'social-studies', icon: 'globe' },
    { name: 'Filipino', count: 141, category: 'languages', icon: 'messageCircle' },
    { name: 'ICT', count: 132, category: 'technology', icon: 'monitor' },
    { name: 'MAPEH', count: 128, category: 'mapeh-values', icon: 'music' },
    { name: 'Values Education', count: 118, category: 'mapeh-values', icon: 'heart' },
    { name: 'Technology', count: 112, category: 'technology', icon: 'cpu' },
    { name: 'Research', count: 108, category: 'stem', icon: 'search' },
    { name: 'Entrepreneurship', count: 104, category: 'technology', icon: 'briefcase' },
    { name: 'Communication', count: 98, category: 'languages', icon: 'messageSquare' },
    { name: 'Biology', count: 96, category: 'stem', icon: 'leaf' },
    { name: 'Chemistry', count: 92, category: 'stem', icon: 'flask' },
    { name: 'Physics', count: 89, category: 'stem', icon: 'atom' },
    { name: 'Statistics', count: 85, category: 'stem', icon: 'barChart' },
    { name: 'Computer Science', count: 82, category: 'technology', icon: 'code' },
    { name: 'Information Technology', count: 78, category: 'technology', icon: 'database' },
    { name: 'Literature', count: 75, category: 'languages', icon: 'book' },
    { name: 'Creative Writing', count: 72, category: 'languages', icon: 'pencil' },
    { name: 'Foreign Language', count: 70, category: 'languages', icon: 'messageCircle' },
    { name: 'Grammar', count: 68, category: 'languages', icon: 'typeAa' },
    { name: 'Speech', count: 65, category: 'languages', icon: 'mic' },
    { name: 'Journalism', count: 62, category: 'languages', icon: 'newspaper' },
    { name: 'Civics', count: 60, category: 'social-studies', icon: 'scale' },
    { name: 'Economics', count: 58, category: 'social-studies', icon: 'trendingUp' },
    { name: 'Geography', count: 56, category: 'social-studies', icon: 'mapPin' },
    { name: 'History', count: 54, category: 'social-studies', icon: 'landmark' },
    { name: 'Philosophy', count: 52, category: 'social-studies', icon: 'lightbulb' },
    { name: 'Psychology', count: 50, category: 'social-studies', icon: 'brain' },
    { name: 'Sociology', count: 48, category: 'social-studies', icon: 'users' },
    { name: 'Anthropology', count: 46, category: 'social-studies', icon: 'user' },
    { name: 'Political Science', count: 45, category: 'social-studies', icon: 'landmark' },
    { name: 'Environmental Science', count: 44, category: 'stem', icon: 'leaf' },
    { name: 'Health', count: 43, category: 'mapeh-values', icon: 'heartPulse' },
    { name: 'Physical Education', count: 42, category: 'mapeh-values', icon: 'running' },
  ];

  const grid = document.getElementById('subjectsGrid');
  const emptyState = document.getElementById('subjectsEmpty');
  const countLabel = document.getElementById('subjectsCount');
  const searchInput = document.getElementById('subjectSearchInput');
  const categoryFilters = document.getElementById('subjectCategoryFilters');
  const sortSelect = document.getElementById('subjectSortSelect');

  const state = { search: '', category: 'all', sort: 'most' };

  const chevronIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="subject-tile__chevron"><path d="m9 6 6 6-6 6"/></svg>`;

  function getVisibleSubjects() {
    let list = SUBJECTS.filter((s) => {
      const matchesCategory = state.category === 'all' || s.category === state.category;
      const matchesSearch = !state.search || s.name.toLowerCase().includes(state.search.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    switch (state.sort) {
      case 'fewest':
        list = [...list].sort((a, b) => a.count - b.count);
        break;
      case 'az':
        list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'za':
        list = [...list].sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'most':
      default:
        list = [...list].sort((a, b) => b.count - a.count);
    }

    return list;
  }

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
      // Clicking a subject opens the dedicated subject-notes page,
      // filtered to this subject.
      tile.href = `subject-notes.html?subject=${encodeURIComponent(subject.name)}`;
      tile.innerHTML = `
        <span class="subject-tile__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[subject.icon]}</svg>
        </span>
        <span class="subject-tile__body">
          <p class="subject-tile__name">${subject.name}</p>
          <p class="subject-tile__count">${subject.count} Notes</p>
        </span>
        ${chevronIcon}
      `;
      grid.appendChild(tile);
    });
  }

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

  render();
})();