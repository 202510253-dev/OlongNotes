// ===================== QUESTION DETAIL PAGE =====================
// question.html?id={question_id}
//
// Real, separate page for viewing a single question + its answers
// (Brainly-style). Reads the question id from the URL, fetches
// GET /api/questions/:id, and renders the full question, an
// "Answer" CTA (→ answer.html), and a read-only list of answers.
//
// Report buttons:
//   - Question Report → wired to POST /api/questions/:id/report (exists).
//   - Answer Report  → wired to POST /api/answers/:id/report (added in
//     routes/answers.js). Clicking opens a fixed 5-reason selector
//     (Inappropriate content / Copyrighted material / Incorrect
//     information / Spam or misleading / Other) via reportAnswer().

(function () {
  'use strict';

  const esc = (s) =>
    window.OlongNotes && window.OlongNotes.escapeHtml
      ? window.OlongNotes.escapeHtml(s)
      : String(s == null ? '' : s);

  // Local helpers (browse-community.js is feed-only; keep this page
  // self-contained rather than importing from another page's script).
  const initials = (name) => (name && name.trim ? name.trim().charAt(0).toUpperCase() : '?');

  // Shared avatar helper (js/avatar.js). Same fallback-as-no-op pattern
  // as browse-community.js — if avatar.js didn't load we still render
  // the colored initials / person-icon fallback via tintFor()+initials().
  const shared = (window.OlongNotes && window.OlongNotes.shared) || {};
  const renderAvatar = shared.renderAvatar || function (u, opts) {
    const name = (u && u.user_name) || '';
    const tint = (shared.tintFor && shared.tintFor(name)) || '#3d6bf0';
    const variant = (opts && opts.variant) || 'row';
    if (variant === 'comment') {
      return '<span class="comment-item__avatar" aria-hidden="true">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">' +
          '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5"/>' +
        '</svg></span>';
    }
    return '<span class="question-row__avatar" style="--avatar-tint:' + tint + '" aria-hidden="true">' +
           (name && name.trim ? name.trim().charAt(0).toUpperCase() : '?') +
           '</span>';
  };

  function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.max(1, Math.round((now - then) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const day = Math.round(hr / 24);
    if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString();
  }

  // Fixed set of reasons accepted when reporting an answer. Mirrors the
  // backend's ANSWER_REPORT_REASONS in routes/answers.js exactly — the
  // prompt() selector below indexes into this (1-based for users).
  const ANSWER_REPORT_REASONS = [
    'Inappropriate content',
    'Copyrighted material',
    'Incorrect information',
    'Spam or misleading',
    'Other',
  ];

  const TINT_PALETTE = ['#3d6bf0', '#e7833b', '#8b5cf6', '#2e9e5b', '#e0556f', '#e0b23c', '#0ea5e9', '#a855f7'];
  function tintFor(name) {
    if (!name) return '#3d6bf0';
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return TINT_PALETTE[h % TINT_PALETTE.length];
  }

  // Mirror the bucket definitions from browse-community.js so the
  // K-10 / SHS / College pill renders consistently.
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

  const root = document.getElementById('questionDetailRoot');

  function showStatus(message) {
    if (root) root.innerHTML = '<p class="question-detail__status">' + esc(message) + '</p>';
  }

  function reportIcon() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h3v-9h5l1.5 4H20l-2-7 2-7h-7L11.5 6H3Z"/></svg>';
  }

// ---------- Shared report modal (styled, mirrors document-viewer) ----------
  // Both Question Report and Answer Report open the same styled modal in
  // question.html. The modal collects a fixed 5-reason option (or a custom
  // "Other" reason), then POSTs to the relevant endpoint via submitFn.
  const reportState = {
    submitFn: null,   // async (reason) => posted once Done is clicked
    initialized: false,
    open: false,
    selectedReason: null,
  };

  function getReportModalRefs() {
    const m = document.getElementById('reportModal');
    if (!m) return null;
    return {
      reportModal: m,
      reportModalBackdrop: document.getElementById('reportModalBackdrop'),
      reportModalClose: document.getElementById('reportModalClose'),
      reportTitle: document.getElementById('reportModalTitle'),
      reportSubtitle: document.getElementById('reportModalSubtitle'),
      reportOptions: document.getElementById('reportOptions'),
      reportOtherSection: document.getElementById('reportOtherSection'),
      reportOtherInput: document.getElementById('reportOtherInput'),
      reportModalDone: document.getElementById('reportModalDone'),
    };
  }

  function updateReportDoneState(refs) {
    if (!refs || !refs.reportModalDone) return;
    if (!reportState.selectedReason) {
      refs.reportModalDone.disabled = true;
      return;
    }
    if (reportState.selectedReason === 'Other') {
      refs.reportModalDone.disabled = refs.reportOtherInput.value.trim() === '';
      return;
    }
    refs.reportModalDone.disabled = false;
  }

  function resetReportModal(refs) {
    reportState.selectedReason = null;
    refs.reportOptions.querySelectorAll('.report-option').forEach((el) => el.classList.remove('is-selected'));
    refs.reportOtherSection.hidden = true;
    refs.reportOtherInput.value = '';
    updateReportDoneState(refs);
  }

  function initReportModal(refs) {
    if (reportState.initialized) return;
    reportState.initialized = true;

    refs.reportModalBackdrop.addEventListener('click', () => {
      refs.reportModal.hidden = true;
      reportState.open = false;
    });
    refs.reportModalClose.addEventListener('click', () => {
      refs.reportModal.hidden = true;
      reportState.open = false;
    });
    refs.reportOptions.addEventListener('click', (e) => {
      const btn = e.target.closest('.report-option');
      if (!btn) return;
      refs.reportOptions.querySelectorAll('.report-option').forEach((el) => el.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      reportState.selectedReason = btn.dataset.reason;
      if (reportState.selectedReason === 'Other') {
        refs.reportOtherSection.hidden = false;
        refs.reportOtherInput.focus();
      } else {
        refs.reportOtherSection.hidden = true;
      }
      updateReportDoneState(refs);
    });
    refs.reportOtherInput.addEventListener('input', () => updateReportDoneState(refs));
    refs.reportModalDone.addEventListener('click', async () => {
      if (refs.reportModalDone.disabled || !reportState.submitFn) return;
      const reason = reportState.selectedReason === 'Other'
        ? refs.reportOtherInput.value.trim()
        : reportState.selectedReason;
      if (!reason) return;
      refs.reportModalDone.disabled = true;
      refs.reportModalDone.textContent = 'Submitting…';
      try {
        await reportState.submitFn(reason);
        refs.reportModal.hidden = true;
        reportState.open = false;
        showBanner('Report submitted. Our team will review it.', 'success');
      } catch (err) {
        showBanner((err && err.message) || 'Could not submit report.');
        refs.reportModalDone.disabled = false;
        refs.reportModalDone.textContent = 'Done';
      }
    });
  }

  function openReportModal({ title, subtitle, submitFn }) {
    if (!isAuthed()) {
      showBanner('Log in to report.');
      return;
    }
    const refs = getReportModalRefs();
    if (!refs) {
      showBanner('Reporting is not available on this page.');
      return;
    }
    initReportModal(refs);
    reportState.submitFn = submitFn;
    refs.reportTitle.textContent = title;
    refs.reportSubtitle.textContent = subtitle;
    resetReportModal(refs);
    refs.reportModalDone.disabled = true;
    refs.reportModalDone.textContent = 'Done';
    reportState.open = true;
    refs.reportModal.hidden = false;
  }

  function reportQuestion(questionId) {
    // POST /api/questions/:id/report — collect a fixed reason via the
    // styled modal, then submit { reason }.
    openReportModal({
      title: 'Report this question',
      subtitle: 'Let us know what\'s wrong. Your report is anonymous.',
      submitFn: (reason) => {
        return window.OlongNotes.api.post('/questions/' + questionId + '/report', { reason }, { auth: true });
      },
    });
  }

  // Report an answer. Mirrors reportQuestion()'s collection style (native
  // prompt) but uses the fixed 5-option ANSWER_REPORT_REASONS list so the
  // reason sent to POST /api/answers/:id/report is always one the backend
  // accepts (it validates against the same list). Loops until the user
  // picks a valid option (1..5) or cancels.
  function reportAnswer(answerId) {
    // POST /api/answers/:id/report — same styled modal; the reason is
    // validated server-side against the fixed ANSWER_REPORT_REASONS list.
    openReportModal({
      title: 'Report this answer',
      subtitle: 'Let us know what\'s wrong. Your report is anonymous.',
      submitFn: (reason) => {
        return window.OlongNotes.api.post('/answers/' + answerId + '/report', { reason }, { auth: true });
      },
    });
  }

  function isAuthed() {
    return !!(window.OlongNotes && window.OlongNotes.getToken && window.OlongNotes.getToken());
  }

  function showBanner(message, kind) {
    let host = document.getElementById('detailBanner');
    if (!host) {
      host = document.createElement('div');
      host.id = 'detailBanner';
      host.style.cssText =
        'padding:10px 14px;border-radius:8px;margin:0 0 14px 0;border-left:3px solid #e0556f;' +
        'font-size:14px;line-height:1.4;background:var(--surface-2,#f6f7fb);' +
        'border:1px solid var(--border-soft,#e3e7ef);color:var(--text,#222);';
      const grid = document.getElementById('questionDetailRoot');
      if (grid && grid.parentNode) {
        grid.parentNode.insertBefore(host, grid);
      }
    }
    host.style.borderLeftColor = kind === 'success' ? '#2e9e5b' : '#e0556f';
    host.textContent = message;
    host.hidden = false;
    clearTimeout(host._timer);
    host._timer = setTimeout(() => { host.hidden = true; }, 3500);
  }

function renderQuestionDetail(q) {
    const tint = tintFor(q.subjects && q.subjects.subject_name);
    const asker = (q.users && q.users.user_name) || 'Anonymous';
    const askerId = q.user_id || '';
    const subjectName = (q.subjects && q.subjects.subject_name) || 'General';
    const profileHref = askerId
      ? 'profile.html?user=' + encodeURIComponent(askerId)
      : 'profile.html';
    const statusBadge = q.status === 'answered'
      ? '<span class="status-badge status-badge--answered">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L19 7"/></svg>' +
          'Answered</span>'
      : '<span class="status-badge status-badge--unanswered">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>' +
          'Unanswered</span>';
    const bucket = bucketForGrade(q.grade_level);
    const bucketLabel = BUCKET_LABEL[bucket] || 'All Levels';
    const timeLabel = relativeTime(q.created_at);

    // Attached image — question rows currently have no image_url column,
    // but render it defensively if the API ever returns one.
    const attachment = q.image_url || q.attachment_url
      ? '<div class="question-attachment">' +
          '<img class="question-attachment__img" src="' + esc(q.image_url || q.attachment_url) + '" alt="Attached image" />' +
        '</div>'
      : '';

    // Report button on the question (wired to the existing endpoint).
    const qReport = '<button class="report-btn" type="button" data-report-question="' + esc(q.id) + '">' + reportIcon() + ' Report</button>';

    // BATCH B — Asker question-menu (three-dot: Edit / Delete). Shown ONLY
    // to the asker themselves (server-provided viewer_is_asker) or an
    // admin. Regular viewers / commenters / other logged-in users never
    // see this menu — the kebab is the only path to destructive actions
    // on the question, and it must be asker-only.
    //
    // Defensive double-check: even if the server-side flag is stale or
    // missing, we also compare the localStorage user id against the
    // question's user_id so a viewer can never render the Edit/Delete
    // controls on someone else's question.
    const cachedUser = (() => {
      try { return JSON.parse(localStorage.getItem('olongnotes_user') || 'null'); }
      catch (_) { return null; }
    })();
    const cachedUserId = cachedUser && (cachedUser.id || cachedUser.user_id);
    const askerIsAdmin = Boolean(cachedUser && cachedUser.role === 'admin');
    const askerIsViewer = Boolean(q.viewer_is_asker)
      || (cachedUserId && String(cachedUserId) === String(askerId));
    const canManageQuestion = askerIsViewer || askerIsAdmin;
    const askerMenu = canManageQuestion
      ? '<div class="kebab" data-kebab="question">' +
          '<button class="kebab__btn" type="button" aria-label="Question options" aria-haspopup="true" aria-expanded="false">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>' +
          '</button>' +
          '<div class="kebab__menu" hidden>' +
            '<button class="kebab__item" type="button" data-edit-question="' + esc(q.id) + '">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
              ' Edit' +
            '</button>' +
            '<button class="kebab__item kebab__item--danger" type="button" data-delete-question="' + esc(q.id) + '">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>' +
              ' Delete' +
            '</button>' +
          '</div>' +
        '</div>'
      : '';

    // BATCH B — Only show the "Answer" CTA if the viewer is NOT the asker.
    // (They can't answer their own question — backend + answer.html both
    // block it, so hide the pointless button here too.)
    const answerCta = !Boolean(q.viewer_is_asker)
      ? '<a class="btn btn--accent-blue" href="answer.html?id=' + encodeURIComponent(q.id) + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
          ' Answer' +
        '</a>'
      : '';

    const answersHtml = (q.answers || []).map((a) => renderAnswer(a, tint, q)).join('');

    // Left column: the question card + answers
    const main =
      '<div class="question-modal__main">' +
        '<div class="modal-question">' +
          '<div class="question-row__top">' +
            '<span class="question-row__meta-line">' +
              '<span class="question-row__subject" style="--subject-tint:' + tint + '">' + esc(subjectName) + '</span>' +
              '<span class="question-row__dot">&middot;</span>' +
              '<span class="question-row__time">' + esc(timeLabel) + '</span>' +
              '<span class="question-row__curriculum question-row__curriculum--' + bucket + '">' + esc(bucketLabel) + '</span>' +
            '</span>' +
            '<span class="question-row__top-right">' +
              statusBadge +
              askerMenu +
            '</span>' +
          '</div>' +

          '<div class="modal-question__head">' +
            renderAvatar(q.users, { variant: 'row', tint: tint }) +
            '<div>' +
              '<div class="question-detail__asker-row">' +
                '<span class="question-detail__asker-label">Asked by</span>' +
                '<a class="profile-link" href="' + profileHref + '">' + esc(asker) + '</a>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<p class="question-row__text">' + esc(q.title || '') + '</p>' +
          '<p class="question-row__desc">' + esc(q.body || '') + '</p>' +

          ((q.tags && q.tags.length) ? '<div class="question-row__tags">' +
            q.tags.map((t) => '<span class="tag tag--hash" style="--tag-tint:' + tint + '">#' + esc(t) + '</span>').join('') +
          '</div>' : '') +

          attachment +

          '<div class="question-detail__actions">' +
            answerCta +
            qReport +
          '</div>' +
        '</div>' +

        '<div class="modal-comments">' +
          '<div class="modal-comments__head">' +
            '<h2 class="modal-comments__title">Answers (' + ((q.answers || []).length) + ')</h2>' +
          '</div>' +
          '<ul class="comment-list">' + (answersHtml || '<p class="question-detail__status">No answers yet. Be the first to answer!</p>') + '</ul>' +
        '</div>' +
      '</div>';

    // Right column: Answer prompt sidebar (no composer here — that's answer.html).
    // Hidden entirely for the asker of the question.
    const side = Boolean(q.viewer_is_asker)
      ? '<aside class="answer-prompt">' +
          '<span class="answer-prompt__icon" aria-hidden="true">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
          '</span>' +
          '<h3 class="answer-prompt__title">This is your question</h3>' +
          '<p class="answer-prompt__text">You can edit or delete it using the menu above.</p>' +
        '</aside>'
      : '<aside class="answer-prompt">' +
          '<span class="answer-prompt__icon" aria-hidden="true">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
          '</span>' +
          '<h3 class="answer-prompt__title">Know the answer?</h3>' +
          '<p class="answer-prompt__text">Share your knowledge and help this learner.</p>' +
          '<a class="btn btn--accent-blue" style="width:100%" href="answer.html?id=' + encodeURIComponent(q.id) + '">Answer this question</a>' +
        '</aside>';

    return main + side;
  }

  function renderAnswer(a, tint, q) {
    const answererName = (a.users && a.users.user_name) || 'Anonymous';
    const answererId = a.user_id || '';
    const profileHref = answererId
      ? 'profile.html?user=' + encodeURIComponent(answererId)
      : 'profile.html';
    const accepted = a.is_accepted
      ? '<span class="badge-contributor">Accepted</span>'
      : '';

    // BATCH B — Answer asker-menu (Right Answer!). Shown only when the
    // logged-in user is the asker (viewer_is_asker) AND the question is
    // still unanswered AND this specific answer isn't already accepted.
    const canAccept = Boolean(q.viewer_is_asker) &&
      String(q.status) === 'unanswered' &&
      !a.is_accepted;
    const answerMenu = canAccept
      ? '<div class="kebab" data-kebab="answer">' +
          '<button class="kebab__btn" type="button" aria-label="Answer options" aria-haspopup="true" aria-expanded="false">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>' +
          '</button>' +
          '<div class="kebab__menu" hidden>' +
            '<button class="kebab__item" type="button" data-accept-answer="' + esc(a.id) + '" data-question="' + esc((q && q.id)) + '">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>' +
              ' Right Answer!' +
            '</button>' +
          '</div>' +
        '</div>'
      : '';

    // REPORT (ANSWER): wired to POST /api/answers/:id/report (now exists
    // in routes/answers.js). Clicking opens a fixed 5-reason selector via
    // reportAnswer() — reason is validated server-side against the same list.
    const answerReport =
      '<button class="report-btn" type="button" data-report-answer="' + esc(a.id) + '" title="Report this answer">' +
        reportIcon() + ' Report' +
      '</button>';

    return (
      '<li class="comment-item" data-answer-id="' + esc(a.id) + '">' +
        renderAvatar(a.users, { variant: 'comment' }) +
        '<div class="comment-item__body">' +
          '<div class="comment-item__head">' +
            '<span class="comment-item__name"><a href="' + profileHref + '">' + esc(answererName) + '</a></span>' +
            accepted +
            '<span class="comment-item__time">' + esc(relativeTime(a.created_at)) + '</span>' +
            answerMenu +
          '</div>' +
'<div class="comment-item__text">' + esc(a.content || '') + '</div>' +
          '<div class="comment-item__footer">' +
            '<button class="answer-like-count" type="button" data-answer-like="' + esc(a.id) + '" data-count="' + esc(a.likes_count || 0) + '" aria-pressed="false">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-8a2 2 0 0 1 3.6 1.2L14.5 8H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 19H10a3 3 0 0 1-3-3v-5Z"/></svg>' +
              '<span class="answer-like-btn__count">' + esc(a.likes_count || 0) + '</span>' +
            '</button>' +
            answerReport +
          '</div>' +
        '</div>' +
      '</li>'
    );
  }

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      showStatus('Missing question id. Go back to the <a href="community.html">questions</a>.');
      return;
    }

    showStatus('Loading question…');
    try {
// auth:true attaches the JWT (if present) to the request. The
      // backend uses it to compute viewer_is_asker / viewer_has_liked,
      // which gate the asker-only controls (Edit/Delete/Right Answer!).
      // For anonymous viewers no token exists, so nothing is attached and
      // the request proceeds as a normal public read.
      const data = await window.OlongNotes.api.get('/questions/' + id, { auth: true });
      const q = data && data.question;
      if (!q) {
        showStatus('Question not found.');
        return;
      }
      document.title = (q.title || 'Question') + ' - OlongNotes';
      // Track the live question so the asker menus (edit/delete/accept)
      // read the latest values.
      currentQuestion = q;
      if (root) root.innerHTML = renderQuestionDetail(q);
      wireEvents();
    } catch (err) {
      console.error('[question-detail] load failed:', err);
      showStatus('Could not load this question. Please try again.');
    }
  }

  // ---------- BATCH B: shared kebab-menu open/close ----------
  function closeAllKebabs() {
    document.querySelectorAll('.kebab__menu').forEach((m) => {
      m.hidden = true;
      const btn = m.closest('.kebab') && m.closest('.kebab').querySelector('.kebab__btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleKebab(trigger) {
    const kebab = trigger.closest('.kebab');
    if (!kebab) return;
    const menu = kebab.querySelector('.kebab__menu');
    if (!menu) return;
    const willOpen = menu.hidden;
    closeAllKebabs();
    if (willOpen) {
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }
  }

  // ---------- BATCH B: current question state for asker actions ----------
  let currentQuestion = null; // set after load, used by edit/delete/accept

  // Delete confirm dialog (native confirm — matches existing report pattern).
  async function deleteQuestion(questionId) {
    if (!window.confirm('Delete this question? This cannot be undone.')) return;
    try {
      await window.OlongNotes.api.delete('/questions/' + questionId, { auth: true });
      showBanner('Question deleted.', 'success');
      // Redirect back to the feed after a short pause so the banner is seen.
      setTimeout(() => { window.location.href = 'community.html'; }, 700);
    } catch (err) {
      showBanner((err && err.message) || 'Could not delete question.');
    }
  }

  // ---------- BATCH B: Edit modal ----------
  // Edit is exclusively for correcting typos/inaccuracies in the question
  // content. Per the approved scope we only edit title + body (no subject
  // dropdown, no subject_id in the PATCH payload) — nothing to cascade.
  function buildEditModal() {
    if (!currentQuestion) return;
    const titleVal = currentQuestion.title || '';
    const bodyVal = currentQuestion.body || '';

    let host = document.getElementById('editModal');
    if (!host) {
      host = document.createElement('div');
      host.id = 'editModal';
      host.className = 'ask-modal';
      host.setAttribute('aria-hidden', 'true');
      host.innerHTML =
        '<div class="ask-modal__backdrop" id="editModalBackdrop"></div>' +
        '<div class="ask-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="editModalTitle">' +
          '<button class="ask-modal__close" type="button" id="editModalClose" aria-label="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
          '</button>' +
          '<div class="ask-modal__head">' +
            '<span class="ask-modal__avatar" aria-hidden="true">' + esc(initials(askerName())) + '</span>' +
            '<div class="ask-modal__head-text">' +
              '<span class="ask-modal__asker">' + esc(askerName()) + '</span>' +
              '<h2 class="ask-modal__title" id="editModalTitle">Edit Question</h2>' +
            '</div>' +
          '</div>' +
          '<div class="ask-modal__body">' +
            '<div class="ask-field">' +
              '<label class="ask-field__label" for="editTitleInput">Title</label>' +
              '<input class="ask-input" id="editTitleInput" type="text" maxlength="140" />' +
            '</div>' +
            '<div class="ask-textarea-wrap">' +
              '<textarea id="editBodyTextarea" maxlength="2000" placeholder="Question details…"></textarea>' +
            '</div>' +
            '<p class="ask-modal__error" id="editModalError" hidden></p>' +
            '<div class="ask-attach">' +
              '<span class="ask-attach__label">Editing your question</span>' +
              '<button class="ask-attach__btn ask-attach__btn--post" type="button" id="editSaveBtn">Save Changes</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(host);

      host.querySelector('#editModalBackdrop').addEventListener('click', closeEditModal);
      host.querySelector('#editModalClose').addEventListener('click', closeEditModal);
      host.querySelector('#editSaveBtn').addEventListener('click', saveEdit);
      host.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && host.classList.contains('is-open')) closeEditModal();
      });
    }

    // Pre-fill with current values each time it opens.
    host.querySelector('#editTitleInput').value = titleVal;
    host.querySelector('#editBodyTextarea').value = bodyVal;
    const err = host.querySelector('#editModalError');
    if (err) err.hidden = true;
    host.classList.add('is-open');
    host.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const t = host.querySelector('#editTitleInput'); if (t) t.focus(); }, 30);
  }

  function askerName() {
    return (currentQuestion && currentQuestion.users && currentQuestion.users.user_name) || 'You';
  }

  function closeEditModal() {
    const host = document.getElementById('editModal');
    if (host) {
      host.classList.remove('is-open');
      host.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }

  async function saveEdit() {
    if (!currentQuestion) return;
    const host = document.getElementById('editModal');
    const titleInput = host && host.querySelector('#editTitleInput');
    const bodyTextarea = host && host.querySelector('#editBodyTextarea');
    const err = host && host.querySelector('#editModalError');

    const title = titleInput ? titleInput.value.trim() : '';
    const body = bodyTextarea ? bodyTextarea.value.trim() : '';
    if (!body) {
      if (err) { err.textContent = 'Question body cannot be empty.'; err.hidden = false; }
      if (bodyTextarea) bodyTextarea.focus();
      return;
    }

    const saveBtn = host && host.querySelector('#editSaveBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
    }

    try {
      // Edit only touches title + body (no subject_id — approved scope).
      const payload = {};
      if (title) payload.title = title;
      payload.body = body;
      await window.OlongNotes.api.patch('/questions/' + currentQuestion.id, payload, { auth: true });
      closeEditModal();
      showBanner('Question updated.', 'success');
      // Reload so the edited content persists visibly on screen.
      load();
    } catch (err) {
      console.error('[question-detail] edit failed:', err);
      if (err && err.status === 403) {
        showBanner('You can only edit your own questions.');
      } else {
        showBanner((err && err.message) || 'Could not update question.');
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    }
  }

// ---------- Answer like (thumb-up) ----------
  // Mirrors the document-viewer.js note-like pattern: optimistic toggle
  // on click, then write back the server's authoritative likes_count once
  // POST /api/answers/:id/like resolves. The endpoint returns
  // { liked, likes_count } (toggleQuestionInteraction in routes/questions
  // / answers). Strict null check so a genuine 0 isn't clobbered.
  async function toggleAnswerLike(answerId, btn) {
    if (!isAuthed()) {
      showBanner('Log in to like answers.');
      return;
    }
    const base = parseInt(btn.dataset.count, 10) || 0;
    const wasLiked = btn.getAttribute('aria-pressed') === 'true';
    const countEl = btn.querySelector('.answer-like-btn__count');

    // Optimistic UI.
    btn.setAttribute('aria-pressed', String(!wasLiked));
    btn.classList.toggle('is-liked', !wasLiked);
    const optimistic = wasLiked ? Math.max(0, base - 1) : base + 1;
    if (countEl) countEl.textContent = String(optimistic);
    btn.dataset.count = String(optimistic);

    try {
      const res = await window.OlongNotes.api.post('/answers/' + answerId + '/like', null, { auth: true });
      // Server value is authoritative — don't fall back to the optimistic
      // value, because removing the last like genuinely drops to 0.
      const serverCount = (res && typeof res.likes_count === 'number')
        ? res.likes_count
        : null;
      if (serverCount !== null) {
        btn.dataset.count = String(serverCount);
        if (countEl) countEl.textContent = String(serverCount);
      }
      // Keep aria-pressed in sync with the server's `liked` flag when
      // present (source of truth for this click).
      if (res && typeof res.liked === 'boolean') {
        btn.setAttribute('aria-pressed', String(res.liked));
        btn.classList.toggle('is-liked', res.liked);
      }
    } catch (err) {
      // Roll back the optimistic update.
      btn.setAttribute('aria-pressed', String(wasLiked));
      btn.classList.toggle('is-liked', wasLiked);
      btn.dataset.count = String(base);
      if (countEl) countEl.textContent = String(base);
      if (err && err.status === 401) {
        showBanner('Your session expired. Please log in again.');
      } else {
        showBanner((err && err.message) || 'Could not update like. Please try again.');
      }
    }
  }

  // ---------- BATCH B: accept answer ("Right Answer!") ----------
  async function acceptAnswer(answerId, questionId) {
    try {
      await window.OlongNotes.api.post('/questions/' + questionId + '/accept', { answer_id: parseInt(answerId, 10) }, { auth: true });
      // On success, update the UI without a full reload:
      //  - mark THIS answer as accepted (badge + style),
      //  - hide the accept (Right Answer!) menu on ALL other answers,
      //  - flip the question's status badge from Unanswered → Answered.
      const newQ = currentQuestion ? Object.assign({}, currentQuestion) : {};
      newQ.status = 'answered';
      newQ.answers = (newQ.answers || []).map((a) => Object.assign({}, a, { is_accepted: a.id === parseInt(answerId, 10) }));
      currentQuestion = newQ;

      // Flip the status badge in place.
      const badge = root && root.querySelector('.status-badge');
      if (badge) {
        badge.outerHTML =
          '<span class="status-badge status-badge--answered">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L19 7"/></svg>' +
            'Answered</span>';
      }

      // Remove the "Right Answer!" kebab from every answer that isn't the
      // accepted one, and add the Accepted badge to the accepted answer.
      const items = root.querySelectorAll('.comment-item');
      items.forEach((li) => {
        const aId = parseInt(li.getAttribute('data-answer-id'), 10);
        const isThis = aId === parseInt(answerId, 10);
        const it = li.querySelector('.kebab');
        if (isThis) {
          if (it) it.remove();
          // Add the Accepted badge if not already there.
          const head = li.querySelector('.comment-item__head');
          if (head && !li.querySelector('.badge-contributor')) {
            head.insertAdjacentHTML('afterbegin', '<span class="badge-contributor">Accepted</span>');
          }
          li.classList.add('comment-item--accepted');
        } else {
          if (it) it.remove();
        }
      });

      showBanner('Marked as the right answer!', 'success');
    } catch (err) {
      console.error('[question-detail] accept failed:', err);
      if (err && err.status === 403) {
        showBanner('Only the asker can accept an answer.');
      } else {
        showBanner((err && err.message) || 'Could not accept answer.');
      }
    }
  }

  function wireEvents() {
    root.addEventListener('click', (e) => {
      // Report question
      const qBtn = e.target.closest('[data-report-question]');
      if (qBtn) {
        e.preventDefault();
        reportQuestion(qBtn.getAttribute('data-report-question'));
        return;
      }
      // Report answer — POST /api/answers/:id/report (fixed 5-reason list)
      const aBtn = e.target.closest('[data-report-answer]');
      if (aBtn) {
        e.preventDefault();
        reportAnswer(aBtn.getAttribute('data-report-answer'));
        return;
      }
      // Answer like (thumb-up) — delegated; toggles POST /api/answers/:id/like
      // and writes the server's count back into the DOM.
      const likeBtn = e.target.closest('[data-answer-like]');
      if (likeBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleAnswerLike(likeBtn.getAttribute('data-answer-like'), likeBtn);
        return;
      }
      // Kebab toggle (question + answer) — stop propagation so a click on
      // the menu button doesn't bubble to anything else.
      const kebBtn = e.target.closest('.kebab__btn');
      if (kebBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleKebab(kebBtn);
        return;
      }
      // Edit question
      const editBtn = e.target.closest('[data-edit-question]');
      if (editBtn) {
        e.preventDefault();
        closeAllKebabs();
        buildEditModal();
        return;
      }
      // Delete question
      const delBtn = e.target.closest('[data-delete-question]');
      if (delBtn) {
        e.preventDefault();
        closeAllKebabs();
        deleteQuestion(delBtn.getAttribute('data-delete-question'));
        return;
      }
      // Accept answer ("Right Answer!")
      const accBtn = e.target.closest('[data-accept-answer]');
      if (accBtn) {
        e.preventDefault();
        closeAllKebabs();
        acceptAnswer(
          accBtn.getAttribute('data-accept-answer'),
          accBtn.getAttribute('data-question')
        );
        return;
      }
      // Clicking anywhere else closes all open kebabs.
      closeAllKebabs();
    });
  }

  // `currentQuestion` is declared above (let currentQuestion = null) and
  // set inside load() on a successful fetch. Boot below.

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();

