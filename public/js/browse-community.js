/* ---------------------------------------------------------
   BROWSE / COMMUNITY HUB — Phase 4.0 Q&A wiring (FEED ONLY)
   Live data from the backend (no mock):
     GET    /api/questions                  list + filters
     GET    /api/subjects                   ask modal subject dropdown
     POST   /api/questions                  ask (body + optional buckets)
     POST   /api/questions/:id/like         toggle like

   FEED-ONLY ARCHITECTURE (Brainly-style separate pages):
     - community.html shows ONLY the question feed + filtering + the
       "Ask a Question" modal. No in-page detail view, no answer
       composer, no modal detail overlay.
     - Clicking a question card navigates to question.html?id={id}
       (a real, separate page). Answering navigates to answer.html?id={id}.
     - Like buttons still work inline on the feed.
--------------------------------------------------------- */
(function () {
  'use strict';

  // ---------- Configuration ----------
  const PAGE_LIMIT = 20;

  // ---------- Auth helpers ----------
  function getToken() {
    return window.OlongNotes && window.OlongNotes.getToken
      ? window.OlongNotes.getToken()
      : null;
  }
  function isAuthed() {
    return Boolean(getToken());
  }

  // ---------- State ----------
  const filterState = {
    level: 'all',   // all | k10 | senior_high | college
    sort: 'latest', // latest | oldest | most-liked | most-answers
    page: 1,
    hasMore: false,
    total: 0,
  };

  // ---------- Curriculum bucket helper ----------
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

  // ---------- Subject tints ----------
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

  // Backend derives the title from the first 70 chars of body, but we
  // guard client-side too in case an older row has no title.
  function titleFor(q) {
    if (q.title) return q.title;
    const body = q.body || '';
    return body.length > 70 ? body.slice(0, 70) + '…' : body;
  }

  // ---------- API helpers ----------
  function buildListQuery() {
    const q = new URLSearchParams();
    q.set('limit', String(PAGE_LIMIT));
    q.set('offset', String((filterState.page - 1) * PAGE_LIMIT));

    if (filterState.level !== 'all') q.set('education_level', filterState.level);

    return q.toString();
  }

  async function fetchQuestions() {
    const qs = buildListQuery();
    return window.OlongNotes.api.get('/questions?' + qs);
  }
  async function postLike(id) {
    return window.OlongNotes.api.post('/questions/' + id + '/like', null, { auth: true });
  }
  async function postQuestion(payload) {
    return window.OlongNotes.api.post('/questions', payload, { auth: true });
  }

  // ---------- Card rendering ----------
  function renderQuestionRow(q) {
    const li = document.createElement('li');
    li.className = 'question-row';
    li.dataset.questionId = q.id;
    li.dataset.status = q.status || 'open';
    li.dataset.grade = q.grade_level || '';
    li.dataset.subject = q.subject_id || '';
    li.dataset.timestamp = q.created_at ? String(Math.floor(new Date(q.created_at).getTime() / 60000)) : '0';
    li.dataset.answers = String(q.answers_count != null ? q.answers_count : 0);
    li.dataset.likesCount = String(q.likes_count != null ? q.likes_count : 0);
    li.dataset.viewerLiked = q.viewer_has_liked ? 'true' : 'false';

    const tint = tintFor(q.subjects && q.subjects.subject_name);
    const asker = (q.users && q.users.user_name) || 'Anonymous';
    const subjectName = (q.subjects && q.subjects.subject_name) || '';
    const bucket = bucketForGrade(q.grade_level);
    const bucketLabel = BUCKET_LABEL[bucket] || 'All Levels';
    const isAnswered = String(q.status || '').toLowerCase() === 'answered';
    const timeLabel = relativeTime(q.created_at);
    const title = titleFor(q);

    const heartIcon =
      '<svg class="like-btn__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5.2 3.6c2.1-.5 4.1.4 5.3 2.1a1 1 0 0 0 1.6 0c1.2-1.7 3.2-2.6 5.3-2.1 3.4.9 4.8 4.4 3.2 7.6-2.5 4.7-10 9.3-10 9.3Z"/></svg>';

    const commentIcon =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.6-.8L3 20l1-5.4A8.5 8.5 0 1 1 21 11.5Z"/></svg>';

    const answerCount = q.answers_count != null ? q.answers_count : 0;
    const likeCount = q.likes_count != null ? q.likes_count : 0;
    const likePressed = q.viewer_has_liked ? 'true' : 'false';
    const likedClass = q.viewer_has_liked ? ' is-liked' : '';
    const statusBadge = isAnswered
      ? '<span class="question-row__status question-row__status--answered">Answered</span>'
      : '<span class="question-row__status question-row__status--open">Unanswered</span>';

    // The title links to the real question page (works without JS too).
    li.innerHTML =
      '<span class="question-row__avatar" style="--avatar-tint:' + tint + '" aria-hidden="true">' + esc(initials(asker)) + '</span>' +
      '<div class="question-row__body">' +
        '<div class="question-row__header">' +
          '<span class="question-row__asker">' + esc(asker) + '</span>' +
          (timeLabel ? '<span class="question-row__time">· ' + esc(timeLabel) + '</span>' : '') +
          '<span class="question-row__curriculum question-row__curriculum--' + bucket + '">' + esc(bucketLabel) + '</span>' +
          statusBadge +
        '</div>' +
        (subjectName ? '<div class="question-row__subject" style="--tag-tint:' + tint + '">#' + esc(subjectName) + '</div>' : '') +
        '<a class="question-row__text question-row__text--clickable" href="question.html?id=' + encodeURIComponent(q.id) + '">' + esc(title) + '</a>' +
        '<div class="question-row__footer">' +
          '<button class="like-btn' + likedClass + '" type="button" aria-pressed="' + likePressed + '" data-count="' + esc(likeCount) + '">' +
            heartIcon +
            '<span class="like-btn__count">' + esc(likeCount) + '</span>' +
          '</button>' +
          '<span class="stat-count">' +
            commentIcon +
            '<span class="answer-count">' + esc(answerCount) + '</span>' +
          '</span>' +
          '<a class="btn btn--outline btn--sm question-row__action" href="answer.html?id=' + encodeURIComponent(q.id) + '">Answer</a>' +
        '</div>' +
      '</div>';

    return li;
  }

  function renderQuestionsInto(list, questions) {
    list.innerHTML = '';
    for (const q of questions) {
      list.appendChild(renderQuestionRow(q));
    }
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

      applySortToRows(list);

      if (empty) empty.hidden = list.children.length !== 0;
      ensureLoadMoreButton();
    } catch (err) {
      console.error('[community] failed to load questions:', err);
      if (empty) {
        empty.textContent = 'Could not load questions. Please try again.';
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

  // ---------- Filter dropdowns ----------
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
          filterState[key] = opt.dataset.value;
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
  function initLikeButtons() {
    const list = document.getElementById('questionList');
    if (!list) return;

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.like-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

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
        if (res && typeof res.likes_count === 'number') {
          btn.dataset.count = String(res.likes_count);
          if (countEl) countEl.textContent = String(res.likes_count);
          row.dataset.likesCount = String(res.likes_count);
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
    });
  }

  // ---------- Card click → question.html?id= (real page navigation) ----------
  // Whole-card click opens the real question page. The title + Answer
  // are already <a> links, so we skip those (the browser handles them);
  // any other click on the card body navigates.
  function initCardClick() {
    const list = document.getElementById('questionList');
    if (!list) return;
    list.addEventListener('click', (e) => {
      if (e.target.closest('.like-btn')) return;
      if (e.target.closest('a')) return; // title/Answer links handled natively
      const row = e.target.closest('.question-row');
      if (!row) return;
      const id = row.dataset.questionId;
      if (!id) return;
      window.location.href = 'question.html?id=' + encodeURIComponent(id);
    });
  }

  // ---------- Ask modal ----------
  // "Ask a Question!" create-post modal:
  //   - Grade Level is now THREE buckets only (K-10 / Senior High /
  //     College). The selector holds the *bucket* value directly.
  //   - Subjects CASCADES from Grade Level: once a bucket is chosen we
  //     fetch GET /api/subjects?education_level={bucket} (endpoint ALREADY
  //     EXISTS in routes/catalog.js — confirmed) to populate the Subjects
  //     dropdown. Subjects is disabled until a Grade is selected.
  //   - Payload sends body + optional subject_id + grade_level. The
  //     backend accepts a bucket value as grade_level / education_level
  //     (BUCKET_TO_GRADE mapping on server) — confirmed as safe.
  async function initAskModal() {
    const modal = document.getElementById('askModal');
    const backdrop = document.getElementById('askModalBackdrop');
    const closeBtn = document.getElementById('askModalClose');
    const openBtn = document.getElementById('askQuestionBtn');
    const postBtn = document.getElementById('askPostBtn');
    const errorMsg = document.getElementById('askModalError');
    const subjectSelect = document.getElementById('askSubjectSelect');
    const levelSelect = document.getElementById('askLevelSelect');
    const descTextarea = document.getElementById('askDescTextarea');
    const askerNameEl = document.getElementById('askModalAsker');
    const askerAvatarEl = document.getElementById('askModalAvatar');

    if (!modal) return;

    // Start with Subjects disabled + empty — a Grade must be picked first.
    if (subjectSelect) {
      subjectSelect.disabled = true;
      subjectSelect.innerHTML = '<option value="" disabled selected>Select a grade level first</option>';
    }

    const LABELS = { k10: 'K-10', senior_high: 'Senior High', college: 'College' };

    // Cascade Subjects from the chosen Grade bucket.
    async function loadSubjectsForLevel(bucket) {
      if (!subjectSelect) return;
      subjectSelect.disabled = false;
      subjectSelect.innerHTML = '<option value="" disabled selected>Loading subjects…</option>';
      try {
        const data = await window.OlongNotes.api.get('/subjects?education_level=' + encodeURIComponent(bucket));
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
          subjectSelect.disabled = false;
        } else {
          subjectSelect.innerHTML = '<option value="" disabled selected>No subjects for this level</option>';
        }
      } catch (err) {
        console.warn('[community] could not load subjects for level:', err);
        subjectSelect.innerHTML = '<option value="" disabled selected>Could not load subjects</option>';
      }
    }

    if (levelSelect) {
      levelSelect.addEventListener('change', () => {
        if (errorMsg) errorMsg.hidden = true;
        if (subjectSelect) {
          subjectSelect.disabled = true;
          subjectSelect.innerHTML = '<option value="" disabled selected>Select a grade level first</option>';
        }
        const bucket = levelSelect.value;
        if (bucket) loadSubjectsForLevel(bucket);
      });
    }

    if (openBtn) openBtn.addEventListener('click', openAskModal);
    if (closeBtn) closeBtn.addEventListener('click', closeAskModal);
    if (backdrop) backdrop.addEventListener('click', closeAskModal);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeAskModal();
    });

    if (postBtn) postBtn.addEventListener('click', submitQuestion);

    function refreshAskerChip() {
      let name = 'You';
      try {
        const raw = localStorage.getItem('olongnotes_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u && u.username) name = String(u.username);
        }
      } catch (_) { /* private mode etc. */ }
      if (askerNameEl) askerNameEl.textContent = name;
      if (askerAvatarEl) {
        askerAvatarEl.textContent = initials(name);
        askerAvatarEl.style.setProperty('--avatar-tint', tintFor(name));
      }
    }

    function openAskModal() {
      if (!isAuthed()) {
        showInlineBanner('Please log in to ask a question.');
        if (window.OlongNotes && typeof window.OlongNotes.openLoginModal === 'function') {
          window.OlongNotes.openLoginModal();
        } else if (document.getElementById('navLoginBtn')) {
          document.getElementById('navLoginBtn').click();
        }
        return;
      }
      refreshAskerChip();
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
      if (subjectSelect) {
        subjectSelect.value = '';
        subjectSelect.disabled = true;
        subjectSelect.innerHTML = '<option value="" disabled selected>Select a grade level first</option>';
      }
      if (levelSelect) levelSelect.value = '';
      if (descTextarea) descTextarea.value = '';
      if (errorMsg) errorMsg.hidden = true;
    }

    async function submitQuestion() {
      if (!isAuthed()) {
        closeAskModal();
        showInlineBanner('Please log in to ask a question.');
        if (window.OlongNotes && typeof window.OlongNotes.openLoginModal === 'function') {
          window.OlongNotes.openLoginModal();
        } else if (document.getElementById('navLoginBtn')) {
          document.getElementById('navLoginBtn').click();
        }
        return;
      }
      const subjectId = subjectSelect && !subjectSelect.disabled ? subjectSelect.value : '';
      const gradeLevel = levelSelect ? levelSelect.value : '';
      const body = descTextarea ? descTextarea.value.trim() : '';

      if (!body || body.length < 10) {
        if (errorMsg) {
          errorMsg.textContent = 'Please write at least 10 characters for your question.';
          errorMsg.hidden = false;
        }
        return;
      }
      if (!gradeLevel) {
        if (errorMsg) {
          errorMsg.textContent = 'Please select a grade level.';
          errorMsg.hidden = false;
        }
        return;
      }
      if (errorMsg) errorMsg.hidden = true;

      const originalLabel = postBtn.textContent;
      postBtn.disabled = true;
      postBtn.textContent = 'Posting…';

      try {
        // Per spec: body required, subject_id/grade_level optional, never
        // send a title. The backend accepts the *bucket* value as the
        // grade_level (BUCKET_TO_GRADE mapping lives server-side) — the
        // confirmed contract for FIX 3.
        const payload = { body };
        if (subjectId) payload.subject_id = parseInt(subjectId, 10);
        payload.grade_level = gradeLevel; // 'k10' | 'senior_high' | 'college'

        const res = await postQuestion(payload);
        resetForm();
        closeAskModal();
        showInlineBanner('Question posted!', 'success');

        // Prepend the new question to the list. If the server didn't
        // return the row, refresh from the server instead.
        if (res && res.question) {
          const list = document.getElementById('questionList');
          if (list) {
            const newRow = renderQuestionRow(res.question);
            list.insertBefore(newRow, list.firstChild);
            newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          loadQuestions();
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
      const anchor = document.getElementById('questionsPanel');
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(host, anchor);
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
  document.addEventListener('DOMContentLoaded', () => {
    initDropdownFilters();
    initLikeButtons();
    initCardClick();
    initAskModal();

    loadQuestions();
  });

  // Expose a tiny test hook so the Q&A verification script in the spec
  // can call these from devtools. Not used by the UI.
  window.OlongNotes = window.OlongNotes || {};
  window.OlongNotes.community = {
    reload: () => loadQuestions(),
    state: () => ({ ...filterState }),
  };
})();

