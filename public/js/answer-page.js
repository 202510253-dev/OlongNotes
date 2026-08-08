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
// - FIX 3c: if the logged-in user is the question's asker, the composer
//   is disabled and a notice is shown — you can't answer your own
//   question (the backend also enforces this).
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

  // ---------- Auth helpers ----------
  function isAuthed() {
    return !!(window.OlongNotes && window.OlongNotes.getToken && window.OlongNotes.getToken());
  }

  // Best-effort current-user id from the cached profile, if the login
  // flow stored it. Used only for the "can't answer your own question"
  // gate; if we can't read it we simply don't block (backend still does).
  function currentUserId() {
    try {
      const raw = localStorage.getItem('olongnotes_user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u && (u.id || u.user_id)) return u.id || u.user_id;
      }
    } catch (_err) { /* ignore */ }
    return null;
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
  //
  // We keep a named reference so we can REMOVE this listener before the
  // app's own post-success redirect (Bug 2). The guard should only fire
  // for an accidental navigate-away with unsaved text — never for the
  // redirect that happens after a successful post.
  function onBeforeUnload(e) {
    if (hasUnsavedText()) {
      // Standard: setting returnValue triggers the browser dialog.
      e.preventDefault();
      e.returnValue = '';
    }
  }
  window.addEventListener('beforeunload', onBeforeUnload);

  // Call this once a post succeeds (or the composer is otherwise done)
  // so the "Leave site?" prompt never blocks the app's own redirect.
  function disarmBeforeUnload() {
    window.removeEventListener('beforeunload', onBeforeUnload);
  }

  // ---------- Formatting toolbar (shared module) ----------
  // The selection-wrap logic lives in js/toolbar.js so the Answer page
  // and the Ask-question modal (browse-community.js) behave the same.
  function initToolbar() {
    const toolbar = document.querySelector('.answer-composer__toolbar');
    if (!toolbar || !textarea) return;
    window.OlongNotesToolbar && window.OlongNotesToolbar.init(toolbar, textarea);
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

      // FIX 3c: you can't answer your own question. The backend enforces
      // this too, but disable the composer up-front for better UX.
      const uid = currentUserId();
      if (uid != null && q.user_id != null && String(uid) === String(q.user_id)) {
        blockComposer("You can't answer your own question.");
      }
    } catch (err) {
      console.error('[answer-page] context load failed:', err);
      contextEl.innerHTML = '<p class="question-detail__status">Could not load the question.</p>';
    }
  }

  // Disable the composer and show a clear notice.
  function blockComposer(message) {
    if (textarea) textarea.disabled = true;
    if (postBtn) postBtn.disabled = true;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
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
  // `posting` is an in-flight flag that guards against double submission
  // (Bug 1). The button's `disabled` attribute is also toggled for
  // visual feedback, but the flag is the authoritative re-entry guard so
  // a second click can't fire a second POST even if the disabled state
  // hasn't visually landed in time.
  let posting = false;

  async function postAnswer() {
    if (posting) return; // already a request in flight — drop the click
    if (!isAuthed()) {
      window.location.href = 'index.html?auth=signup';
      return;
    }
    if (textarea && textarea.disabled) return; // blocked (own question)
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
    posting = true;
    postBtn.disabled = true;
    postBtn.textContent = 'Posting…';
    if (errorEl) errorEl.hidden = true;

    try {
      await window.OlongNotes.api.post('/questions/' + questionId + '/answer', { content }, { auth: true });
      // Success. Remove the beforeunload guard AND clear the textarea so
      // the app's own redirect to question.html never triggers "Leave
      // site?" (Bug 2). Do this before navigating away.
      disarmBeforeUnload();
      if (textarea) textarea.value = '';
      window.location.href = 'question.html?id=' + encodeURIComponent(questionId);
    } catch (err) {
      console.error('[answer-page] post failed:', err);
      if (errorEl) {
        if (err && err.status === 403 && /own question/i.test((err && err.message) || '')) {
          errorEl.textContent = (err && err.message) || "You can't answer your own question.";
          blockComposer('You can only answer questions from other students.');
        } else {
          errorEl.textContent = (err && err.message) || 'Could not post answer.';
        }
        errorEl.hidden = false;
      }
      if (err && err.status === 401) {
        disarmBeforeUnload();
        window.location.href = 'index.html?auth=signup';
        return;
      }
    } finally {
      // Only reset the button if we're not navigating away. On success we
      // set location.href, so resetting is harmless; on error we must
      // re-enable so the user can retry.
      posting = false;
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

