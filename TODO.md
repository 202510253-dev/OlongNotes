# Upload Notes Fix — Implementation TODO

## 1. HTML (`index.html`)

- [x] Replace `<form id="uploadForm">` block: move Grade Level to top, wrap Subject/Course in `#uploadSubjectField` (disabled initially), delete School field entirely.

## 2. JS (`script.js`)

- [x] Replace the upload-notes block: remove school wiring, add `showUploadError`, `showCollegeMode`, `showK10OrShsMode`, `resetUploadFieldsToPlaceholder`, `openUploadModal`.
- [x] Remove `loadSubjectsForProgram` (fake `/subjects?program_id=X` endpoint).
- [x] Rewrite heroUploadBtn + ctaContribBtn to use `openUploadModal()`.
- [x] Rewrite grade-change handler so Subject hides when College selected.
- [x] Rewrite submit handler: College uses `major || program` as `subject_id`, drop `school_id`.

## 3. CSS (`style.css`)

- [x] Add `#uploadCollegeFields` grid layout rule.
- [x] Add `#uploadCollegeFields { grid-template-columns: 1fr; }` inside `@media (max-width: 640px)`.
- [x] Replace `@media (max-width: 640px)` block with mobile-first bottom-sheet styling (full-width card, 16px inputs, 92vh scroll, tighter spacing).
- [x] Relocate the mobile bottom-sheet block to the very end of the stylesheet so source order wins over the unguarded `.upload-modal` rules; reverted the earlier media-query block to its original simple form.

## Submit handler (feedback)

- [x] Add guard clause blocking empty `subject_id` with a clear message.
- [x] Make `subject_id` append unconditional.

## SHS "core first, then More" + backend JOIN (feedback round 2)

- [x] `routes/catalog.js` GET /subjects: add nested embed `shs_strands ( strand_name, shs_tracks ( track_name ) )`.
- [x] `script.js`: add `MORE_SUBJECTS_VALUE`, `uploadFullSubjectList` cache, `subjectTrackStrand()`, `populateSubjectSelectGrouped()`.
- [x] `script.js`: rewrite `loadSubjectsForLevel` to show core subjects flat + "More subjects..." for senior_high, flat for K-10.
- [x] `script.js`: add `uploadSubjectSelect` change listener to expand "More subjects..." into grouped optgroups by Track — Strand.
- [x] `script.js`: clear `uploadFullSubjectList` cache in `resetUploadFieldsToPlaceholder`.

## Verify

- [x] Sanity-check JS for leftover references to removed functions/variables.
- [x] `node --check` passes for `script.js` and `catalog.js`.

## Custom dropdown enhancement (feedback round 3)

- [x] HTML: swap the five dropdown wrappers (`uploadGradeLevel`, `uploadSubjectSelect`, `uploadCollegeCategorySelect`, `uploadCollegeProgramSelect`, `uploadCollegeMajorSelect`) from `<label>` to `<div class="auth-field">` so clicking the styled trigger doesn't also pop the hidden native picker.
- [x] CSS: add `.cselect` block (native select visually hidden, styled trigger, fixed panel, optgroup group-labels, option rows, "action" row styling for "More subjects...").
- [x] JS: add `initCustomSelect()` — wraps each select with a trigger + panel, uses a MutationObserver to mirror the select's options/optgroups/disabled state, dispatches a real `change` event on selection so existing handlers still fire.
- [x] JS: call `initCustomSelect` on all five selects right after `uploadCollegeMajorSelect` is declared.
- [x] JS: tag the "More subjects..." option with `data-action="more"` so the panel styles it as a distinct action row.

## Custom dropdown trigger-label refresh fix (feedback round 4)

- [x] Root cause: the row click handler set `selectEl.value` (a JS property assignment invisible to the MutationObserver), so the observer never fired and `rebuild()` never re-rendered the trigger's label — the visual selection stayed stale even though the real `<select>` value updated.
- [x] Fix: add a direct `rebuild();` call in the row click handler immediately after `selectEl.value = opt.value;` and before dispatching the `change` event, so the trigger label updates before downstream handlers run. Applies to all five selects (they share `initCustomSelect`).
- [x] `node --check` passes for `script.js`.

## School field re-add (feedback round 5)

- [x] HTML: add a School field (`#uploadSchoolSelect` with `name="school_id"`, default "No specific school") as a `<div class="auth-field">` right after `#uploadCollegeFields` closes and before the Document file field. Uses the same `.cselect` machinery as the other dropdowns.
- [x] JS: declare `uploadSchoolSelect` and register it in the custom-select enhancer list.
- [x] JS: expose `selectEl.refreshCselect = rebuild;` inside `initCustomSelect` so any code that sets `.value` directly can force a re-render (fixes the pre-existing Grade Level reset bug too).
- [x] JS: add `loadSchoolsForUpload()` — lazy-loads `GET /api/schools` once, caches, falls back to "No specific school" on error.
- [x] JS: `resetUploadFieldsToPlaceholder()` now resets School's value and calls `refreshCselect()`.
- [x] JS: `openUploadModal()` is now async — resets Grade Level with `refreshCselect()`, then awaits `loadSchoolsForUpload()` before opening.
- [x] JS: submit handler appends `school_id` (empty string → backend stores `null` via `school_id ? parseInt(...) : null`).
- [x] CSS: zero changes — School reuses existing `.cselect` styling.
- [x] `node --check` passes for `script.js`.

**All tasks complete.**
