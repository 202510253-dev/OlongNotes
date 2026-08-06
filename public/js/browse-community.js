/* ---------------------------------------------------------
   BROWSE / COMMUNITY HUB — live Q&A wiring
   Phase 4 (Q&A). All question/answer data is sourced live from
   the backend (no frontend mock): /api/questions, /api/questions/:id,
   /api/questions/:id/like, /api/questions/:id/answer,
   /api/questions/:id/accept, /api/answers/:id/like.
--------------------------------------------------------- */
(function () {
  'use strict';

  // ---------- Configuration ----------
  const PAGE_LIMIT = 20;
  const GRADE_VALUES = ['9', '10', '11', '12']; // matches dropdown markup in HTML

  // Inline auth-state helpers — reuses the same JWT shape used elsewhere.
  function getToken() {
    return window.OlongNotes && window.OlongNotes.getToken
      ? window.OlongNotes.getToken()
      : null;
  }
  function isAuthed() {
    return Boolean(getToken());
  }

  // ---------- State ----------
  // filterState mirrors what the DOM dropdowns hold. page is the current
  // 1-based page; hasMore drives the "Load more" button visibility. openId
  // tracks which question (if any) is expanded in the detail modal.
  const filterState = {
    status: 'all',    // all | unanswered | answered | my_questions
    grade: 'all',
    subject: 'all',
    sort: 'latest',   // latest | oldest | most-liked | most-answers
    page: 1,
    hasMore: false,
    total: 0,
  };
  let openId = null;

  // ---------- Subject tints (mirror subjects.js palette, deterministic) ----------
  // The backend doesn't expose a tint column on subjects (per Phase 6
  // mapping notes), so we drive tints client-side from a stable hash of
  // the subject name. Keeps the card visual consistent.
  const TINT_PALETTE = ['#3d6bf0', '#e7833b', '#8b5cf6', '#2e9e5b', '#e0556f', '#e0b23c', '#0ea5e9', '#a855f7'];
  function tintFor(name) {
    if (!name) return '#3d6bf0';
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return TINT_PALETTE[h % TINT_PALETTE.length];
  }

  // ---------- HTML utilities ----------
  const esc = (s) => window.OlongNotes && window.OlongNotes.escapeHtml
    ? window.OlongNotes.escapeHtml(s)
    : String(s == null ? '' : s);
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

  // ---------- API helpers ----------
  // buildListQuery — translates filterState into an /api/questions
  // querystring. tab beats status, status wins when there's no tab.
  function buildListQuery() {
    const q = new URLSearchParams();
    q.set('limit', String(PAGE_LIMIT));
    q.set('offset', String((filterState.page - 1) * PAGE_LIMIT));

    if (filterState.grade !== 'all') q.set('grade_level', filterState.grade);
    if (filterState.subject !== 'all') q.set('subject_id', filterState.subject); // subject is the id here

    if (filterState.status === 'my_questions') {
      q.set('tab', 'my_questions');
    } else if (filterState.status === 'unanswered' || filterState.status === 'answered') {
      q.set('status', filterState.status);
    }

    return q.toString();
  }

  async function fetchQuestions() {
    const qs = buildListQuery();
    return window.OlongNotes.api.get('/questions?' + qs);
  }

  async function fetchQuestionDetail(id) {
    return window.OlongNotes.api.get('/questions/' + id);
  }

  async function postLike(id) {
    return window.OlongNotes.api.post('/questions/' + id + '/like', null, { auth: true });
  }

  async function postAnswer(id, content) {
    return window.OlongNotes.api.post('/questions/' + id + '/answer', { content }, { auth: true });
  }

  async function postAnswerLike(id) {
    return window.OlongNotes.api.post('/answers/' + id + '/like', null, { auth: true });
  }

  async function postAccept(questionId, answerId) {
    return window.OlongNotes.api.post(
      '/questions/' + questionId + '/accept',
      { answer_id: answerId },
      { auth: true }
    );
  }

  async function postQuestion(payload) {
    return window.OlongNotes.api.post('/questions', payload, { auth: true });
  }

  // Convert a subject option's data-value to a backend subject_id. The
  // HTML dropdown stores subject keys (strings like "mathematics") in the
  // prototype. The new dropdown we populate below will store numeric IDs.
  // For backward compatibility with any HTML page that hasn't been
  // re-rendered, treat non-numeric values as a no-op filter.
  function isNumericId(v) {
    return /^\d+$/.test(String(v));
  }

  // ---------- DOM rendering ----------

  // Render a single question row matching the HTML template already in
  // community.html (so CSS classes apply unmodified).
  function renderQuestionRow(q) {
    const li = document.createElement('li');
    li.className = 'question-row';
    li.dataset.questionId = q.id;
    li.dataset.status = q.status;
    li.dataset.mine = q.viewer_is_asker ? 'true' : 'false';
    li.dataset.grade = q.grade_level || '';
    li.dataset.subject = q.subject_id || '';
    // Sort key — timestamp in minutes. Use created_at ISO millisecond
    // divided by 60000 for a numeric sort that respects order.
    li.dataset.timestamp = q.created_at ? String(Math.floor(new Date(q.created_at).getTime() / 60000)) : '0';
    li.dataset.answers = String(q.answers_count != null ? q.answers_count : 0);
    li.dataset.likesCount = String(q.likes_count != null ? q.likes_count : 0);
    li.dataset.viewerLiked = q.viewer_has_liked ? 'true' : 'false';

    const tint = tintFor(q.subjects && q.subjects.subject_name);
    const asker = (q.users && q.users.user_name) || 'Anonymous';
    const subjectName = (q.subjects && q.subjects.subject_name) || 'General';
    const statusHtml = q.status === 'answered'
      ? '<span class="status-badge status-badge--answered">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L19 7"/></svg>' +
          'Answered</span>'
      : '<span class="status-badge status-badge--unanswered">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>' +
          'Unanswered</span>';

    const gradeHtml = q.grade_level
      ? '<span class="question-row__dot">&middot;</span>' +
        '<span class="question-row__grade">' + esc(q.grade_level) + '</span>'
      : '';

    const tagsHtml = (q.tags || []).map((t) =>
      '<span class="tag" style="--tag-tint:' + tint + '">' + esc(t) + '</span>'
    ).join('');

    const heartIcon =
      '<svg class="like-btn__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5.2 3.6c2.1-.5 4.1.4 5.3 2.1a1 1 0 0 0 1.6 0c1.2-1.7 3.2-2.6 5.3-2.1 3.4.9 4.8 4.4 3.2 7.6-2.5 4.7-10 9.3-10 9.3Z"/></svg>';

    const answerCount = q.answers_count || 0;
    const answerCountLabel = answerCount + (answerCount === 1 ? ' Answer' : ' Answers');

    const likePressed = q.viewer_has_liked ? 'true' : 'false';
    const likedClass = q.viewer_has_liked ? ' is-liked' : '';

    li.innerHTML =
      '<span class="question-row__avatar" style="--avatar-tint:' + tint + '" aria-hidden="true">' + esc(initials(asker)) + '</span>' +
      '<div class="question-row__body">' +
        '<div class="question-row__top">' +
          '<span class="question-row__meta-line">' +
            '<span class="question-row__subject" style="--subject-tint:' + tint + '">' + esc(subjectName) + '</span>' +
            gradeHtml +
            '<span class="question-row__dot">&middot;</span>' +
            '<span class="question-row__time">' + esc(relativeTime(q.created_at)) + '</span>' +
          '</span>' +
          statusHtml +
        '</div>' +
        '<p class="question-row__text">' + esc(q.title || '') + '</p>' +
        '<p class="question-row__desc">' + esc(q.body || '') + '</p>' +
        '<div class="question-row__tags">' + tagsHtml + '</div>' +
        '<div class="question-row__footer">' +
          '<button class="like-btn' + likedClass + '" type="button" aria-pressed="' + likePressed + '" data-count="' + esc(q.likes_count || 0) + '">' +
            heartIcon +
            '<span class="like-btn__count">' + esc(q.likes_count || 0) + '</span>' +
          '</button>' +
          '<span class="stat-count">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.6-.8L3 20l1-5.4A8.5 8.5 0 1 1 21 11.5Z"/></svg>' +
            '<span class="answer-count">' + esc(answerCountLabel) + '</span>' +
          '</span>' +
          '<button class="btn btn--outline btn--sm question-row__action" type="button">Answer</button>' +
        '</div>' +
      '</div>';

    return li;
  }

  function renderQuestionsInto(list, questions) {
    // Clear any existing rows before re-rendering. The empty message and
    // the load-more button get re-added outside this function.
    list.innerHTML = '';
    for (const q of questions) {
      list.appendChild(renderQuestionRow(q));
    }
  }

  // ---------- Subject dropdown population ----------
  // Pulls /api/subjects and fills the subject dropdown dynamically so the
  // page can stay in sync with the catalog without a redeploy. Keeps an
  // "All Subjects" entry as the first option.
  async function populateSubjectDropdown() {
    const dropdown = document.querySelector('.dropdown-filter[data-filter="subject"]');
    if (!dropdown) return;
    const menu = dropdown.querySelector('.dropdown-filter__menu');
    const label = dropdown.querySelector('.filter-select__label');
    if (!menu || !label) return;

    let subjects = [];
    try {
      const data = await window.OlongNotes.api.get('/subjects');
      subjects = Array.isArray(data) ? data : (data && data.subjects ? data.subjects : []);
    } catch (err) {
      console.warn('[community] could not load subjects:', err);
      return; // leave the dropdown empty
    }
    if (!subjects.length) return;

    // Rebuild the menu. Sort alphabetically for predictability.
    subjects.sort((a, b) =>
      String(a.subject_name || '').localeCompare(String(b.subject_name || ''))
    );

    const parts = [
      '<li class="dropdown-filter__option is-active" role="option" data-value="all">All Subjects</li>',
    ];
    for (const s of subjects) {
      parts.push(
        '<li class="dropdown-filter__option" role="option" data-value="' +
        esc(s.id) + '">' + esc(s.subject_name) + '</li>'
      );
    }
    menu.innerHTML = parts.join('');
    label.textContent = 'All Subjects';
    filterState.subject = 'all';
  }

  // ---------- List load ----------
  async function loadQuestions({ append = false } = {}) {
    const list = document.getElementById('questionList');
    const empty = document.getElementById('questionsEmpty');
    if (!list) return;

    if (!append) filterState.page = 1;

    try {
      const data = await fetchQuestions();
      const questions = (data && data.questions) || [];
      const pagination = (data && data.pagination) || { total: 0, has_more: false };

      if (append) {
        for (const q of questions) list.appendChild(renderQuestionRow(q));
      } else {
        renderQuestionsInto(list, questions);
      }

      filterState.hasMore = Boolean(pagination.has_more);
      filterState.total = pagination.total || 0;

      // Apply sort. Sort the in-DOM rows so the existing CSS layout stays
      // untouched and we don't need to rebuild DOM order on every filter
      // change.
      applySortToRows(list);

      // Empty-state visibility. If a load returns zero rows AND the user
      // is not paginated, surface the empty message.
      if (empty) empty.hidden = list.children.length !== 0;

      ensureLoadMoreButton();
    } catch (err) {
      console.error('[community] failed to load questions:', err);
      if (empty) {
        empty.textContent = err.status === 401
          ? 'Log in to see your questions.'
          : 'Could not load questions. Please try again.';
        empty.hidden = false;
      }
    }
  }

  function applySortToRows(list) {
    const rows = Array.prototype.slice.call(list.querySelectorAll('.question-row'));
    rows.sort((a, b) => {
      switch (filterState.sort) {
        case 'oldest':
          return (parseFloat(a.dataset.timestamp) || 0) - (parseFloat(b.dataset.timestamp) || 0);
        case 'most-liked':
          return (parseInt(b.dataset.likesCount, 10) || 0) - (parseInt(a.dataset.likesCount, 10) || 0);
        case 'most-answers':
          return (parseInt(b.dataset.answers, 10) || 0) - (parseInt(a.dataset.answers, 10) || 0);
        case 'latest':
        default:
          return (parseFloat(b.dataset.timestamp) || 0) - (parseFloat(a.dataset.timestamp) || 0);
      }
    });
    rows.forEach((r) => list.appendChild(r));
  }

  function ensureLoadMoreButton() {
    const list = document.getElementById('questionList');
    if (!list) return;
    // Remove any existing load-more row
    const existing = document.getElementById('communityLoadMore');
    if (existing) existing.remove();

    if (!filterState.hasMore) return;

    const li = document.createElement('li');
    li.id = 'communityLoadMore';
    li.style.textAlign = 'center';
    li.style.padding = '16px';
    li.innerHTML = '<button class="btn btn--outline btn--sm" type="button" id="communityLoadMoreBtn">Load more questions</button>';
    list.appendChild(li);

    const btn = document.getElementById('communityLoadMoreBtn');
    btn.addEventListener('click', () => {
      filterState.page += 1;
      loadQuestions({ append: true });
    });
  }

  // ---------- Tabs ----------
  // Mirrors the prototype's class-based active state so the existing CSS
  // for .questions-tab.is-active still applies.
  function initQuestionTabs() {
    const tabs = document.querySelectorAll('.questions-tab');
    if (!tabs.length) return;
    const labelToStatus = {
      'all': 'all',
      'unanswered': 'unanswered',
      'answered': 'answered',
      'my questions': 'my_questions',
    };
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.remove('is-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        const key = tab.textContent.trim().toLowerCase();
        filterState.status = labelToStatus[key] || 'all';
        loadQuestions();
      });
    });
  }

  // ---------- Filter dropdowns ----------
  // Reuses the existing markup (.dropdown-filter / .filter-select /
  // .dropdown-filter__menu / .dropdown-filter__option / data-value).
  // We don't re-implement open/close behavior — that's already wired in
  // the CSS via .dropdown-filter__menu[hidden]. We just hook the option
  // click to update state and reload.
  function initDropdownFilters() {
    const dropdowns = document.querySelectorAll('.dropdown-filter');
    dropdowns.forEach((dropdown) => {
      const key = dropdown.dataset.filter;
      const toggleBtn = dropdown.querySelector('.filter-select');
      const label = toggleBtn ? toggleBtn.querySelector('.filter-select__label') : null;
      const menu = dropdown.querySelector('.dropdown-filter__menu');
      const options = dropdown.querySelectorAll('.dropdown-filter__option');
      if (!key || !menu || !label) return;

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !menu.hidden;
        closeAllDropdowns();
        if (!isOpen) {
          menu.hidden = false;
          toggleBtn.setAttribute('aria-expanded', 'true');
        }
      });

      options.forEach((opt) => {
        opt.addEventListener('click', () => {
          options.forEach((o) => o.classList.remove('is-active'));
          opt.classList.add('is-active');
          label.textContent = opt.textContent;
          const v = opt.dataset.value;
          filterState[key] = v;
          closeAllDropdowns();
          loadQuestions();
        });
      });
    });

    document.addEventListener('click', closeAllDropdowns);

    function closeAllDropdowns() {
      dropdowns.forEach((dropdown) => {
        const menu = dropdown.querySelector('.dropdown-filter__menu');
        const toggleBtn = dropdown.querySelector('.filter-select');
        if (menu) menu.hidden = true;
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      });
    }
  }

  // ---------- Like buttons (delegated) ----------
  // One delegated listener on the list. Replaces the prototype's separate
  // init/render attach — works because the list is the stable ancestor.
  function initLikeButtons() {
    const list = document.getElementById('questionList');
    if (!list) return;

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.like-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation(); // don't bubble to row -> open modal

      if (!isAuthed()) {
        showInlineBanner('Log in to like questions.');
        return;
      }

      const row = btn.closest('.question-row');
      if (!row) return;
      const id = parseInt(row.dataset.questionId, 10);
      if (!id) return;

      // Optimistic UI
      const base = parseInt(btn.dataset.count, 10) || 0;
      const wasLiked = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!wasLiked));
      btn.classList.toggle('is-liked', !wasLiked);
      const countEl = btn.querySelector('.like-btn__count');
      if (countEl) {
        const newCount = wasLiked ? Math.max(0, base - 1) : base + 1;
        countEl.textContent = String(newCount);
      }
      btn.dataset.count = String(wasLiked ? Math.max(0, base - 1) : base + 1);

      try {
        const res = await postLike(id);
        // Reconcile with the server's value (which saw the trigger fire).
        if (res && typeof res.likes_count === 'number') {
          btn.dataset.count = String(res.likes_count);
          if (countEl) countEl.textContent = String(res.likes_count);
          row.dataset.likesCount = String(res.likes_count);
        }
      } catch (err) {
        // Revert on failure.
        btn.setAttribute('aria-pressed', String(wasLiked));
        btn.classList.toggle('is-liked', wasLiked);
        if (countEl) countEl.textContent = String(base);
        btn.dataset.count = String(base);
        if (err && err.status === 401) {
          showInlineBanner('Your session expired. Please log in again.');
        } else {
          showInlineBanner('Could not update like. Please try again.');
        }
      }
    });
  }

  // ---------- Question detail modal ----------
  function initQuestionModal() {
    const modal = document.getElementById('questionModal');
    const content = document.getElementById('modalQuestionContent');
    const backBtn = document.getElementById('modalBackBtn');
    const answerPostBtn = document.getElementById('answerPostBtn');
    const answerCancelBtn = document.getElementById('answerCancelBtn');
    const answerTextarea = document.getElementById('answerTextarea');
    if (!modal || !content) return;

    // Open modal on Answer button click — delegated, so dynamically
    // rendered rows are covered.
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.question-row__action');
      if (!btn) return;
      const row = btn.closest('.question-row');
      if (!row) return;
      const id = parseInt(row.dataset.questionId, 10);
      if (!id) return;
      await openQuestionModal(id);
    });

    if (backBtn) backBtn.addEventListener('click', closeQuestionModal);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeQuestionModal();
    });

    if (answerCancelBtn && answerTextarea) {
      answerCancelBtn.addEventListener('click', () => {
        answerTextarea.value = '';
      });
    }

    if (answerPostBtn) {
      answerPostBtn.addEventListener('click', () => handleAnswerPost());
    }

    // Modal-internal delegations: answer-like + accept buttons. Re-bound
    // each time the modal opens because the inner content is rebuilt.
    content.addEventListener('click', async (e) => {
      const likeBtn = e.target.closest('.answer-like-btn');
      if (likeBtn) {
        await handleAnswerLike(likeBtn);
        return;
      }
      const acceptBtn = e.target.closest('.answer-accept-btn');
      if (acceptBtn) {
        await handleAccept(acceptBtn);
        return;
      }
    });

    async function openQuestionModal(id) {
      openId = id;
      modal.dataset.activeId = String(id);
      content.innerHTML = '<p class="modal-question__loading">Loading question…</p>';
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      window.scrollTo(0, 0);
      if (answerTextarea) answerTextarea.value = '';

      try {
        const data = await fetchQuestionDetail(id);
        const q = data && data.question;
        if (!q) {
          content.innerHTML = '<p class="modal-question__loading">Question not found.</p>';
          return;
        }
        content.innerHTML = renderQuestionDetail(q);
        bindAcceptButtons();
      } catch (err) {
        console.error('[community] detail load failed:', err);
        content.innerHTML = '<p class="modal-question__loading">Could not load question. Please try again.</p>';
      }
    }

    function closeQuestionModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      openId = null;
    }

    async function handleAnswerPost() {
      if (!isAuthed()) {
        showInlineBanner('Log in to post an answer.');
        return;
      }
      if (!answerTextarea) return;
      const content2 = answerTextarea.value.trim();
      if (!content2) {
        answerTextarea.focus();
        return;
      }
      if (content2.length > 5000) {
        showInlineBanner('Answer too long. Max 5000 characters.');
        return;
      }
      const questionId = parseInt(modal.dataset.activeId, 10);
      if (!questionId) return;

      const originalLabel = answerPostBtn.textContent;
      answerPostBtn.disabled = true;
      answerPostBtn.textContent = 'Posting…';
      try {
        await postAnswer(questionId, content2);
        answerTextarea.value = '';
        // Refresh the detail content so the new answer appears + the
        // answers_count on the row in the background list stays in sync.
        const refreshed = await fetchQuestionDetail(questionId);
        if (refreshed && refreshed.question) {
          content.innerHTML = renderQuestionDetail(refreshed.question);
          bindAcceptButtons();
        }
        // Update the row in the list behind the modal.
        syncRowCounts(questionId, refreshed && refreshed.question ? refreshed.question : null);
        showInlineBanner('Answer posted.', 'success');
      } catch (err) {
        console.error('[community] answer post failed:', err);
        if (err && err.status === 401) {
          showInlineBanner('Your session expired. Please log in again.');
        } else {
          showInlineBanner((err && err.message) || 'Could not post answer.');
        }
      } finally {
        answerPostBtn.disabled = false;
        answerPostBtn.textContent = originalLabel;
      }
    }

    async function handleAnswerLike(btn) {
      if (!isAuthed()) {
        showInlineBanner('Log in to like answers.');
        return;
      }
      const id = parseInt(btn.dataset.answerId, 10);
      if (!id) return;

      const base = parseInt(btn.dataset.count, 10) || 0;
      const wasLiked = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!wasLiked));
      btn.classList.toggle('is-liked', !wasLiked);
      const countEl = btn.querySelector('.answer-like-btn__count');
      if (countEl) {
        countEl.textContent = String(wasLiked ? Math.max(0, base - 1) : base + 1);
      }
      btn.dataset.count = String(wasLiked ? Math.max(0, base - 1) : base + 1);

      try {
        const res = await postAnswerLike(id);
        if (res && typeof res.likes_count === 'number') {
          btn.dataset.count = String(res.likes_count);
          if (countEl) countEl.textContent = String(res.likes_count);
        }
      } catch (err) {
        btn.setAttribute('aria-pressed', String(wasLiked));
        btn.classList.toggle('is-liked', wasLiked);
        if (countEl) countEl.textContent = String(base);
        btn.dataset.count = String(base);
        if (err && err.status === 401) {
          showInlineBanner('Your session expired. Please log in again.');
        } else {
          showInlineBanner('Could not update like. Please try again.');
        }
      }
    }

    async function handleAccept(btn) {
      if (!isAuthed()) {
        showInlineBanner('Log in to accept an answer.');
        return;
      }
      const questionId = parseInt(btn.dataset.questionId, 10);
      const answerId = parseInt(btn.dataset.answerId, 10);
      if (!questionId || !answerId) return;

      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Accepting…';
      try {
        await postAccept(questionId, answerId);
        // Re-fetch detail so the accepted badge + status flip are
        // reflected. The RPC atomicity guarantees is_accepted flipped
        // everywhere it needed to.
        const refreshed = await fetchQuestionDetail(questionId);
        if (refreshed && refreshed.question) {
          content.innerHTML = renderQuestionDetail(refreshed.question);
          bindAcceptButtons();
          syncRowCounts(questionId, refreshed.question);
        }
        showInlineBanner('Answer accepted.', 'success');
      } catch (err) {
        console.error('[community] accept failed:', err);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        if (err && err.status === 403) {
          showInlineBanner('Only the asker can accept an answer.');
        } else if (err && err.status === 401) {
          showInlineBanner('Your session expired. Please log in again.');
        } else {
          showInlineBanner((err && err.message) || 'Could not accept answer.');
        }
      }
    }

    function bindAcceptButtons() {
      // Accept buttons are already wired via the delegated click handler
      // above. Nothing to do here — kept as a hook in case future needs.
    }
  }

  function syncRowCounts(questionId, detailQuestion) {
    if (!questionId || !detailQuestion) return;
    const row = document.querySelector('.question-row[data-question-id="' + questionId + '"]');
    if (!row) return;
    row.dataset.answers = String(detailQuestion.answers_count || 0);
    row.dataset.status = detailQuestion.status || row.dataset.status;
    row.dataset.likesCount = String(detailQuestion.likes_count || 0);
    if (detailQuestion.viewer_is_asker) row.dataset.mine = 'true';
    if (typeof detailQuestion.viewer_has_liked === 'boolean') {
      row.dataset.viewerLiked = detailQuestion.viewer_has_liked ? 'true' : 'false';
    }
    // Update the answer-count label + status badge in the row.
    const countEl = row.querySelector('.answer-count');
    if (countEl) {
      const n = detailQuestion.answers_count || 0;
      countEl.textContent = n + (n === 1 ? ' Answer' : ' Answers');
    }
    const likeBtn = row.querySelector('.like-btn');
    if (likeBtn) {
      likeBtn.dataset.count = String(detailQuestion.likes_count || 0);
      const lc = likeBtn.querySelector('.like-btn__count');
      if (lc) lc.textContent = String(detailQuestion.likes_count || 0);
      if (typeof detailQuestion.viewer_has_liked === 'boolean') {
        likeBtn.setAttribute('aria-pressed', detailQuestion.viewer_has_liked ? 'true' : 'false');
        likeBtn.classList.toggle('is-liked', detailQuestion.viewer_has_liked);
      }
    }
    const badge = row.querySelector('.status-badge');
    if (badge && detailQuestion.status === 'answered') {
      badge.className = 'status-badge status-badge--answered';
      badge.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L19 7"/></svg>' +
        'Answered';
    }
  }

  // ---------- Detail modal rendering ----------
  function renderQuestionDetail(q) {
    const tint = tintFor(q.subjects && q.subjects.subject_name);
    const asker = (q.users && q.users.user_name) || 'Anonymous';
    const subjectName = (q.subjects && q.subjects.subject_name) || 'General';
    const statusBadge = q.status === 'answered'
      ? '<span class="status-badge status-badge--answered">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L19 7"/></svg>' +
          'Answered</span>'
      : '<span class="status-badge status-badge--unanswered">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>' +
          'Unanswered</span>';

    const gradeHtml = q.grade_level
      ? '<span class="question-row__dot">&middot;</span>' +
        '<span class="question-row__grade">' + esc(q.grade_level) + '</span>'
      : '';

    const tagsHtml = (q.tags || []).map((t) =>
      '<span class="tag" style="--tag-tint:' + tint + '">' + esc(t) + '</span>'
    ).join('');

    const answersHtml = (q.answers || []).map((a) => renderAnswer(a, q, tint)).join('');

    return (
      '<div class="question-row__top">' +
        '<span class="question-row__meta-line">' +
          '<span class="question-row__subject" style="--subject-tint:' + tint + '">' + esc(subjectName) + '</span>' +
          gradeHtml +
          '<span class="question-row__dot">&middot;</span>' +
          '<span class="question-row__time">' + esc(relativeTime(q.created_at)) + '</span>' +
        '</span>' +
        statusBadge +
      '</div>' +
      '<div class="modal-question__head">' +
        '<span class="question-row__avatar" style="--avatar-tint:' + tint + '" aria-hidden="true">' + esc(initials(asker)) + '</span>' +
        '<div>' +
          '<p class="question-row__text">' + esc(q.title || '') + '</p>' +
          '<p class="question-row__desc">' + esc(q.body || '') + '</p>' +
          '<div class="question-row__tags">' + tagsHtml + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-comments">' +
        '<div class="modal-comments__head">' +
          '<h2 class="modal-comments__title">Answers (' + ((q.answers || []).length) + ')</h2>' +
        '</div>' +
        '<ul class="comment-list">' + answersHtml + '</ul>' +
      '</div>'
    );
  }

  function renderAnswer(a, q, tint) {
    const isAccepted = Boolean(a.is_accepted);
    const answererName = (a.users && a.users.user_name) || 'Anonymous';
    const likePressed = isAccepted ? 'false' : 'false'; // viewer_has_liked would come from a per-answer endpoint; conservatively false for now
    const likedClass = likePressed === 'true' ? ' is-liked' : '';

    const acceptedBadge = isAccepted
      ? '<span class="badge-contributor">Accepted</span>'
      : '';

    // The Accept button is only rendered when viewer_is_asker is true
    // AND the question is still 'unanswered'. Accepted-as-state is shown
    // as the badge above instead — so it doesn't double up.
    const acceptBtn = (q.viewer_is_asker && q.status === 'unanswered' && !isAccepted)
      ? '<button class="btn btn--outline btn--sm answer-accept-btn" type="button" data-question-id="' + esc(q.id) + '" data-answer-id="' + esc(a.id) + '">Accept</button>'
      : '';

    return (
      '<li class="comment-item' + (isAccepted ? ' comment-item--accepted' : '') + '">' +
        '<span class="comment-item__avatar" aria-hidden="true">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5"/></svg>' +
        '</span>' +
        '<div class="comment-item__body">' +
          '<div class="comment-item__head">' +
            '<span class="comment-item__name">' + esc(answererName) + '</span>' +
            acceptedBadge +
            '<span class="comment-item__time">' + esc(relativeTime(a.created_at)) + '</span>' +
          '</div>' +
          '<div class="comment-item__text">' + esc(a.content || '') + '</div>' +
          '<div class="comment-item__footer">' +
            '<button class="answer-like-btn' + likedClass + '" type="button" aria-pressed="' + likePressed + '" data-answer-id="' + esc(a.id) + '" data-count="' + esc(a.likes_count || 0) + '">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-8a2 2 0 0 1 3.6 1.2L14.5 8H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 19H10a3 3 0 0 1-3-3v-5Z"/></svg>' +
              '<span class="answer-like-btn__count">' + esc(a.likes_count || 0) + '</span>' +
            '</button>' +
            acceptBtn +
          '</div>' +
        '</div>' +
      '</li>'
    );
  }

  // ---------- Ask modal ----------
  // Subject dropdown is populated dynamically from /api/subjects so it
  // stays in sync with the catalog without a redeploy.
  async function initAskModal() {
    const modal = document.getElementById('askModal');
    const backdrop = document.getElementById('askModalBackdrop');
    const closeBtn = document.getElementById('askModalClose');
    const openBtn = document.getElementById('askQuestionBtn');
    const postBtn = document.getElementById('askPostBtn');
    const errorMsg = document.getElementById('askModalError');
    const subjectSelect = document.getElementById('askSubjectSelect');
    const descTextarea = document.getElementById('askDescTextarea');
    const descCount = document.getElementById('askDescCount');
    const tagsInput = document.getElementById('askTagsInput');
    const tagsCount = document.getElementById('askTagsCount');

    if (!modal) return;

    // Populate the subject dropdown
    if (subjectSelect) {
      try {
        const data = await window.OlongNotes.api.get('/subjects');
        const subjects = Array.isArray(data) ? data : (data && data.subjects ? data.subjects : []);
        if (subjects.length) {
          subjects.sort((a, b) =>
            String(a.subject_name || '').localeCompare(String(b.subject_name || ''))
          );
          const opts = ['<option value="" disabled selected>Select a subject</option>']
            .concat(subjects.map((s) =>
              '<option value="' + esc(s.id) + '">' + esc(s.subject_name) + '</option>'
            ));
          subjectSelect.innerHTML = opts.join('');
        }
      } catch (err) {
        console.warn('[community] could not load subjects for ask modal:', err);
      }
    }

    if (openBtn) openBtn.addEventListener('click', openAskModal);
    if (closeBtn) closeBtn.addEventListener('click', closeAskModal);
    if (backdrop) backdrop.addEventListener('click', closeAskModal);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeAskModal();
    });

    if (descTextarea && descCount) {
      descTextarea.addEventListener('input', () => {
        descCount.textContent = String(descTextarea.value.length);
      });
    }
    if (tagsInput && tagsCount) {
      tagsInput.addEventListener('input', () => {
        const count = parseAskTags(tagsInput.value).length;
        tagsCount.textContent = count + ' / 3';
      });
    }

    if (postBtn) postBtn.addEventListener('click', submitQuestion);

    function openAskModal() {
      if (!isAuthed()) {
        // Auth lives on index.html. Send them there in signup mode.
        window.location.href = 'index.html?auth=signup';
        return;
      }
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (errorMsg) errorMsg.hidden = true;
    }

    function closeAskModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    function resetForm() {
      if (subjectSelect) subjectSelect.value = '';
      if (descTextarea) descTextarea.value = '';
      if (descCount) descCount.textContent = '0';
      if (tagsInput) tagsInput.value = '';
      if (tagsCount) tagsCount.textContent = '0 / 3';
      if (errorMsg) errorMsg.hidden = true;
    }

    function parseAskTags(raw) {
      return String(raw || '').split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 3);
    }

    async function submitQuestion() {
      if (!isAuthed()) {
        window.location.href = 'index.html?auth=signup';
        return;
      }
      const subjectId = subjectSelect ? subjectSelect.value : '';
      const desc = descTextarea ? descTextarea.value.trim() : '';

      if (!subjectId || !desc) {
        if (errorMsg) errorMsg.hidden = false;
        return;
      }
      if (errorMsg) errorMsg.hidden = true;

      const tags = parseAskTags(tagsInput ? tagsInput.value : '');

      const originalLabel = postBtn.textContent;
      postBtn.disabled = true;
      postBtn.textContent = 'Posting…';

      try {
        const payload = {
          body: desc,
          subject_id: parseInt(subjectId, 10),
          tags,
        };
        const res = await postQuestion(payload);
        resetForm();
        closeAskModal();
        // Prepend the new question to the list so the user sees it
        // immediately at the top.
        if (res && res.question) {
          const list = document.getElementById('questionList');
          if (list) {
            const newRow = renderQuestionRow(res.question);
            list.insertBefore(newRow, list.firstChild);
            newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      } catch (err) {
        console.error('[community] submit question failed:', err);
        if (errorMsg) {
          errorMsg.textContent = (err && err.message) || 'Could not post question.';
          errorMsg.hidden = false;
        }
      } finally {
        postBtn.disabled = false;
        postBtn.textContent = originalLabel;
      }
    }
  }

  // ---------- Inline banners ----------
  // Tiny ephemeral banner above the question list for 401s and other
  // transient feedback (instead of opening the index.html auth modal —
  // which doesn't exist on this page anyway).
  function showInlineBanner(message, kind) {
    let host = document.getElementById('communityInlineBanner');
    if (!host) {
      host = document.createElement('div');
      host.id = 'communityInlineBanner';
      host.setAttribute('role', 'status');
      host.style.cssText =
        'padding:10px 14px;border-radius:8px;margin:0 0 12px 0;' +
        'font-size:14px;line-height:1.4;background:var(--surface-2,#f6f7fb);' +
        'border:1px solid var(--border-soft,#e3e7ef);color:var(--text,#222);';
      const list = document.getElementById('questionList');
      if (list && list.parentNode) {
        list.parentNode.insertBefore(host, list);
      } else {
        return;
      }
    }
    const accent = kind === 'success' ? '#2e9e5b' : '#e0556f';
    host.style.borderLeft = '3px solid ' + accent;
    host.textContent = message;
    host.hidden = false;
    clearTimeout(host._timer);
    host._timer = setTimeout(() => {
      host.hidden = true;
    }, 4000);
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', async () => {
    // Populate the subject dropdown before the first load so the
    // question list can be filtered the moment the user clicks a subject.
    await populateSubjectDropdown();
    initQuestionTabs();
    initDropdownFilters();
    initLikeButtons();
    initQuestionModal();
    initAskModal();
    loadQuestions();
  });

  // Expose a tiny test hook so the Q&A verification script in the spec
  // can call these from devtools. Not used by the UI.
  window.OlongNotes = window.OlongNotes || {};
  window.OlongNotes.community = {
    reload: () => loadQuestions(),
    state: () => ({ ...filterState, openId }),
  };
})();
