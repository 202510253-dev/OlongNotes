// ===================== ANSWER PAGE =====================
// answer.html?id={question_id}
//
// Dedicated page whose ONLY job is writing an answer (Brainly-style).
// - Reads the question id from the URL.
// - Fetches GET /api/questions/:id for a minimal read-only context
//   header (title + subject/grade pill) — no full body, no answers,
//   no feed.
// - Auth-gated: anonymous users are redirected away before they can
//   reach the composer.
// - Posts { content } to POST /api/questions/:id/answer on success,
//   then navigates to question.html?id={id}.
//
// QUIT-CONFIRMATION:
//   If the textarea has unsaved text and the user tries to leave
//   (Cancel/Back button, browser back, or tab close), we show a
//   confirmation dialog. For in-app Cancel/Back we use a real custom
//   modal. For browser tab-close / back-button we attach a native
//   `beforeunload` handler — note: the browser controls that prompt's
//   text, so it won't match our custom copy exactly (that's a browser
//   limitation; a custom modal can't intercept those cases).

(function () {
  'use strict';

  const esc = (s) =>
    window.OlongNotes && window.OlongNotes.escapeHtml
      ? window.OlongNotes.escapeHtml(s)
      : String(s == null ? '' : s);

  const params = new URLSearchParams(window.location.search);
  const questionId = params.get('id');

  const textarea = document.getElementById('answerTextarea');
  const contextEl = document.getElementById('answerContext');
  const cancelBtn = document.getElementById('answerCancelBtn');
  const backLink = document.getElementById('answerBackLink');
  const postBtn = document.getElementById('answerPostBtn');
  const errorEl = document.getElementById('answerError');
  const quitModal = document.getElementById('quitModal');
  const quitStayBtn = document.getElementById('quitStayBtn');
  const quitLeaveBtn = document.getElementById('quitLeaveBtn');
  const quitBackdrop = document.getElementById('quitModalBackdrop');

  // ---------- Auth gate ----------
  function isAuthed() {
    return !!(window.OlongNotes && window.OlongNotes.getToken && window.OlongNotes.getToken());
  }

  // ---------- Quit-confirmation state ----------
  // Holds the destination once "quit" is confirmed, so the leave
  // handler can navigate after the user picks "Yes, I want to quit".
  let pendingLeave = null;

  function hasUnsavedText() {
    return !!(textarea && textarea.value && textarea.value.trim().length > 0);
  }

  function openQuitModal() {
    if (quitModal) {
      quitModal.classList.add('is-open');
      quitModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeQuitModal() {
    if (quitModal) {
      quitModal.classList.remove('is-open');
      quitModal.setAttribute('aria-hidden', 'true');
    }
  }

  // In-app leave requests (Cancel button / Back link) go through the
  // custom modal when there's unsaved text.
  function requestLeave(destination) {
    if (hasUnsavedText()) {
      pendingLeave = destination;
      openQuitModal();
    } else {
      navigate(destination);
    }
  }

  function navigate(destination) {
    window.location.href = destination;
  }

  if (quitStayBtn) {
    quitStayBtn.addEventListener('click', () => {
      closeQuitModal();
      pendingLeave = null;
    });
  }

  if (quitLeaveBtn) {
    quitLeaveBtn.addEventListener('click', () => {
      closeQuitModal();
      const dest = pendingLeave;
      pendingLeave = null;
      if (dest) navigate(dest);
    });
  }

  if (quitBackdrop) {
    quitBackdrop.addEventListener('click', () => {
      closeQuitModal();
      pendingLeave = null;
    });
  }

  // ---------- beforeunload (browser tab-close / back-button) ----------
  // The custom modal can't intercept browser-native navigation, so we
  // use `beforeunload` to prompt when there's unsaved text. The browser
  // controls the prompt copy — it will NOT match our custom modal text.
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedText()) {
      // Standard: setting returnValue triggers the browser dialog.
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------- Formatting toolbar ----------
  function initToolbar() {
    const toolbar = document.querySelector('.answer-composer__toolbar');
    if (!toolbar || !textarea) return;
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;
      e.preventDefault();
      const fmt = btn.dataset.format;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = textarea.value.slice(start, end) || 'text';
      let wrapped = '';
      if (fmt === 'bold') wrapped = '**' + selected + '**';
      else if (fmt === 'italic') wrapped = '_' + selected + '_';
      else if (fmt === 'list') wrapped = '- ' + selected.split('\n').join('\n- ');
      textarea.setRangeText(wrapped, start, end, 'end');
      textarea.focus();
    });
  }

  // ---------- Load context header ----------
  async function loadContext() {
    if (!contextEl) return;
    contextEl.innerHTML = '<p class="question-detail__status">Loading question…</p>';
    try {
      const data = await window.OlongNotes.api.get('/questions/' + questionId);
      const q = data && data.question;
      if (!q) {
        contextEl.innerHTML = '<p class="question-detail__status">Question not found.</p>';
        return;
      }
      const subjectName = (q.subjects && q.subjects.subject_name) || 'General';
      const bucket = bucketForGrade(q.grade_level);
      contextEl.innerHTML =
        '<p class="answer-context__label">You are answering</p>' +
        '<p class="answer-context__title">' + esc(q.title || '') + '</p>' +
        '<div class="answer-context__pills">' +
          '<span class="answer-context__pill answer-context__pill--subject">' + esc(subjectName) + '</span>' +
          '<span class="answer-context__pill answer-context__pill--' + bucket + '">' + esc(BUCKET_LABEL[bucket] || 'All Levels') + '</span>' +
        '</div>';
    } catch (err) {
      console.error('[answer-page] context load failed:', err);
      contextEl.innerHTML = '<p class="question-detail__status">Could not load the question.</p>';
    }
  }

  // Bucket helpers (mirror browse-community.js so pills stay consistent)
  const GRADE_BUCKET = [
    { bucket: 'k10',         matches: ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'] },
    { bucket: 'senior_high', matches: ['Grade 11', 'Grade 12', '1st Year Senior High', '2nd Year Senior High'] },
    { bucket: 'college',     matches: ['1st Year', '2nd Year', '3rd Year', '4th Year', '4th Year College', '5th Year', 'College'] },
  ];
  const BUCKET_LABEL = { k10: 'K-10', senior_high: 'SHS', college: 'College' };
  function bucketForGrade(gradeLevel) {
    if (!gradeLevel) return 'k10';
    const g = String(gradeLevel);
    for (const b of GRADE_BUCKET) {
      if (b.matches.includes(g)) return b.bucket;
    }
    return 'k10';
  }

  // ---------- Post answer ----------
  async function postAnswer() {
    if (!isAuthed()) {
      window.location.href = 'index.html?auth=signup';
      return;
    }
    const content = textarea ? textarea.value.trim() : '';
    if (!content) {
      if (errorEl) {
        errorEl.textContent = 'Please write an answer before posting.';
        errorEl.hidden = false;
      }
      if (textarea) textarea.focus();
      return;
    }
    if (content.length > 5000) {
      if (errorEl) {
        errorEl.textContent = 'Answer too long. Max 5000 characters.';
        errorEl.hidden = false;
      }
      return;
    }

    const originalLabel = postBtn.textContent;
    postBtn.disabled = true;
    postBtn.textContent = 'Posting…';
    if (errorEl) errorEl.hidden = true;

    try {
      await window.OlongNotes.api.post('/questions/' + questionId + '/answer', { content }, { auth: true });
      // Success → land back on the question with the new answer visible.
      window.location.href = 'question.html?id=' + encodeURIComponent(questionId);
    } catch (err) {
      console.error('[answer-page] post failed:', err);
      if (errorEl) {
        errorEl.textContent = (err && err.message) || 'Could not post answer.';
        errorEl.hidden = false;
      }
      if (err && err.status === 401) {
        window.location.href = 'index.html?auth=signup';
        return;
      }
    } finally {
      postBtn.disabled = false;
      postBtn.textContent = originalLabel;
    }
  }

  // ---------- Boot ----------
  function init() {
    // Auth gate — anonymous users never see the composer.
    if (!isAuthed()) {
      window.location.href = 'index.html?auth=signup';
      return;
    }
    if (!questionId) {
      if (contextEl) contextEl.innerHTML = '<p class="question-detail__status">Missing question id.</p>';
      return;
    }

    initToolbar();
    loadContext();

    if (cancelBtn) cancelBtn.addEventListener('click', () => requestLeave('community.html'));
    if (backLink) backLink.addEventListener('click', (e) => {
      e.preventDefault();
      requestLeave('community.html');
    });
    if (postBtn) postBtn.addEventListener('click', postAnswer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

