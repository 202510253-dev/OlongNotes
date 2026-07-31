// ===================== BROWSE NOTES (BY SUBJECT) =====================
(function () {
  const source = window.OlongNotes || { notes: [], subjectLabels: {} };
  const notesData = source.notes || [];
  const subjectLabels = source.subjectLabels || {};

  const heroTitle = document.getElementById("subjectNotesHeroTitle");
  const heroText = document.getElementById("subjectNotesHeroText");
  const docGrid = document.getElementById("docGrid");
  const docEmpty = document.getElementById("docEmpty");

  // subjects.js links here with the full label (e.g. "Mathematics").
  // school-profile.js style links could instead pass the slug
  // (e.g. "mathematics"). Support either.
  function resolveSubjectSlug(param) {
    if (!param) return null;
    const lower = param.toLowerCase();
    if (subjectLabels[lower]) return lower;
    const bySlugifiedLabel = Object.entries(subjectLabels).find(
      ([, label]) => label.toLowerCase() === lower
    );
    return bySlugifiedLabel ? bySlugifiedLabel[0] : lower.replace(/\s+/g, "-");
  }

  const params = new URLSearchParams(window.location.search);
  const rawSubject = params.get("subject");
  const subjectSlug = resolveSubjectSlug(rawSubject);
  const subjectLabel = subjectLabels[subjectSlug] || rawSubject;

  if (rawSubject) {
    heroTitle.textContent = `${subjectLabel} Notes`;
    heroText.textContent = `High-quality ${subjectLabel} learning materials shared by students and educators.`;
  }

  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }

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

  function getVisibleNotes() {
    if (!rawSubject) return notesData;
    return notesData.filter((note) => note.subject === subjectSlug);
  }

  function renderDocs() {
    const results = getVisibleNotes();
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
          <span class="doc-card__tag">${doc.gradeLevel}</span>
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
        const openParams = new URLSearchParams({
          course: subjectLabels[doc.subject] || doc.subject,
          school: doc.school,
          location: doc.location,
          author: doc.author,
          topic: doc.topic,
          caption: doc.caption,
          gradeLevel: doc.gradeLevel,
          type: doc.type,
          rating: doc.rating,
          ratingCount: doc.ratingCount,
          downloads: doc.downloads,
          tint: doc.tint,
        });
        window.location.href = `document-viewer.html?${openParams.toString()}`;
      });

      docGrid.appendChild(card);
    });
  }

  renderDocs();
})();