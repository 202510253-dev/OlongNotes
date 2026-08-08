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
//   - Answer Report  → NO answers-report endpoint exists in
//     routes/answers.js (verified) — left visually present but INERT
//     with a TODO below. Do not fabricate an endpoint call.

(function () {
  'use strict';

  const esc = (s) =>
    window.OlongNotes && window.OlongNotes.escapeHtml
      ? window.OlongNotes.escapeHtml(s)
      : String(s == null ? '' : s);

  // Local helpers (browse-community.js is feed-only; keep this page
  // self-contained rather than importing from another page's script).
  const initials = (name) => (name && name.trim ? name.trim().charAt(0).toUpperCase() : '?');

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

  async function reportQuestion(questionId) {
    // POST /api/questions/:id/report exists in routes/questions.js and
    // requires a `reason`. We don't have a reason-prompt UI wired, so
    // this is intentionally a lightweight hook — the button currently
    // surfaces a confirmation banner. To fully wire it, collect a
    // reason from the user and POST { reason }.
    try {
      if (!isAuthed()) {
        showBanner('Log in to report a question.');
        return;
      }
      const reason = prompt('Please tell us why you are reporting this question:');
      if (!reason) return; // cancelled
      await window.OlongNotes.api.post('/questions/' + questionId + '/report', { reason }, { auth: true });
      showBanner('Report submitted. Our team will review it.', 'success');
    } catch (err) {
      showBanner((err && err.message) || 'Could not submit report.');
    }
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

    const answersHtml = (q.answers || []).map((a) => renderAnswer(a, tint)).join('');

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
            statusBadge +
          '</div>' +

          '<div class="modal-question__head">' +
            '<span class="question-row__avatar" style="--avatar-tint:' + tint + '" aria-hidden="true">' + esc(initials(asker)) + '</span>' +
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
            '<a class="btn btn--accent-blue" href="answer.html?id=' + encodeURIComponent(q.id) + '">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
              ' Answer' +
            '</a>' +
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

    // Right column: Answer prompt sidebar (no composer here — that's answer.html)
    const side =
      '<aside class="answer-prompt">' +
        '<span class="answer-prompt__icon" aria-hidden="true">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
        '</span>' +
        '<h3 class="answer-prompt__title">Know the answer?</h3>' +
        '<p class="answer-prompt__text">Share your knowledge and help this learner.</p>' +
        '<a class="btn btn--accent-blue" style="width:100%" href="answer.html?id=' + encodeURIComponent(q.id) + '">Answer this question</a>' +
      '</aside>';

    return main + side;
  }

  function renderAnswer(a, tint) {
    const answererName = (a.users && a.users.user_name) || 'Anonymous';
    const answererId = a.user_id || '';
    const profileHref = answererId
      ? 'profile.html?user=' + encodeURIComponent(answererId)
      : 'profile.html';
    const accepted = a.is_accepted
      ? '<span class="badge-contributor">Accepted</span>'
      : '';

    // REPORT (ANSWER): no endpoint exists for answers in the backend
    // (routes/answers.js has like + delete only, verified). Left as a
    // visual-only button. TODO: wire to POST /api/answers/:id/report
    // once that endpoint exists — do not fabricate the call.
    const answerReport =
      '<button class="report-btn" type="button" data-report-answer="' + esc(a.id) + '" title="Report (coming soon)">' +
        reportIcon() + ' Report' +
      '</button>';

    return (
      '<li class="comment-item">' +
        '<span class="comment-item__avatar" aria-hidden="true">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5"/></svg>' +
        '</span>' +
        '<div class="comment-item__body">' +
          '<div class="comment-item__head">' +
            '<span class="comment-item__name"><a href="' + profileHref + '">' + esc(answererName) + '</a></span>' +
            accepted +
            '<span class="comment-item__time">' + esc(relativeTime(a.created_at)) + '</span>' +
          '</div>' +
          '<div class="comment-item__text">' + esc(a.content || '') + '</div>' +
          '<div class="comment-item__footer">' +
            '<span class="answer-like-count">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-8a2 2 0 0 1 3.6 1.2L14.5 8H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 19H10a3 3 0 0 1-3-3v-5Z"/></svg>' +
              '<span class="answer-like-btn__count">' + esc(a.likes_count || 0) + '</span>' +
            '</span>' +
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
      const data = await window.OlongNotes.api.get('/questions/' + id);
      const q = data && data.question;
      if (!q) {
        showStatus('Question not found.');
        return;
      }
      document.title = (q.title || 'Question') + ' - OlongNotes';
      if (root) root.innerHTML = renderQuestionDetail(q);
      wireEvents();
    } catch (err) {
      console.error('[question-detail] load failed:', err);
      showStatus('Could not load this question. Please try again.');
    }
  }

  function wireEvents() {
    root.addEventListener('click', (e) => {
      const qBtn = e.target.closest('[data-report-question]');
      if (qBtn) {
        e.preventDefault();
        reportQuestion(qBtn.getAttribute('data-report-question'));
        return;
      }
      const aBtn = e.target.closest('[data-report-answer]');
      if (aBtn) {
        // Inert on purpose — no answers-report endpoint exists yet.
        // TODO: hook POST /api/answers/:id/report when it lands.
        e.preventDefault();
        showBanner('Answer reporting is coming soon.', 'success');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();

