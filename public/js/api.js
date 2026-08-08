// ===================== SHARED API WRAPPER =====================
// Single source of truth for talking to the backend.
// Every page that needs to fetch /api/* goes through apiFetch().
//
// Storage: JWT lives in localStorage under 'olongnotes_token'.
// Base URL: '/api' (relative — same origin as the frontend, so no CORS).
//
// Usage:
//   const notes = await window.OlongNotes.api.get('/notes?limit=4');
//   const note  = await window.OlongNotes.api.get('/notes/123');
//   await window.OlongNotes.api.post('/notes/123/like', null, { auth: true });
//   await window.OlongNotes.api.post('/notes', formData, { auth: true });
//
// Errors: throws ApiError with { status, message, raw }.
//   try { await api.get(...) } catch (e) {
//     if (e.status === 401) { /* force logout */ }
//     else { showInlineError(e.message); }
//   }
//
// Helpers also exposed:
//   window.OlongNotes.getToken() / setToken(t) / clearToken()
//   window.OlongNotes.escapeHtml(str)  -- use this everywhere user/DB
//                                          data hits innerHTML

(function () {
  'use strict';

  const TOKEN_KEY = 'olongnotes_token';
  const BASE = '/api';

  // ---------- Token helpers ----------
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); }
    catch (_) { return null; }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else clearToken();
    } catch (_) { /* private mode / quota — non-fatal */ }
  }

  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); }
    catch (_) { /* non-fatal */ }
  }

  // ---------- Error class ----------
  class ApiError extends Error {
    constructor(status, message, raw) {
      super(message || `Request failed (${status})`);
      this.name = 'ApiError';
      this.status = status;
      this.raw = raw;
    }
  }

  // ---------- Core fetch ----------
  async function apiFetch(path, options = {}) {
    const { method = 'GET', body = null, auth = false, isForm = false } = options;

    const headers = {};
    if (!isForm && body !== null) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth) {
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    let payload = body;
    if (body !== null && !isForm && typeof body !== 'string') {
      payload = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers,
        body: payload,
      });
    } catch (networkErr) {
      // fetch() only rejects on network errors / CORS / abort.
      throw new ApiError(0, 'Network error — please check your connection.', null);
    }

    // 204 No Content (or any empty body) — return null safely.
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch (_) { data = { raw: text }; }
    }

    if (!res.ok) {
      const message =
        (data && (data.error || data.message)) ||
        `Request failed (${res.status})`;
      throw new ApiError(res.status, message, data);
    }

    return data;
  }

// ---------- Convenience methods ----------
  const get  = (path, opts = {}) => apiFetch(path, { ...opts, method: 'GET' });
  const post = (path, body = null, opts = {}) => apiFetch(path, { ...opts, method: 'POST', body });
  const del  = (path, opts = {}) => apiFetch(path, { ...opts, method: 'DELETE', body: null });
  const patch = (path, body = null, opts = {}) => apiFetch(path, { ...opts, method: 'PATCH', body });

  /**
   * Upload helper — wraps apiFetch for multipart/form-data.
   * Pass a FormData instance; auth: true is required for POST /api/notes.
   */
  function upload(path, formData, opts = {}) {
    return apiFetch(path, { ...opts, method: 'POST', body: formData, isForm: true });
  }

  // ---------- escapeHtml (lifted from browse-community.js:765) ----------
  // Used everywhere user/DB data hits innerHTML. Plain text fields should
  // use textContent instead — this is only for mixed HTML strings.
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- Expose on window.OlongNotes ----------
  // Merge with whatever already lives there (e.g. notes-data.js puts
  // subjectLabels and notes on the same namespace).
  window.OlongNotes = window.OlongNotes || {};
window.OlongNotes.api = { get, post, patch, delete: del, upload };
  window.OlongNotes.apiFetch = apiFetch;       // raw, for unusual cases
  window.OlongNotes.ApiError = ApiError;
  window.OlongNotes.getToken = getToken;
  window.OlongNotes.setToken = setToken;
  window.OlongNotes.clearToken = clearToken;
  window.OlongNotes.escapeHtml = escapeHtml;
})();
