// ===================== FILE TYPE ICONS (shared) =====================
// Per-file-type badge color + inner icon, shared by every page that
// renders document cards (notes.js, school-profile.js, subject-notes.js,
// profile-page.js, recent-activities.js).
//
// Background colors reuse the same hex tokens as the homepage
// featured-card icon (script.js) so the badge stays visually consistent
// across the site. The corner <span class="doc-badge"> still shows the
// plain uppercase tag (PDF / IMG / PPTX / DOCX / XLSX) — only the
// rounded-square icon badge itself changes per type.
//
//   PDF    -> red    (#E14B4B)
//   PPTX   -> orange (#F08A3E)
//   DOCX   -> blue   (#2F6FED)
//   XLSX   -> grey   (#6B7280)
//   IMG    -> teal   (#2EA89A)
//   other  -> grey   (#6B7280)
//
// Order matters: image/ is matched by prefix first so an image/png MIME
// doesn't accidentally fall through to one of the substring checks
// below. Word/Sheets include() checks otherwise collide on the
// 'application/' prefix.

(function () {
  'use strict';

  // White-stroked 18×18 icons (match homepage featured-card badge).
  function docSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/></svg>';
  }
  function pdfSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="M9.2 14.5v3M9.2 14.5h1.5a1.1 1.1 0 0 1 0 2.2H9.2M13.4 14.5h1.2a1.6 1.6 0 0 1 0 3.2h-1.2z"/></svg>';
  }
  function slidesSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M9 19h6M12 15.5V19"/></svg>';
  }
  function imageSvg() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 4.5-4.5 4 4 3-3 3.5 3.5"/></svg>';
  }

  // Returns { bg, type, svg } for any MIME string. Falls back to a grey
  // generic-document badge when the type is unknown.
  function fileTypeVisuals(fileType) {
    if (fileType && fileType.startsWith && fileType.startsWith('image/')) {
      return { bg: '#2EA89A', type: 'img', svg: imageSvg() };
    }
    if (fileType && fileType.includes && fileType.includes('pdf')) {
      return { bg: '#E14B4B', type: 'pdf', svg: pdfSvg() };
    }
    if (fileType && fileType.includes && (fileType.includes('powerpoint') || fileType.includes('presentation'))) {
      return { bg: '#F08A3E', type: 'pptx', svg: slidesSvg() };
    }
    if (fileType && fileType.includes && fileType.includes('word')) {
      return { bg: '#2F6FED', type: 'docx', svg: docSvg() };
    }
    if (fileType && fileType.includes && fileType.includes('sheet')) {
      return { bg: '#6B7280', type: 'xlsx', svg: docSvg() };
    }
    return { bg: '#6B7280', type: 'other', svg: docSvg() };
  }

  // Returns the uppercase corner-badge label (PDF / DOCX / XLSX / PPTX
  // / IMG / FILE). Mirrors the same logic notes.js was using.
  function fileTypeBadge(fileType) {
    if (!fileType) return 'FILE';
    if (fileType === 'application/pdf') return 'PDF';
    if (fileType.includes('word')) return 'DOCX';
    if (fileType.includes('sheet')) return 'XLSX';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return 'PPTX';
    if (fileType.includes('image/')) return 'IMG';
    return 'FILE';
  }

  // Ready-to-inject HTML for the rounded-square colored icon badge.
  // Caller passes fileType; we resolve bg + icon + class. Use as:
  //
  //   `<span class="doc-card__file-icon doc-card__file-icon--pdf"
  //          style="--icon-bg:#E14B4B;" aria-hidden="true">${svg}</span>`
  //
  // The `extraClass` param (default "doc-card__file-icon") lets callers
  // that use a different parent card system (e.g. profile-page.js uses
  // .note-card) tag the same wrapper so their own CSS rules apply
  // (size, border-radius) while the per-type color + icon still come
  // from the shared module.
  function fileIconMarkup(fileType, extraClass) {
    const v = fileTypeVisuals(fileType);
    const safeType = String(v.type).replace(/[^a-z0-9_-]/gi, '');
    const safeBg = String(v.bg).replace(/[^#0-9a-fA-F]/g, '');
    const baseClass = extraClass || 'doc-card__file-icon';
    return `<span class="${baseClass} doc-card__file-icon doc-card__file-icon--${safeType}" style="--icon-bg:${safeBg};" aria-hidden="true">${v.svg}</span>`;
  }

  // Mount on the shared OlongNotes namespace so every page can reach it
  // without extra plumbing. Falls back to a window global if api.js
  // hasn't initialized the namespace yet.
  const root = (typeof window !== 'undefined') ? window : {};
  const ON = root.OlongNotes || (root.OlongNotes = {});
  ON.fileTypeVisuals = fileTypeVisuals;
  ON.fileTypeBadge = fileTypeBadge;
  ON.fileIconMarkup = fileIconMarkup;
})();
