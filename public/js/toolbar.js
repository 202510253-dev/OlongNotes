/* ---------------------------------------------------------
   toolbar.js — shared rich-text composer toolbar helpers.
   Used by both the Answer page (answer-page.js) and the Ask
   Question modal (browse-community.js) so B / I / list /
   math markup behave identically and only live in one file.

   Each toolbar button carries:
     data-format    = 'bold' | 'italic' | 'list' | 'math'
   and operates on a plain <textarea> (selection-wrap at the
   cursor position). The native <textarea> remains the source
   of truth — we never replace it with a contentEditable.

   Exposed as window.OlongNotesToolbar.init(container, textarea).
--------------------------------------------------------- */
(function () {
  'use strict';

  // Wrap the current selection (or insert markers with a 'text'
  // placeholder when nothing is selected) and restore focus.
  function wrapSelection(textarea, before, after, placeholder) {
    if (!textarea) return;
    const start = textarea.selectionStart != null ? textarea.selectionStart : 0;
    const end = textarea.selectionEnd != null ? textarea.selectionEnd : 0;
    const selected = textarea.value.slice(start, end);

    if (selected) {
      textarea.setRangeText(before + selected + after, start, end, 'end');
    } else {
      textarea.setRangeText(before + (placeholder || 'text') + after, start, end, 'select');
      // Restore focus so the user can keep typing.
    }
    textarea.focus();
  }

  // Bullet-list: prefix each line of the current selection with "- ".
  function applyList(textarea) {
    if (!textarea) return;
    const start = textarea.selectionStart != null ? textarea.selectionStart : 0;
    const end = textarea.selectionEnd != null ? textarea.selectionEnd : 0;
    const selected = textarea.value.slice(start, end);

    if (selected) {
      const wrapped = '- ' + selected.split('\n').join('\n- ');
      textarea.setRangeText(wrapped, start, end, 'end');
    } else {
      textarea.setRangeText('- ', start, end, 'end');
    }
    textarea.focus();
  }

  // Attach click + keyboard handlers to every .toolbar-btn inside
  // `container`, driving `textarea`.
  function init(container, textarea) {
    if (!container || !textarea) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;
      e.preventDefault();
      const fmt = btn.dataset.format;
      if (fmt === 'bold') wrapSelection(textarea, '**', '**', 'bold text');
      else if (fmt === 'italic') wrapSelection(textarea, '_', '_', 'italic text');
      else if (fmt === 'list') applyList(textarea);
      else if (fmt === 'math') wrapSelection(textarea, '\\(', '\\)', 'formula');
    });
  }

  // Expose a tiny API — guard against double-init.
  window.OlongNotesToolbar = window.OlongNotesToolbar || { init };
})();

