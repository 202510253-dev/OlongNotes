/* ---------------------------------------------------------
   BROWSE / COMMUNITY HUB — filters, likes, question modal
--------------------------------------------------------- */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     Sample question detail + comment data (keyed by question id)
     In a real app this would come from the server.
  --------------------------------------------------------- */
  var questionsData = {
    q1: {
      subject: "Physics",
      subjectTint: "#3d6bf0",
      grade: "Grade 11",
      time: "15 mins ago",
      status: "answered",
      avatar: "J",
      title: "A ball is thrown vertically upward with a velocity of 20 m/s. How long will it take to reach the highest point?",
      desc: "What formula should I use to solve this? I know the final velocity is 0 at the highest point, but I'm not sure how to find the time.",
      tags: ["#Physics", "#Motion", "#Kinematics"],
      comments: [
        { name: "Maria Santos", badge: "Top Contributor", time: "5 mins ago", likes: 12,
          html: "Use the first equation of motion:<code>v = u + at</code>Since v = 0 at the highest point, solve for t.",
          replies: [
            { name: "Aire Rose", time: "3 mins ago", html: "Got it, thank you! So t = u / a?" }
          ] },
        { name: "John Cruz", time: "2 mins ago", likes: 4,
          html: "Don't forget that acceleration is -9.8 m/s\u00b2." },
        { name: "Kenneth Lee", time: "10 mins ago", likes: 3,
          html: "You can also use t = u / g." },
        { name: "Aire Rose", time: "just now", likes: 0,
          html: "This helped a lot, thank you!" }
      ]
    },
    q2: {
      subject: "Mathematics",
      subjectTint: "#e7833b",
      grade: "Grade 9",
      time: "1 hour ago",
      status: "unanswered",
      avatar: "M",
      title: "Can you help me solve x: 7x + 4/5 = 15 ?",
      desc: "I tried isolating x but I keep getting a different answer. Where did I go wrong?",
      tags: ["#Algebra", "#Equations", "#Linear"],
      comments: [
        { name: "Kent Morales", time: "40 mins ago", likes: 6,
          html: "Multiply everything by 5 first to clear the fraction, then isolate x." },
        { name: "John Dela Cruz", time: "22 mins ago", likes: 2,
          html: "Once it's 7x = 15 - 4/5, just simplify the right side before dividing by 7." }
      ]
    },
    q3: {
      subject: "Chemistry",
      subjectTint: "#8b5cf6",
      grade: "Grade 10",
      time: "2 hours ago",
      status: "answered",
      avatar: "A",
      title: "What is the balanced chemical equation for photosynthesis?",
      desc: "I keep forgetting the coefficients. Can someone help?",
      tags: ["#Chemistry", "#Photosynthesis", "#Biology"],
      comments: [
        { name: "Maria Santos", badge: "Top Contributor", time: "1 hour ago", likes: 9,
          html: "It's <code>6CO\u2082 + 6H\u2082O + light \u2192 C\u2086H\u2081\u2082O\u2086 + 6O\u2082</code>." },
        { name: "Kenneth Lee", time: "35 mins ago", likes: 3,
          html: "Just remember the pattern 6-6-1-6, it makes the coefficients easy to recall." }
      ]
    },
    q4: {
      subject: "Biology",
      subjectTint: "#2e9e5b",
      grade: "Grade 12",
      time: "3 hours ago",
      status: "unanswered",
      avatar: "R",
      title: "What are the functions of mitochondria in a cell?",
      desc: "I need a simple explanation for my biology assignment.",
      tags: ["#Biology", "#Cells", "#Mitochondria"],
      comments: [
        { name: "John Cruz", time: "2 hours ago", likes: 5,
          html: "Mitochondria produce ATP through cellular respiration \u2014 they're the cell's energy source." },
        { name: "Kent Morales", time: "1 hour ago", likes: 2,
          html: "Think of it as the cell's power plant." }
      ]
    }
  };

  var subjectMeta = {
    mathematics: { label: "Mathematics", tint: "#e7833b" },
    physics: { label: "Physics", tint: "#3d6bf0" },
    chemistry: { label: "Chemistry", tint: "#8b5cf6" },
    biology: { label: "Biology", tint: "#2e9e5b" },
    english: { label: "English", tint: "#e0556f" }
  };

  var heartIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.8 4.5 5.2 3.6c2.1-.5 4.1.4 5.3 2.1a1 1 0 0 0 1.6 0c1.2-1.7 3.2-2.6 5.3-2.1 3.4.9 4.8 4.4 3.2 7.6-2.5 4.7-10 9.3-10 9.3Z"/></svg>';

  var checkIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L19 7"/></svg>';
  var dotIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';

  document.addEventListener("DOMContentLoaded", function () {
    initQuestionTabs();
    initDropdownFilters();
    initLikeButtons();
    initQuestionModal();
    initAskModal();
  });

  /* ---------------------------------------------------------
     Combined filter/sort state driving the question list
  --------------------------------------------------------- */
  var filterState = { status: "all", grade: "all", subject: "all", sort: "latest" };

  function applyFilters() {
    var list = document.getElementById("questionList");
    var emptyMsg = document.getElementById("questionsEmpty");
    if (!list) return;
    var rows = Array.prototype.slice.call(list.querySelectorAll(".question-row"));

    // Sort (all rows, visible or not, so hidden state is preserved after reorder)
    rows.sort(function (a, b) {
      if (filterState.sort === "latest") {
        return (parseFloat(a.dataset.timestamp) || 0) - (parseFloat(b.dataset.timestamp) || 0);
      }
      if (filterState.sort === "oldest") {
        return (parseFloat(b.dataset.timestamp) || 0) - (parseFloat(a.dataset.timestamp) || 0);
      }
      if (filterState.sort === "most-liked") {
        var likeA = a.querySelector(".like-btn");
        var likeB = b.querySelector(".like-btn");
        return (parseInt(likeB && likeB.dataset.count, 10) || 0) - (parseInt(likeA && likeA.dataset.count, 10) || 0);
      }
      if (filterState.sort === "most-answers") {
        return (parseInt(b.dataset.answers, 10) || 0) - (parseInt(a.dataset.answers, 10) || 0);
      }
      return 0;
    });

    rows.forEach(function (row) { list.appendChild(row); });

    // Filter
    var visibleCount = 0;
    rows.forEach(function (row) {
      var matchesStatus =
        filterState.status === "all" ? true :
        filterState.status === "mine" ? row.dataset.mine === "true" :
        row.dataset.status === filterState.status;

      var matchesGrade = filterState.grade === "all" || row.dataset.grade === filterState.grade;
      var matchesSubject = filterState.subject === "all" || row.dataset.subject === filterState.subject;

      var show = matchesStatus && matchesGrade && matchesSubject;
      row.hidden = !show;
      if (show) visibleCount++;
    });

    if (emptyMsg) emptyMsg.hidden = visibleCount !== 0;
  }

  /* ---------------------------------------------------------
     Status tabs: All / Unanswered / Answered / My Questions
  --------------------------------------------------------- */
  function initQuestionTabs() {
    var tabs = document.querySelectorAll(".questions-tab");
    if (!tabs.length) return;

    var labelToStatus = {
      "all": "all",
      "unanswered": "unanswered",
      "answered": "answered",
      "my questions": "mine"
    };

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          t.classList.remove("is-active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");

        var key = tab.textContent.trim().toLowerCase();
        filterState.status = labelToStatus[key] || "all";
        applyFilters();
      });
    });
  }

  /* ---------------------------------------------------------
     Dropdown filters: Grade / Subject / Sort
  --------------------------------------------------------- */
  function initDropdownFilters() {
    var dropdowns = document.querySelectorAll(".dropdown-filter");
    if (!dropdowns.length) return;

    dropdowns.forEach(function (dropdown) {
      var key = dropdown.dataset.filter;
      var toggleBtn = dropdown.querySelector(".filter-select");
      var label = toggleBtn.querySelector(".filter-select__label");
      var menu = dropdown.querySelector(".dropdown-filter__menu");
      var options = dropdown.querySelectorAll(".dropdown-filter__option");

      toggleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOpen = !menu.hidden;
        closeAllDropdowns();
        if (!isOpen) {
          menu.hidden = false;
          toggleBtn.setAttribute("aria-expanded", "true");
        }
      });

      options.forEach(function (opt) {
        opt.addEventListener("click", function () {
          options.forEach(function (o) { o.classList.remove("is-active"); });
          opt.classList.add("is-active");
          label.textContent = opt.textContent;
          filterState[key] = opt.dataset.value;
          closeAllDropdowns();
          applyFilters();
        });
      });
    });

    document.addEventListener("click", closeAllDropdowns);

    function closeAllDropdowns() {
      dropdowns.forEach(function (dropdown) {
        var menu = dropdown.querySelector(".dropdown-filter__menu");
        var toggleBtn = dropdown.querySelector(".filter-select");
        menu.hidden = true;
        toggleBtn.setAttribute("aria-expanded", "false");
      });
    }
  }

  /* ---------------------------------------------------------
     Like (heart) buttons on question rows
  --------------------------------------------------------- */
  function initLikeButtons() {
    document.querySelectorAll(".like-btn").forEach(function (btn) {
      if (!btn.querySelector(".like-btn__icon")) {
        btn.insertAdjacentHTML("afterbegin", heartIcon);
      }
    });

    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".like-btn");
      if (btn) toggleLike(btn);
    });
  }

  function toggleLike(btn) {
    var base = parseInt(btn.dataset.count, 10) || 0;
    var liked = btn.getAttribute("aria-pressed") === "true";
    var countEl = btn.querySelector(".like-btn__count");

    liked = !liked;
    btn.setAttribute("aria-pressed", String(liked));
    btn.classList.toggle("is-liked", liked);
    if (countEl) countEl.textContent = liked ? base + 1 : base;
  }

  /* ---------------------------------------------------------
     Question detail modal
  --------------------------------------------------------- */
  function initQuestionModal() {
    var modal = document.getElementById("questionModal");
    var content = document.getElementById("modalQuestionContent");
    var backBtn = document.getElementById("modalBackBtn");
    var cancelBtn = document.getElementById("answerCancelBtn");
    var postBtn = document.getElementById("answerPostBtn");
    var textarea = document.getElementById("answerTextarea");
    if (!modal || !content) return;

    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".question-row__action");
      if (!btn) return;
      var row = btn.closest(".question-row");
      var id = row ? row.dataset.questionId : null;
      var data = questionsData[id];
      if (!data) return;
      openModal(id, data);
    });

    if (backBtn) backBtn.addEventListener("click", closeModal);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });

    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        if (textarea) textarea.value = "";
      });
    }

    if (postBtn) {
      postBtn.addEventListener("click", function () {
        postAnswer(modal);
      });
    }

    // Toolbar: simple markdown-style wrapping/insertion on the textarea
    document.querySelectorAll(".toolbar-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyFormat(btn.dataset.format);
      });
    });

    // Delegate comment "like" (thumbs up) and reply-thread clicks since comments are rendered dynamically
    content.addEventListener("click", function (e) {
      var likeBtn = e.target.closest(".comment-like-btn");
      if (likeBtn) { toggleCommentLike(likeBtn); return; }

      var replyToggle = e.target.closest(".comment-reply");
      if (replyToggle) { toggleReplyForm(replyToggle.dataset.replyToggle); return; }

      var replyCancel = e.target.closest("[data-reply-cancel]");
      if (replyCancel) { hideReplyForm(replyCancel.dataset.replyCancel); return; }

      var replyPost = e.target.closest("[data-reply-post]");
      if (replyPost) { postReply(replyPost.dataset.replyPost); return; }
    });

    function openModal(id, data) {
      modal.dataset.activeId = id;
      content.innerHTML = renderQuestion(data);
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      window.scrollTo(0, 0);
      if (textarea) textarea.value = "";
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function applyFormat(kind) {
      if (!textarea) return;
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var value = textarea.value;
      var selected = value.slice(start, end);

      if (kind === "bold") {
        insert("**" + (selected || "bold text") + "**");
      } else if (kind === "italic") {
        insert("*" + (selected || "italic text") + "*");
      } else if (kind === "list") {
        var lineStart = value.lastIndexOf("\n", start - 1) + 1;
        textarea.value = value.slice(0, lineStart) + "- " + value.slice(lineStart);
        textarea.focus();
      }

      function insert(text) {
        textarea.value = value.slice(0, start) + text + value.slice(end);
        textarea.focus();
        textarea.selectionStart = start;
        textarea.selectionEnd = start + text.length;
      }
    }

    function postAnswer(modalEl) {
      if (!textarea || !textarea.value.trim()) {
        textarea && textarea.focus();
        return;
      }
      var id = modalEl.dataset.activeId;
      var data = questionsData[id];
      if (!data) return;

      data.comments.unshift({
        name: "You",
        time: "just now",
        likes: 0,
        html: escapeHtml(textarea.value.trim()).replace(/\n/g, "<br>")
      });

      textarea.value = "";
      content.innerHTML = renderQuestion(data);

      // keep the list's "Answers" count roughly in sync
      var row = document.querySelector('.question-row[data-question-id="' + id + '"]');
      if (row) {
        var answerCountEl = row.querySelector(".answer-count");
        var n = data.comments.length;
        if (answerCountEl) {
          answerCountEl.textContent = n + (n === 1 ? " Answer" : " Answers");
        }
        row.dataset.answers = String(n);
        row.dataset.status = "answered";
        var badge = row.querySelector(".status-badge");
        if (badge) {
          badge.className = "status-badge status-badge--answered";
          badge.innerHTML = checkIcon + "Answered";
        }
      }
    }

    function toggleCommentLike(btn) {
      var base = parseInt(btn.dataset.count, 10) || 0;
      var liked = btn.getAttribute("aria-pressed") === "true";
      var countEl = btn.querySelector(".comment-like-btn__count");
      liked = !liked;
      btn.setAttribute("aria-pressed", String(liked));
      btn.classList.toggle("is-liked", liked);
      if (countEl) countEl.textContent = liked ? base + 1 : base;
    }

    function toggleReplyForm(idx) {
      var form = content.querySelector('.reply-form[data-comment-index="' + idx + '"]');
      if (!form) return;
      var isHidden = form.hasAttribute("hidden");
      // close any other open reply forms first
      content.querySelectorAll(".reply-form").forEach(function (f) { f.setAttribute("hidden", ""); });
      if (isHidden) {
        form.removeAttribute("hidden");
        var ta = form.querySelector("textarea");
        if (ta) ta.focus();
      }
    }

    function hideReplyForm(idx) {
      var form = content.querySelector('.reply-form[data-comment-index="' + idx + '"]');
      if (!form) return;
      var ta = form.querySelector("textarea");
      if (ta) ta.value = "";
      form.setAttribute("hidden", "");
    }

    function postReply(idx) {
      var id = modal.dataset.activeId;
      var data = questionsData[id];
      if (!data) return;

      var form = content.querySelector('.reply-form[data-comment-index="' + idx + '"]');
      var ta = form ? form.querySelector("textarea") : null;
      if (!ta || !ta.value.trim()) {
        if (ta) ta.focus();
        return;
      }

      var comment = data.comments[idx];
      if (!comment) return;
      if (!comment.replies) comment.replies = [];
      comment.replies.push({
        name: "You",
        time: "just now",
        html: escapeHtml(ta.value.trim()).replace(/\n/g, "<br>")
      });

      content.innerHTML = renderQuestion(data);
    }
  }

  /* ---------------------------------------------------------
     Ask Your Question modal
  --------------------------------------------------------- */
  var nextQuestionNum = 5;

  function initAskModal() {
    var modal = document.getElementById("askModal");
    var backdrop = document.getElementById("askModalBackdrop");
    var closeBtn = document.getElementById("askModalClose");
    var openBtn = document.getElementById("askQuestionBtn");
    var postBtn = document.getElementById("askPostBtn");
    var errorMsg = document.getElementById("askModalError");

    var subjectSelect = document.getElementById("askSubjectSelect");
    var titleInput = document.getElementById("askTitleInput");
    var descTextarea = document.getElementById("askDescTextarea");
    var descCount = document.getElementById("askDescCount");
    var tagsInput = document.getElementById("askTagsInput");
    var tagsCount = document.getElementById("askTagsCount");

    if (!modal) return;

    if (openBtn) openBtn.addEventListener("click", openAskModal);
    if (closeBtn) closeBtn.addEventListener("click", closeAskModal);
    if (backdrop) backdrop.addEventListener("click", closeAskModal);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeAskModal();
    });

    if (descTextarea && descCount) {
      descTextarea.addEventListener("input", function () {
        descCount.textContent = descTextarea.value.length;
      });
    }

    if (tagsInput && tagsCount) {
      tagsInput.addEventListener("input", function () {
        var count = parseTags(tagsInput.value).length;
        tagsCount.textContent = count + " / 3";
      });
    }

    // Toolbar in the ask-modal editor (bold / italic / lists) — same lightweight
    // markdown-style helper used in the answer composer.
    modal.querySelectorAll(".toolbar-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyAskFormat(btn.dataset.format);
      });
    });

    if (postBtn) postBtn.addEventListener("click", submitQuestion);

    function openAskModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (errorMsg) errorMsg.hidden = true;
    }

    function closeAskModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function resetForm() {
      if (subjectSelect) subjectSelect.value = "";
      if (titleInput) titleInput.value = "";
      if (descTextarea) descTextarea.value = "";
      if (descCount) descCount.textContent = "0";
      if (tagsInput) tagsInput.value = "";
      if (tagsCount) tagsCount.textContent = "0 / 3";
      if (errorMsg) errorMsg.hidden = true;
    }

    function parseTags(raw) {
      return raw.split(",")
        .map(function (t) { return t.trim(); })
        .filter(Boolean)
        .slice(0, 3);
    }

    function applyAskFormat(kind) {
      if (!descTextarea) return;
      var start = descTextarea.selectionStart;
      var end = descTextarea.selectionEnd;
      var value = descTextarea.value;
      var selected = value.slice(start, end);

      if (kind === "bold") {
        insert("**" + (selected || "bold text") + "**");
      } else if (kind === "italic") {
        insert("*" + (selected || "italic text") + "*");
      } else if (kind === "list" || kind === "ordered-list") {
        var lineStart = value.lastIndexOf("\n", start - 1) + 1;
        var prefix = kind === "ordered-list" ? "1. " : "- ";
        descTextarea.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
        descTextarea.focus();
        descTextarea.dispatchEvent(new Event("input"));
      }

      function insert(text) {
        descTextarea.value = value.slice(0, start) + text + value.slice(end);
        descTextarea.focus();
        descTextarea.selectionStart = start;
        descTextarea.selectionEnd = start + text.length;
        descTextarea.dispatchEvent(new Event("input"));
      }
    }

    function submitQuestion() {
      var subjectKey = subjectSelect ? subjectSelect.value : "";
      var title = titleInput ? titleInput.value.trim() : "";
      var desc = descTextarea ? descTextarea.value.trim() : "";

      if (!subjectKey || !title || !desc) {
        if (errorMsg) errorMsg.hidden = false;
        return;
      }
      if (errorMsg) errorMsg.hidden = true;

      var meta = subjectMeta[subjectKey] || { label: subjectKey, tint: "#3d6bf0" };
      var tags = parseTags(tagsInput ? tagsInput.value : []).map(function (t) {
        return "#" + t.replace(/^#/, "");
      });
      if (!tags.length) tags = ["#" + meta.label];

      var id = "q" + (nextQuestionNum++);
      var data = {
        subject: meta.label,
        subjectTint: meta.tint,
        subjectKey: subjectKey,
        grade: "",
        time: "just now",
        status: "unanswered",
        avatar: "Y",
        title: escapeHtml(title),
        desc: escapeHtml(desc),
        tags: tags,
        comments: []
      };
      questionsData[id] = data;

      var list = document.getElementById("questionList");
      if (list) {
        var li = createQuestionRow(id, data);
        list.insertBefore(li, list.firstChild);
      }

      resetForm();
      closeAskModal();
      applyFilters();

      var newRow = document.querySelector('.question-row[data-question-id="' + id + '"]');
      if (newRow) newRow.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function createQuestionRow(id, data) {
    var li = document.createElement("li");
    li.className = "question-row";
    li.dataset.questionId = id;
    li.dataset.status = data.status;
    li.dataset.mine = "true";
    li.dataset.subject = data.subjectKey || "";
    li.dataset.timestamp = "0";
    li.dataset.answers = "0";

    var metaLine =
      '<span class="question-row__subject" style="--subject-tint:' + data.subjectTint + '">' + data.subject + "</span>" +
      '<span class="question-row__dot">&middot;</span>' +
      '<span class="question-row__time">' + data.time + "</span>";

    var tagsHtml = data.tags.map(function (t) {
      return '<span class="tag" style="--tag-tint:' + data.subjectTint + '">' + t + "</span>";
    }).join("");

    li.innerHTML =
      '<span class="question-row__avatar" style="--avatar-tint:' + data.subjectTint + '" aria-hidden="true">' + data.avatar + "</span>" +
      '<div class="question-row__body">' +
        '<div class="question-row__top">' +
          '<span class="question-row__meta-line">' + metaLine + "</span>" +
          '<span class="status-badge status-badge--unanswered">' + dotIcon + "Unanswered</span>" +
        "</div>" +
        '<p class="question-row__text">' + data.title + "</p>" +
        '<p class="question-row__desc">' + data.desc + "</p>" +
        '<div class="question-row__tags">' + tagsHtml + "</div>" +
        '<div class="question-row__footer">' +
          '<button class="like-btn" type="button" aria-pressed="false" data-count="0">' + heartIcon + '<span class="like-btn__count">0</span></button>' +
          '<span class="stat-count"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.6-.8L3 20l1-5.4A8.5 8.5 0 1 1 21 11.5Z"/></svg><span class="answer-count">0 Answers</span></span>' +
          '<button class="btn btn--outline btn--sm question-row__action" type="button">Answer</button>' +
        "</div>" +
      "</div>";

    return li;
  }

  function renderQuestion(data) {
    var statusHtml = data.status === "answered"
      ? '<span class="status-badge status-badge--answered">' + checkIcon + "Answered</span>"
      : '<span class="status-badge status-badge--unanswered">' + dotIcon + "Unanswered</span>";

    var tagsHtml = data.tags.map(function (t) {
      return '<span class="tag" style="--tag-tint:' + data.subjectTint + '">' + t + "</span>";
    }).join("");

    var commentsHtml = data.comments.map(renderComment).join("");

    var gradeHtml = data.grade
      ? '<span class="question-row__dot">&middot;</span><span class="question-row__grade">' + data.grade + "</span>"
      : "";

    return (
      '<div class="question-row__top">' +
        '<span class="question-row__meta-line">' +
          '<span class="question-row__subject" style="--subject-tint:' + data.subjectTint + '">' + data.subject + "</span>" +
          gradeHtml +
          '<span class="question-row__dot">&middot;</span>' +
          '<span class="question-row__time">' + data.time + "</span>" +
        "</span>" +
        statusHtml +
      "</div>" +
      '<div class="modal-question__head">' +
        '<span class="question-row__avatar" style="--avatar-tint:' + data.subjectTint + '" aria-hidden="true">' + data.avatar + "</span>" +
        "<div>" +
          '<p class="question-row__text">' + data.title + "</p>" +
          '<p class="question-row__desc">' + data.desc + "</p>" +
        "</div>" +
      "</div>" +
      '<div class="question-row__tags">' + tagsHtml + "</div>" +
      '<div class="modal-comments">' +
        '<div class="modal-comments__head">' +
          '<h2 class="modal-comments__title">Comments (' + data.comments.length + ")</h2>" +
          '<button class="filter-select" type="button">Newest' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
          "</button>" +
        "</div>" +
        '<ul class="comment-list">' + commentsHtml + "</ul>" +
      "</div>"
    );
  }

  function renderComment(c, idx) {
    var badgeHtml = c.badge ? '<span class="badge-contributor">' + c.badge + "</span>" : "";
    var repliesHtml = (c.replies && c.replies.length)
      ? '<ul class="comment-replies">' + c.replies.map(renderReply).join("") + "</ul>"
      : "";

    return (
      '<li class="comment-item">' +
        '<span class="comment-item__avatar" aria-hidden="true">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5"/></svg>' +
        "</span>" +
        '<div class="comment-item__body">' +
          '<div class="comment-item__head">' +
            '<span class="comment-item__name">' + c.name + "</span>" +
            badgeHtml +
            '<span class="comment-item__time">' + c.time + "</span>" +
            '<button class="comment-item__menu" type="button" aria-label="More options">&#8942;</button>' +
          "</div>" +
          '<div class="comment-item__text">' + wrapCode(c.html) + "</div>" +
          '<div class="comment-item__footer">' +
            '<button class="comment-like-btn" type="button" aria-pressed="false" data-count="' + c.likes + '">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-8a2 2 0 0 1 3.6 1.2L14.5 8H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 19H10a3 3 0 0 1-3-3v-5Z"/></svg>' +
              '<span class="comment-like-btn__count">' + c.likes + "</span>" +
            "</button>" +
            '<button class="comment-reply" type="button" data-reply-toggle="' + idx + '">Reply</button>' +
          "</div>" +
          repliesHtml +
          '<div class="reply-form" data-comment-index="' + idx + '" hidden>' +
            '<textarea class="reply-form__textarea" placeholder="Write a reply..."></textarea>' +
            '<div class="reply-form__actions">' +
              '<button class="btn btn--outline btn--sm" type="button" data-reply-cancel="' + idx + '">Cancel</button>' +
              '<button class="btn btn--accent-blue btn--sm" type="button" data-reply-post="' + idx + '">Reply</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</li>"
    );
  }

  function renderReply(r) {
    return (
      '<li class="reply-item">' +
        '<span class="reply-item__avatar" aria-hidden="true">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5"/></svg>' +
        "</span>" +
        '<div class="reply-item__body">' +
          '<div class="reply-item__head">' +
            '<span class="reply-item__name">' + r.name + "</span>" +
            '<span class="reply-item__time">' + r.time + "</span>" +
          "</div>" +
          '<div class="reply-item__text">' + wrapCode(r.html) + "</div>" +
        "</div>" +
      "</li>"
    );
  }

  function wrapCode(html) {
    return html.replace(/<code>(.*?)<\/code>/g, '<code class="comment-item__code">$1</code>');
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();