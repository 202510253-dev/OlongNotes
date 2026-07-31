// ===================== SCHOOLS DIRECTORY =====================
(function () {
  const schoolsData = [
    { name: "AMA Computer Learning Center", category: "colleges" },
    { name: "Asinan Elementary School", category: "public" },
    { name: "Aura College", category: "colleges" },
    { name: "Aura De Laurentus Business High School", category: "private" },
    { name: "Balic-Balic Elementary School", category: "public" },
    { name: "Barretto National High School", category: "public" },
    { name: "Bonton Elementary School", category: "public" },
    { name: "Brightfields Montessori School", category: "private" },
    { name: "Christ the King Catholic School", category: "private" },
    { name: "Christian Baptist Academy", category: "private" },
    { name: "City of Olongapo National High School", category: "public" },
    { name: "Columban College Inc. - Asinan", category: "colleges" },
    { name: "East Bajac-Bajac Elementary School", category: "public" },
    { name: "Gordon College", category: "state-universities" },
    { name: "Gordon Heights National High School", category: "public" },
    { name: "Holy Infant Jesus College", category: "colleges" },
    { name: "Ilalim Elementary School", category: "public" },
    { name: "Iram Elementary School", category: "public" },
    { name: "Iram High School", category: "public" },
    { name: "James L. Gordon Integrated School", category: "public" },
    { name: "Juventus School for the Gifted", category: "private" },
    { name: "Kalaklan Elementary School", category: "public" },
    { name: "Kalalake Elementary School", category: "public" },
    { name: "Kalalake National High School", category: "public" },
    { name: "Little Angel Study Center", category: "private" },
    { name: "Mabayuan Elementary School", category: "public" },
    { name: "Mondriaan Montessori School", category: "private" },
    { name: "Nellie E. Brown Elementary School", category: "public" },
    { name: "New Cabalan Elementary School", category: "public" },
    { name: "New Cabalan National School", category: "public" },
    { name: "Olongapo Adventist Elementary School", category: "private" },
    { name: "Olongapo Angelo Cultural School", category: "international" },
    { name: "Ramon Magsaysay Technological University", category: "universities" },
  ].sort((a, b) => a.name.localeCompare(b.name));

  const schoolsList = document.getElementById("schoolsList");
  const schoolsEmpty = document.getElementById("schoolsEmpty");
  const searchInput = document.getElementById("schoolSearchInput");
  const categoryList = document.getElementById("categoryList");
  const letterGrid = document.getElementById("letterGrid");
  const gridViewBtn = document.getElementById("gridViewBtn");
  const listViewBtn = document.getElementById("listViewBtn");
  const viewAllBtn = document.getElementById("viewAllBtn");

  const state = {
    category: "all",
    letter: null,
    search: "",
    view: "list",
  };

  const iconMarkup = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 10 12 5 2 10l10 5 10-5Z"/>
      <path d="M6 12.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"/>
    </svg>`;

  const chevronMarkup = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 6 6 6-6 6"/>
    </svg>`;

  function availableLetters() {
    return new Set(schoolsData.map((s) => s.name[0].toUpperCase()));
  }

  function initLetterAvailability() {
    const letters = availableLetters();
    letterGrid.querySelectorAll(".letter-btn").forEach((btn) => {
      if (!letters.has(btn.dataset.letter)) {
        btn.disabled = true;
      }
    });
  }

  function getFilteredSchools() {
    return schoolsData.filter((school) => {
      const matchesCategory = state.category === "all" || school.category === state.category;
      const matchesLetter = !state.letter || school.name.toUpperCase().startsWith(state.letter);
      const matchesSearch =
        !state.search || school.name.toLowerCase().includes(state.search.toLowerCase());
      return matchesCategory && matchesLetter && matchesSearch;
    });
  }

  function render() {
    const results = getFilteredSchools();

    schoolsList.innerHTML = "";
    schoolsList.classList.toggle("is-grid", state.view === "grid");

    if (results.length === 0) {
      schoolsEmpty.hidden = false;
    } else {
      schoolsEmpty.hidden = true;
      results.forEach((school) => {
        const li = document.createElement("li");
        li.className = "school-row";
        li.tabIndex = 0;
        li.setAttribute("role", "link");
        li.innerHTML = `
          <span class="school-row__icon" aria-hidden="true">${iconMarkup}</span>
          <span class="school-row__name">${school.name}</span>
          <span class="school-row__chevron" aria-hidden="true">${chevronMarkup}</span>
        `;

        const goToProfile = () => {
          const params = new URLSearchParams({
            name: school.name,
            category: school.category,
          });
          window.location.href = `school-profile.html?${params.toString()}`;
        };

        li.addEventListener("click", goToProfile);
        li.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goToProfile();
          }
        });

        schoolsList.appendChild(li);
      });
    }
  }

  // Category filter
  categoryList.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-list__item");
    if (!btn) return;
    categoryList.querySelectorAll(".category-list__item").forEach((el) => el.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.category = btn.dataset.category;
    render();
  });

  // Letter filter (click again to clear)
  letterGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".letter-btn");
    if (!btn || btn.disabled) return;
    const letter = btn.dataset.letter;
    const alreadyActive = btn.classList.contains("is-active");

    letterGrid.querySelectorAll(".letter-btn").forEach((el) => el.classList.remove("is-active"));

    if (alreadyActive) {
      state.letter = null;
    } else {
      btn.classList.add("is-active");
      state.letter = letter;
    }
    render();
  });

  // Live search
  searchInput.addEventListener("input", (e) => {
    state.search = e.target.value.trim();
    render();
  });

  // View toggle
  function setView(view) {
    state.view = view;
    gridViewBtn.classList.toggle("is-active", view === "grid");
    listViewBtn.classList.toggle("is-active", view === "list");
    render();
  }

  gridViewBtn.addEventListener("click", () => setView("grid"));
  listViewBtn.addEventListener("click", () => setView("list"));

  // Reset all filters
  viewAllBtn.addEventListener("click", () => {
    state.category = "all";
    state.letter = null;
    state.search = "";
    searchInput.value = "";
    categoryList.querySelectorAll(".category-list__item").forEach((el, i) => {
      el.classList.toggle("is-active", i === 0);
    });
    letterGrid.querySelectorAll(".letter-btn").forEach((el) => el.classList.remove("is-active"));
    render();
  });

  initLetterAvailability();
  render();
})();