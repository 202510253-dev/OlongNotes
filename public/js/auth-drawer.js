// ===================== DRAWER AUTH GATE =====================
// Hides any side-drawer link flagged with `data-requires-auth` when the
// viewer is anonymous (no JWT in localStorage). Shows it again as soon
// as the user signs in.
//
// Why this file exists instead of a flag in script.js:
//   script.js is only loaded on 6 of the 8 pages with a side-drawer.
//   document-viewer.html and recent-activities.html don't load it.
//   This helper is a tiny standalone IIFE that runs on every page
//   that loads api.js, so the same "hide Recent Activities from
//   anonymous viewers" rule applies everywhere.
//
// Wiring:
//   <script src="js/api.js"></script>
//   <script src="js/auth-drawer.js"></script>
//   <a class="side-drawer__link" data-requires-auth href="recent-activities.html">
//     Recent Activities
//   </a>
//
// Events:
//   - Reads token on DOMContentLoaded.
//   - Listens for 'olongnotes:auth-changed' so script.js can re-fire
//     after login / logout and the UI updates without a page reload.

(function () {
  'use strict';

  function apply() {
    const ON = window.OlongNotes || {};
    const has = !!(ON.getToken && ON.getToken());
    const links = document.querySelectorAll('.side-drawer__link[data-requires-auth]');
    links.forEach((el) => {
      // Use the `hidden` attribute — it's semantic, supported by all
      // target browsers, and saved us from a CSS rule. The element
      // also stays in the DOM so screen readers don't lose context.
      el.hidden = !has;
    });
  }

  function init() {
    apply();
    // After login / logout, applyRole() in script.js dispatches this
    // event. We re-evaluate so the link appears immediately rather than
    // after the next page load.
    window.addEventListener('olongnotes:auth-changed', apply);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
