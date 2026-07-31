// ===================== SCHOOL PROFILE =====================
(function () {
  // Shared data source (js/notes-data.js) — same notes used by browse.js,
  // so both pages stay in sync. Swap this for a real API call later.
  const source = window.OlongNotes || { notes: [], subjectLabels: {} };
  const docsData = source.notes || [];
  const subjectLabels = source.subjectLabels || {};

  const categoryGradeMap = {
    "colleges": "College Level",
    "state-universities": "College Level",
    "universities": "College Level",
    "private": "Grade 7 - 12",
    "public": "Grade 7 - 12",
    "international": "Grade 7 - 12",
    "all": "Grade 7 - 12",
  };

  const subjectList = document.getElementById("subjectList");
  const subjectSearchInput = document.getElementById("subjectSearchInput");
  const docGrid = document.getElementById("docGrid");
  const docEmpty = document.getElementById("docEmpty");

  const state = { subject: "all", search: "" };
  let schoolInfo = { name: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level" };

  const fileIconMarkup = `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="doc-card__file-icon">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>
      <path d="M14 3v5h5"/>
      <path d="M9 12h6M9 15.5h6M9 8.8h2.5"/>
    </svg>`;

  const starIconMarkup = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m12 2.5 3 6.4 6.9.9-5 5 1.2 6.9-6.1-3.3-6.1 3.3 1.2-6.9-5-5 6.9-.9Z"/></svg>`;

  const downloadIconMarkup = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/></svg>`;

  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }

  function loadSchoolInfo() {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("name") || "Gordon College";
    const location = params.get("location") || "Olongapo City, Philippines";
    const category = params.get("category") || "colleges";
    const gradeLevel = categoryGradeMap[category] || "Grade 7 - 12";

    schoolInfo = { name, location, gradeLevel };

    document.getElementById("schoolHeroTitle").textContent = name;
    document.getElementById("schoolName").textContent = name;
    document.getElementById("schoolLocation").textContent = location;
    document.getElementById("schoolInitials").textContent = initials(name);
  }

  function getFilteredDocs() {
    return docsData.filter((doc) => {
      const matchesSubject = state.subject === "all" || doc.subject === state.subject;
      const matchesSearch =
        !state.search ||
        doc.topic.toLowerCase().includes(state.search.toLowerCase()) ||
        doc.caption.toLowerCase().includes(state.search.toLowerCase()) ||
        (subjectLabels[doc.subject] || "").toLowerCase().includes(state.search.toLowerCase());
      return matchesSubject && matchesSearch;
    });
  }

  function renderDocs() {
    const results = getFilteredDocs();
    docGrid.innerHTML = "";

    if (results.length === 0) {
      docEmpty.hidden = false;
      return;
    }
    docEmpty.hidden = true;

    results.forEach((doc) => {
      const card = document.createElement("div");
      card.className = "doc-card";
      card.innerHTML = `
        <div class="doc-card__top">
          ${fileIconMarkup}
          <span class="doc-badge doc-badge--${doc.type}">${doc.type.toUpperCase()}</span>
        </div>
        <p class="doc-card__title">${doc.topic}</p>
        <p class="doc-card__caption">${doc.caption}</p>
        <div class="doc-card__tags">
          <span class="doc-card__tag">${schoolInfo.gradeLevel}</span>
        </div>
        <div class="doc-card__author">
          <span class="doc-card__avatar" style="--avatar-tint:${doc.tint}">${initials(doc.author)}</span>
          <span><strong>Author:</strong> ${doc.author}</span>
        </div>
        <div class="doc-card__stats">
          <span class="doc-card__stat doc-card__stat--rating">${starIconMarkup} ${doc.rating} (${doc.ratingCount})</span>
          <span class="doc-card__stat doc-card__stat--downloads">${downloadIconMarkup} ${doc.downloads} downloads</span>
        </div>
        <button class="btn btn--outline btn--sm doc-card__open" type="button">Open File</button>
      `;

      card.querySelector(".doc-card__open").addEventListener("click", () => {
        const params = new URLSearchParams({
          course: subjectLabels[doc.subject] || doc.subject,
          school: schoolInfo.name,
          location: schoolInfo.location,
          author: doc.author,
          topic: doc.topic,
          caption: doc.caption,
          gradeLevel: schoolInfo.gradeLevel,
          type: doc.type,
          rating: doc.rating,
          ratingCount: doc.ratingCount,
          downloads: doc.downloads,
          tint: doc.tint,
        });
        window.location.href = `document-viewer.html?${params.toString()}`;
      });

      docGrid.appendChild(card);
    });
  }

  // Subject filter
  subjectList.addEventListener("click", (e) => {
    const btn = e.target.closest(".subject-list__item");
    if (!btn) return;
    subjectList.querySelectorAll(".subject-list__item").forEach((el) => el.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.subject = btn.dataset.subject;
    renderDocs();
  });

  // Subject search — filters the sidebar subject list itself
  subjectSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    subjectList.querySelectorAll(".subject-list__item").forEach((btn) => {
      const li = btn.parentElement;
      const isAll = btn.dataset.subject === "all";
      const matches = isAll || btn.textContent.toLowerCase().includes(query);
      li.hidden = !matches;
    });
  });

  loadSchoolInfo();
  renderDocs();
})();