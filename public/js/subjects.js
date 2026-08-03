// ===================== SUBJECTS DIRECTORY (tiered) =====================
// Step 7 (Phase 3.5): K-10 / Senior High / College catalog restructure.
//
// Flow:
//   1. Page load shows three level bubbles (K-10 / Senior High / College).
//   2. K-10 and Senior High → fetch GET /api/subjects?education_level=...
//      and render the same flat subject cards as today.
//   3. College → multi-step drill-down:
//        a. GET /api/program-categories       → 6 category cards
//        b. GET /api/programs?category_id=X    → program cards
//        c. GET /api/programs?parent_program_id=X → major cards, ONLY if
//           the response is non-empty. If empty, skip straight to step (d).
//        d. GET /api/subjects?program_id=X     → subject cards
//   4. Click any subject → subject-notes.html?subject=<id> (unchanged).
//
// Old UI removed (search box, category filter pills, sort dropdown, the
// "8 subjects" count label) — the tiered flow replaces them entirely.
// Subjects only load after a level bubble is clicked; no auto-fetch on
// page load.
//
// Field shapes (back-end):
//   { id, subject_name, cover_image_url, preview_content, category_id,
//     education_level, program_id }
//   /api/program-categories → [{ id, category_name }]
//   /api/programs?category_id=X → [{ id, program_name, parent_program_id,
//     category_id }] (top-level only)
//   /api/programs?parent_program_id=X → [{ id, program_name, ... }]
//   /api/subjects?program_id=X → [{ id, subject_name, ... }] (college)
//
// All dynamic fields are escaped via api.js escapeHtml.

(function () {
  const esc = (window.OlongNotes && window.OlongNotes.escapeHtml)
    || ((s) => String(s));
  const api = (window.OlongNotes && window.OlongNotes.api) || null;

  // ---------- DOM refs ----------
  const levelBubbles = document.getElementById('levelBubbles');
  const breadcrumb = document.getElementById('subjectsBreadcrumb');
  const breadcrumbBack = document.getElementById('breadcrumbBack');
  const breadcrumbBackLabel = document.getElementById('breadcrumbBackLabel');
  const breadcrumbPath = document.getElementById('breadcrumbPath');
  const stageTitle = document.getElementById('stageTitle');

  const subjectsGrid = document.getElementById('subjectsGrid');
  const categoryGrid = document.getElementById('categoryGrid');
  const programGrid = document.getElementById('programGrid');
  const majorGrid = document.getElementById('majorGrid');

  const stageSubjects = document.getElementById('stageSubjects');
  const stageCategories = document.getElementById('stageCategories');
  const stagePrograms = document.getElementById('stagePrograms');
  const stageMajors = document.getElementById('stageMajors');

  const loadingEl = document.getElementById('subjectsLoading');
  const emptyEl = document.getElementById('subjectsEmpty');
  const errorEl = document.getElementById('subjectsError');

  // ---------- State ----------
  // Each stack entry is a "step" the user has drilled into:
  //   { kind: 'level' | 'category' | 'program' | 'major', label, id? }
  // The breadcrumb is the labels joined by › .
  // The current stage is derived from the LAST entry's kind.
  const state = { stack: [] };

  const LEVEL_LABELS = {
    k10: 'K-10',
    senior_high: 'Senior High',
    college: 'College',
  };

  // ---------- Stage visibility helpers ----------
  function showOnly(stage) {
    [stageSubjects, stageCategories, stagePrograms, stageMajors].forEach((el) => {
      if (el) el.hidden = (el !== stage);
    });
  }

  function hideAllStages() {
    [stageSubjects, stageCategories, stagePrograms, stageMajors].forEach((el) => {
      if (el) el.hidden = true;
    });
  }

  function setStateVisible(text) {
    if (text) {
      emptyEl.textContent = text;
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
    }
    errorEl.hidden = true;
    loadingEl.hidden = true;
  }

  function setLoading(on) {
    loadingEl.hidden = !on;
    if (on) {
      emptyEl.hidden = true;
      errorEl.hidden = true;
    }
  }

  function setError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    loadingEl.hidden = true;
    emptyEl.hidden = true;
  }

  function setStageTitle(text) {
    if (text) {
      stageTitle.textContent = text;
      stageTitle.hidden = false;
    } else {
      stageTitle.textContent = '';
      stageTitle.hidden = true;
    }
  }

  // ---------- Breadcrumb ----------
  function renderBreadcrumb() {
    if (state.stack.length === 0) {
      breadcrumb.hidden = true;
      return;
    }
    breadcrumb.hidden = false;
    breadcrumbPath.textContent = state.stack.map((e) => e.label).join(' › ');

    // Back-button label = the previous step's label, or "All levels" if
    // we're at the root.
    const prevLabel = state.stack.length === 1
      ? 'All levels'
      : state.stack[state.stack.length - 2].label;
    breadcrumbBackLabel.textContent = prevLabel;
  }


  function resetStack() {
    state.stack = [];
    renderBreadcrumb();
  }

  // ---------- Fetchers ----------
  async function fetchSubjectsForLevel(level) {
    if (!api) throw new Error('API helper not loaded.');
    const data = await api.get(`/subjects?education_level=${encodeURIComponent(level)}`);
    return Array.isArray(data) ? data : [];
  }

  async function fetchProgramCategories() {
    if (!api) throw new Error('API helper not loaded.');
    const data = await api.get('/program-categories');
    return Array.isArray(data) ? data : [];
  }

  async function fetchProgramsByCategory(categoryId) {
    if (!api) throw new Error('API helper not loaded.');
    const data = await api.get(`/programs?category_id=${encodeURIComponent(categoryId)}`);
    return Array.isArray(data) ? data : [];
  }

  async function fetchMajorsByProgram(programId) {
    if (!api) throw new Error('API helper not loaded.');
    const data = await api.get(`/programs?parent_program_id=${encodeURIComponent(programId)}`);
    return Array.isArray(data) ? data : [];
  }

  async function fetchSubjectsForProgram(programId) {
    if (!api) throw new Error('API helper not loaded.');
    const data = await api.get(`/subjects?program_id=${encodeURIComponent(programId)}`);
    return Array.isArray(data) ? data : [];
  }

  // ---------- Renderers ----------
  function renderSubjectTile(subject) {
    const a = document.createElement('a');
    a.className = 'subject-tile';
    a.href = `subject-notes.html?subject=${encodeURIComponent(subject.id)}`;
    a.setAttribute('aria-label', `Open ${subject.subject_name} notes`);
    a.innerHTML = `
      <span class="subject-tile__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
        </svg>
      </span>
      <span class="subject-tile__body">
        <p class="subject-tile__name">${esc(subject.subject_name)}</p>
      </span>
      <span class="subject-tile__chevron" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
      </span>
    `;
    return a;
  }

  function renderSubjectsStage(subjects) {
    showOnly(stageSubjects);
    subjectsGrid.innerHTML = '';
    if (!Array.isArray(subjects) || subjects.length === 0) {
      setStateVisible('No subjects in this level yet.');
      return;
    }
    setStateVisible(null);
    subjects.forEach((subject) => subjectsGrid.appendChild(renderSubjectTile(subject)));
  }

  function renderCategoriesStage(categories) {
    showOnly(stageCategories);
    categoryGrid.innerHTML = '';
    if (!Array.isArray(categories) || categories.length === 0) {
      setStateVisible('No college categories are available yet.');
      return;
    }
    setStateVisible(null);
    categories.forEach((category) => {
      const btn = document.createElement('button');
      btn.className = 'card-tile';
      btn.type = 'button';
      btn.dataset.categoryId = category.id;
      btn.innerHTML = `
        <span class="card-tile__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>
          </svg>
        </span>
        <span class="card-tile__body">
          <p class="card-tile__title">${esc(category.category_name)}</p>
        </span>
        <span class="card-tile__chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
        </span>
      `;
      btn.addEventListener('click', () => onCategoryClick(category));
      categoryGrid.appendChild(btn);
    });
  }

  function renderProgramsStage(programs) {
    showOnly(stagePrograms);
    programGrid.innerHTML = '';
    if (!Array.isArray(programs) || programs.length === 0) {
      setStateVisible('No programs in this category yet.');
      return;
    }
    setStateVisible(null);
    programs.forEach((program) => {
      const btn = document.createElement('button');
      btn.className = 'card-tile';
      btn.type = 'button';
      btn.dataset.programId = program.id;
      btn.innerHTML = `
        <span class="card-tile__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 9 12 4l10 5-10 5L2 9Z"/>
            <path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>
          </svg>
        </span>
        <span class="card-tile__body">
          <p class="card-tile__title">${esc(program.program_name)}</p>
        </span>
        <span class="card-tile__chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
        </span>
      `;
      btn.addEventListener('click', () => onProgramClick(program));
      programGrid.appendChild(btn);
    });
  }

  function renderMajorsStage(majors) {
    showOnly(stageMajors);
    majorGrid.innerHTML = '';
    if (!Array.isArray(majors) || majors.length === 0) {
      setStateVisible('No majors in this program yet.');
      return;
    }
    setStateVisible(null);
    majors.forEach((major) => {
      const btn = document.createElement('button');
      btn.className = 'card-tile';
      btn.type = 'button';
      btn.dataset.majorId = major.id;
      btn.innerHTML = `
        <span class="card-tile__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16M4 12h16M4 18h10"/>
          </svg>
        </span>
        <span class="card-tile__body">
          <p class="card-tile__title">${esc(major.program_name)}</p>
        </span>
        <span class="card-tile__chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
        </span>
      `;
      btn.addEventListener('click', () => onMajorClick(major));
      majorGrid.appendChild(btn);
    });
  }

  // ---------- Drill-down handlers ----------
  async function onLevelClick(level) {
    resetStack();
    state.stack.push({ kind: 'level', label: LEVEL_LABELS[level] || level, level });
    renderBreadcrumb();
    setStageTitle(null);
    setLoading(true);
    hideAllStages();
    try {
      const subjects = await fetchSubjectsForLevel(level);

      // Friendlier empty-state for K-10 since DB has no content yet.
      if ((!subjects || subjects.length === 0) && level === 'k10') {
        setStateVisible('K-10 content is on its way. We don\'t have any K-10 subjects yet — check back soon.');
        return;
      }
      renderSubjectsStage(subjects);
    } catch (e) {
      console.error(`[subjects] Failed to load ${level} subjects.`, e);
      setError(`We couldn\'t load ${LEVEL_LABELS[level] || 'this level'} subjects. ${e.message || ''}`.trim());
    }
  }

  async function onCategoryClick(category) {
    state.stack.push({ kind: 'category', label: category.category_name, id: category.id });
    renderBreadcrumb();
    setStageTitle('Choose a program');
    setLoading(true);
    try {
      const programs = await fetchProgramsByCategory(category.id);
      renderProgramsStage(programs);
    } catch (e) {
      console.error('[subjects] Failed to load programs.', e);
      setError(`We couldn\'t load programs for ${category.category_name}. ${e.message || ''}`.trim());
    }
  }

  async function onProgramClick(program) {
    state.stack.push({ kind: 'program', label: program.program_name, id: program.id });
    renderBreadcrumb();
    setLoading(true);
    try {
      const majors = await fetchMajorsByProgram(program.id);
      if (!majors || majors.length === 0) {
        // Skip the major step — go straight to subjects.
        setStageTitle('Subjects');
        const subjects = await fetchSubjectsForProgram(program.id);
        renderSubjectsStage(subjects);
      } else {
        setStageTitle('Choose a major');
        renderMajorsStage(majors);
      }
    } catch (e) {
      console.error('[subjects] Failed to load majors.', e);
      setError(`We couldn\'t load majors for ${program.program_name}. ${e.message || ''}`.trim());
    }
  }

  async function onMajorClick(major) {
    state.stack.push({ kind: 'major', label: major.program_name, id: major.id });
    renderBreadcrumb();
    setStageTitle('Subjects');
    setLoading(true);
    try {
      const subjects = await fetchSubjectsForProgram(major.id);
      renderSubjectsStage(subjects);
    } catch (e) {
      console.error('[subjects] Failed to load subjects.', e);
      setError(`We couldn\'t load subjects for ${major.program_name}. ${e.message || ''}`.trim());
    }
  }

  // ---------- Back navigation ----------
  // Each step back rewinds the stack by one entry and re-renders the
  // stage that entry represents.
  async function onBackClick() {
    if (state.stack.length === 0) return;

    if (state.stack.length === 1) {
      // Back to the level bubbles.
      resetStack();
      hideAllStages();
      setStageTitle(null);
      setStateVisible(null);
      return;
    }

    // Pop the current step and find what we're rewinding TO.
    state.stack.pop();
    renderBreadcrumb();

    const top = state.stack[state.stack.length - 1]; // rewound-to step

    if (top.kind === 'level') {
      setStageTitle(null);
      setLoading(true);
      try {
        const subjects = await fetchSubjectsForLevel(top.level);
        renderSubjectsStage(subjects);
      } catch (e) {
        console.error('[subjects] Back: failed to load level subjects.', e);
        setError(`We couldn\'t reload ${LEVEL_LABELS[top.level] || 'this level'}. ${e.message || ''}`.trim());
      }
      return;
    }

    if (top.kind === 'category') {
      setStageTitle('Choose a program');
      setLoading(true);
      try {
        const programs = await fetchProgramsByCategory(top.id);
        renderProgramsStage(programs);
      } catch (e) {
        console.error('[subjects] Back: failed to load programs.', e);
        setError(`We couldn\'t reload programs. ${e.message || ''}`.trim());
      }
      return;
    }

    if (top.kind === 'program') {
      setStageTitle('Choose a major');
      setLoading(true);
      try {
        const majors = await fetchMajorsByProgram(top.id);
        if (!majors || majors.length === 0) {
          // The major step was skipped originally — rewind directly to subjects.
          setStageTitle('Subjects');
          const subjects = await fetchSubjectsForProgram(top.id);
          renderSubjectsStage(subjects);
        } else {
          renderMajorsStage(majors);
        }
      } catch (e) {
        console.error('[subjects] Back: failed to load majors.', e);
        setError(`We couldn\'t reload majors. ${e.message || ''}`.trim());
      }
      return;
    }
  }

  // ---------- Wire-up ----------
  function wire() {
    levelBubbles.addEventListener('click', (e) => {
      const btn = e.target.closest('.level-bubble');
      if (!btn) return;
      const level = btn.dataset.level;
      if (!level) return;
      onLevelClick(level);
    });

    breadcrumbBack.addEventListener('click', onBackClick);
  }

  // ---------- Boot ----------
  hideAllStages();
  setStateVisible(null);
  setStageTitle(null);
  resetStack();
  wire();
})();
