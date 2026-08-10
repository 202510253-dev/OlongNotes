/* =========================================================
   OLONGNOTES — SHARED AVATAR HELPER
   ---------------------------------------------------------
   One renderAvatar() helper used by every Q&A page (feed,
   question detail, edit modal, etc.) so the colored initials
   fallback and the uploaded-photo branch live in a single
   place. Pre-avatar, each page duplicated its own
   tint()/initials() logic; this consolidates them and adds
   the avatar_url case on top without changing anything else.

   Usage:
     // Anywhere a user object has user_name + optional avatar_url:
     window.OlongNotes.shared.renderAvatar(user, { variant: 'row' })
     window.OlongNotes.shared.renderAvatar(user, { variant: 'comment' })
     window.OlongNotes.shared.renderAvatar(user, { variant: 'modal' })

   Variants map to the existing CSS:
     - 'row'    → .question-row__avatar  (36px, tinted initials bg)
     - 'comment'→ .comment-item__avatar  (36px, plain navy-100 bg)
     - 'modal'  → .ask-modal__avatar     (40px, tinted initials bg)

   The helper accepts ANY user-shaped object. It reads
   `user_name` for the initials fallback and `avatar_url` for
   the photo branch. If the photo branch is taken, the existing
   `--avatar-tint` CSS var is irrelevant for that element (the
   <img> covers it) but is left in place so surrounding rules
   that read it elsewhere keep working.

   Load order: include AFTER js/api.js (so window.OlongNotes
   exists) and BEFORE any page JS that calls renderAvatar().
========================================================= */
(function () {
  'use strict';

  const ON = (window.OlongNotes = window.OlongNotes || {});
  const esc = ON.escapeHtml || ((s) => String(s == null ? '' : s));

  // Subject/name tint palette — matches the duplicated blocks in
  // browse-community.js / question-detail.js so the fallback circle
  // color is identical to what the pages were rendering before.
  const TINT_PALETTE = ['#3d6bf0', '#e7833b', '#8b5cf6', '#2e9e5b', '#e0556f', '#e0b23c', '#0ea5e9', '#a855f7'];
  function tintFor(name) {
    if (!name) return '#3d6bf0';
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return TINT_PALETTE[h % TINT_PALETTE.length];
  }
  function initialsFor(name) {
    return (name && name.trim ? name.trim().charAt(0).toUpperCase() : '?');
  }

  // Variant → CSS class + bg-tint behavior + inner fallback content.
  //   row:     tinted-bg circle (subject tint drives the color)
  //   comment: navy-100-bg circle with a generic person icon
  //   modal:   tinted-bg circle, slightly larger
  //
  // The photo branch overrides whatever inner fallback the variant
  // defines — a real <img> fills the same circular frame.
  const VARIANTS = {
    row: {
      cls: 'question-row__avatar',
      // Tinted bg + single letter (mirrors browse-community.js renderQuestionRow).
      fallback: (name) => esc(initialsFor(name)),
      tinted: true,
    },
    comment: {
      cls: 'comment-item__avatar',
      // Plain navy-100 bg + tiny person-outline SVG (mirrors
      // question-detail.js renderAnswer — the answer-row avatar was
      // an SVG icon, NOT initials, so the no-avatar fallback here
      // matches that exactly).
      fallback: (name) =>
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">' +
          '<circle cx="12" cy="8" r="3.5"/>' +
          '<path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5"/>' +
        '</svg>',
      tinted: false,
    },
    modal: {
      cls: 'ask-modal__avatar',
      fallback: (name) => esc(initialsFor(name)),
      tinted: true,
    },
  };

  /**
   * renderAvatar(user, options) → string
   *
   *   user:      { user_name?: string, avatar_url?: string|null }
   *   options:   { variant: 'row' | 'comment' | 'modal', tint?: string }
   *              `tint` overrides the computed name-tint (the feed
   *              passes a subject-tint so avatars match their question's
   *              subject color; the question-detail page does the same).
   *
   * Returns the HTML string for an avatar circle that either shows
   * the user's uploaded photo (object-fit: cover, same size + border-
   * radius as the existing circle) OR the existing fallback. The
   * element is wrapped in aria-hidden="true" because the user's name
   * is always rendered alongside it as text.
   */
  function renderAvatar(user, options) {
    const opts = options || {};
    const variant = VARIANTS[opts.variant] || VARIANTS.row;
    const u = user || {};
    const name = u.user_name || '';
    const avatar = u.avatar_url;
    const tint = opts.tint || tintFor(name);

    if (avatar && typeof avatar === 'string' && avatar.trim().length > 0) {
      // Photo branch — <img> filling the same circular frame. We keep
      // the wrapper span (same class, same aria-hidden) so any CSS or
      // JS that targets `.question-row__avatar` etc. still matches.
      // The <img> uses object-fit: cover via inline style so it works
      // without relying on a CSS file edit. The wrapper gets an
      // explicit background the same as the existing circle so the
      // image has a solid backdrop during load and when transparent.
      const photoBg = variant.tinted ? esc(tint) : 'var(--navy-100, #eef1f6)';
      return (
        '<span class="' + variant.cls + ' question-row__avatar--photo" ' +
              'style="--avatar-tint:' + esc(tint) + ';background:' + photoBg + '" aria-hidden="true">' +
          '<img class="question-avatar__img" src="' + esc(avatar) + '" alt="" ' +
               'style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block" />' +
        '</span>'
      );
    }

    // Fallback branch — the existing markup, unchanged.
    return (
      '<span class="' + variant.cls + '" style="--avatar-tint:' + esc(tint) + '" aria-hidden="true">' +
        variant.fallback(name) +
      '</span>'
    );
  }

  // Expose on the shared namespace — community-shared.js uses the
  // same `window.OlongNotes.shared.*` pattern, so consumers can call
  // either helper through one surface.
  ON.shared = ON.shared || {};
  ON.shared.renderAvatar = renderAvatar;
  ON.shared.tintFor = tintFor;
})();