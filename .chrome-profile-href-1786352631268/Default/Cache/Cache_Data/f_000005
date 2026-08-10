/* =========================================================
   OLONGNOTES — SHARED COMMUNITY/CATALOG HELPERS
   ---------------------------------------------------------
   A single source of truth for UI pieces shared between the
   upload flow (index.html / script.js) and the Q&A ask modal
   (community.html / browse-community.js):

     initCustomSelect()       — wraps any native <select> in the
                                styled dark "custom-select" UI used
                                across the app. Fully generic: works
                                on ANY select, re-renders via a
                                MutationObserver whenever the native
                                options/disabled state change.
     createCollegeCascade()   — the College "Department → Program
                                (→ Major)" cascade pulled from the
                                upload flow (script.js). Generic
                                enough for any container, no
                                upload-page coupling.
     resetSelect/populate/... — tiny native-<select> fill helpers
                                used by both flows.

   Both callers attach a shared namespace on window.OlongNotes:
     window.OlongNotes.shared.initCustomSelect(...)
     window.OlongNotes.shared.createCollegeCascade({...})

   Load order: this file MUST load before script.js and
   browse-community.js (see the <script> tags in each page).
========================================================= */
(function () {
  'use strict';

  const ON = (window.OlongNotes = window.OlongNotes || {});
  const esc = ON.escapeHtml || ((s) => String(s == null ? '' : s));

  /* ---------------- Native <select> fill helpers ---------------- */

  function createOption(value, label, disabled = false, selected = false) {
    const option = document.createElement('option');
    option.value = value == null ? '' : String(value);
    option.textContent = label;
    if (disabled) option.disabled = true;
    if (selected) option.selected = true;
    return option;
  }

  function resetSelect(select, placeholder, disabled = true) {
    if (!select) return;
    select.innerHTML = '';
    select.appendChild(createOption('', placeholder, true, true));
    select.disabled = disabled;
  }

  function populateSelect(select, items, valueKey, labelKey, placeholder) {
    if (!select) return;
    resetSelect(select, placeholder, !Array.isArray(items) || items.length === 0);
    if (!Array.isArray(items) || items.length === 0) return;
    select.disabled = false;
    items.forEach((item) => {
      const value = item[valueKey];
      const label = item[labelKey] || item[valueKey] || 'Unnamed';
      select.appendChild(createOption(value, label));
    });
  }

  /* ---------------- Custom select enhancement ----------------
     Wraps a native <select> with a styled trigger + panel. The
     select stays the real value/data source — resetSelect(),
     populateSelect(), and direct option manipulation keep working
     exactly as before, completely unaware this exists. A
     MutationObserver watches the select's options/disabled state
     and re-renders the panel whenever they change, so no other
     code needs to know about this.
     ------------------------------------------------------------- */
  function initCustomSelect(selectEl) {
    if (!selectEl || selectEl.dataset.cselectInit) return;
    selectEl.dataset.cselectInit = '1';

    const wrapper = selectEl.parentElement;
    wrapper.classList.add('cselect');
    selectEl.classList.add('cselect__native');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cselect__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span class="cselect__value"></span><svg class="cselect__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
    wrapper.insertBefore(trigger, selectEl);

    const panel = document.createElement('div');
    panel.className = 'cselect__panel';
    panel.setAttribute('role', 'listbox');
    panel.hidden = true;
    document.body.appendChild(panel);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'cselect__search';
    searchInput.setAttribute('aria-label', 'Search options');
    searchInput.placeholder = 'Search…';
    searchInput.autocomplete = 'off';
    searchInput.hidden = true;
    panel.appendChild(searchInput);

    const valueEl = trigger.querySelector('.cselect__value');

    const closePanel = () => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      wrapper.classList.remove('is-open');
    };

    const openPanel = () => {
      if (selectEl.disabled) return;
      const rect = trigger.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 4}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.width = `${rect.width}px`;
      panel.style.maxHeight = `${Math.max(160, Math.min(340, window.innerHeight - rect.bottom - 16))}px`;
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      wrapper.classList.add('is-open');
      if (searchInput.value) { searchInput.value = ''; applyFilter(); }
      if (!searchInput.hidden) searchInput.focus();
      else {
        const active = panel.querySelector('.cselect__option[aria-selected="true"]') || panel.querySelector('.cselect__option');
        active?.scrollIntoView({ block: 'nearest' });
      }
    };

    trigger.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPanel();
        if (searchInput.hidden) panel.querySelector('.cselect__option')?.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target) && !panel.contains(e.target)) closePanel();
    });
    document.querySelectorAll('.upload-modal .contrib-card, .contrib-card').forEach((card) => {
      card.addEventListener('scroll', closePanel, { passive: true });
    });
    window.addEventListener('resize', closePanel);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) { closePanel(); trigger.focus(); }
    });

    const rebuild = () => {
      trigger.disabled = selectEl.disabled;
      wrapper.classList.toggle('is-disabled', selectEl.disabled);

      const selectedOpt = selectEl.options[selectEl.selectedIndex];
      valueEl.textContent = selectedOpt ? selectedOpt.textContent : '';
      valueEl.classList.toggle('cselect__value--placeholder', !selectEl.value);

      searchInput.hidden = selectEl.options.length < 8 || selectEl.disabled;
      panel.innerHTML = '';
      panel.appendChild(searchInput);

      applyFilter(false);
    };

    const applyFilter = (respectQuery = true) => {
      const query = respectQuery ? searchInput.value.trim().toLowerCase() : '';
      const existingNoResults = panel.querySelector('.cselect__no-results');
      if (existingNoResults) existingNoResults.remove();
      panel.querySelectorAll('.cselect__option, .cselect__group-label').forEach((el) => el.remove());

      let visibleCount = 0;

      const buildRow = (opt) => {
        if (opt.disabled && !opt.value) return; // skip placeholder rows in the panel
        const text = opt.textContent.toLowerCase();
        if (query && !text.includes(query)) return;
        const row = document.createElement('div');
        row.className = 'cselect__option';
        if (opt.dataset.action === 'more') row.classList.add('cselect__option--action');
        row.textContent = opt.textContent;
        row.setAttribute('role', 'option');
        row.tabIndex = -1;
        if (opt.value === selectEl.value) row.setAttribute('aria-selected', 'true');
        row.addEventListener('click', () => {
          selectEl.value = opt.value;
          rebuild();
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          closePanel();
          trigger.focus();
        });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
          else if (e.key === 'Escape') { closePanel(); trigger.focus(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); row.nextElementSibling?.focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); row.previousElementSibling?.focus(); }
        });
        panel.appendChild(row);
        visibleCount++;
      };

      Array.from(selectEl.children).forEach((child) => {
        if (child.tagName === 'OPTGROUP') {
          const groupOptions = Array.from(child.children).filter((o) => {
            if (o.disabled && !o.value) return false;
            return !query || o.textContent.toLowerCase().includes(query);
          });
          if (groupOptions.length > 0) {
            const label = document.createElement('div');
            label.className = 'cselect__group-label';
            label.textContent = child.label;
            panel.appendChild(label);
            groupOptions.forEach(buildRow);
          }
        } else if (child.tagName === 'OPTION') {
          buildRow(child);
        }
      });

      if (visibleCount === 0 && respectQuery) {
        const empty = document.createElement('div');
        empty.className = 'cselect__no-results';
        empty.textContent = 'No matches';
        panel.appendChild(empty);
      }
    };

    searchInput.addEventListener('input', () => applyFilter(true));

    selectEl.refreshCselect = rebuild;

    new MutationObserver(rebuild).observe(selectEl, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'],
    });
    rebuild();
  }

  /* ---------------- College Department → Program cascade ----------------
     Generic version of the upload flow's college cascade. Replaces the
     duplicate loadCollegeCategories / loadProgramsForCategory logic so
     both the upload modal and the Q&A ask modal share one implementation.

     options:
       categorySelect   native <select> for Department (program_categories)
       programSelect    native <select> for Program (programs?category_id=)
       majorSelect      optional native <select> for Major (programs?parent_program_id=)
                        — pass null to skip the major tier.
       onProgramChange  optional callback(programId, categoryId) fired when
                        a program/major is chosen (used to resolve a subject).
       onError          optional callback(message) for loading failures.
       api              window.OlongNotes.api (fallback used if not passed).

     Returns { populateDepartments, reset, getProgramId } useful for
     callers that need to trigger/read the cascade programmatically.
     ---------------------------------------------------------------------- */
  function createCollegeCascade(options) {
    const api = options.api || (ON.api);
    const categorySelect = options.categorySelect;
    const programSelect = options.programSelect;
    const majorSelect = options.majorSelect || null;

    const populateAll = (items, valueKey, labelKey, placeholder, target) => {
      populateSelect(target, items, valueKey, labelKey, placeholder);
    };

    async function populateDepartments() {
      if (!categorySelect) return { ok: false };
      resetSelect(categorySelect, 'Loading departments…', true);
      resetSelect(programSelect, 'Select a program', true);
      if (majorSelect) resetSelect(majorSelect, 'Select a major (optional)', true);
      try {
        const data = await api.get('/program-categories');
        const list = Array.isArray(data) ? data : (data && data.items ? data.items : []);
        populateAll(list, 'id', 'category_name', 'Select a department', categorySelect);
        if (!list.length && options.onError) {
          options.onError('No departments available. Please try again later.');
        }
        return { ok: true, count: list.length };
      } catch (err) {
        resetSelect(categorySelect, 'Unable to load departments');
        if (options.onError) options.onError('Could not load departments. Please try again.');
        console.error('[shared] Failed to load college departments', err);
        return { ok: false };
      }
    }

    async function loadProgramsForCategory(categoryId) {
      if (majorSelect) resetSelect(majorSelect, 'Select a major (optional)', true);
      if (!categoryId) {
        resetSelect(programSelect, 'Select a program', true);
        return { ok: true, count: 0 };
      }
      resetSelect(programSelect, 'Loading programs…', true);
      try {
        const data = await api.get(`/programs?category_id=${encodeURIComponent(categoryId)}`);
        const list = Array.isArray(data) ? data : [];
        populateAll(list, 'id', 'program_name', 'Select a program', programSelect);
        if (!list.length && options.onError) {
          options.onError('No programs available in this department yet.');
        }
        return { ok: true, count: list.length };
      } catch (err) {
        resetSelect(programSelect, 'Unable to load programs', true);
        if (options.onError) options.onError('Could not load programs. Please try again.');
        console.error('[shared] Failed to load programs for category', categoryId, err);
        return { ok: false };
      }
    }

    async function loadMajorsForProgram(programId) {
      if (!majorSelect) return { ok: true, count: 0 };
      if (!programId) {
        resetSelect(majorSelect, 'Select a major (optional)', true);
        return { ok: true, count: 0 };
      }
      resetSelect(majorSelect, 'Loading majors…', true);
      try {
        const data = await api.get(`/programs?parent_program_id=${encodeURIComponent(programId)}`);
        const majors = Array.isArray(data) ? data : [];
        if (majors.length) {
          populateAll(majors, 'id', 'program_name', 'Select a major (optional)', majorSelect);
        } else {
          resetSelect(majorSelect, 'No majors available', true);
        }
        return { ok: true, count: majors.length };
      } catch (err) {
        resetSelect(majorSelect, 'Unable to load majors', true);
        if (options.onError) options.onError('Could not load majors. Please try again.');
        console.error('[shared] Failed to load majors for program', programId, err);
        return { ok: false };
      }
    }

    function reset() {
      resetSelect(categorySelect, 'Select a department', true);
      resetSelect(programSelect, 'Select a program', true);
      if (majorSelect) resetSelect(majorSelect, 'Select a major (optional)', true);
    }

    function getProgramId() {
      // The "program" the subject is resolved from = the chosen program,
      // or the chosen major when present (a major's parent is a program,
      // and subjects are linked to majors too via subjects.program_id).
      if (majorSelect && majorSelect.value) return majorSelect.value;
      return programSelect ? programSelect.value : '';
    }

    // NOTE: This helper does NOT wire change listeners. Cascade change
    // events are page-specific (the upload page already has its own; the
    // ask modal needs a different onProgramChange callback), so each
    // caller wires its own listeners and calls these loaders. That keeps
    // the shared logic (fetch + populate + disabled-state) in one place
    // without double-binding.

    return { populateDepartments, loadProgramsForCategory, loadMajorsForProgram, reset, getProgramId };
  }

  // Expose on the shared namespace.
  ON.shared = ON.shared || {};
  ON.shared.initCustomSelect = initCustomSelect;
  ON.shared.resetSelect = resetSelect;
  ON.shared.populateSelect = populateSelect;
  ON.shared.createOption = createOption;
  ON.shared.createCollegeCascade = createCollegeCascade;
})();

