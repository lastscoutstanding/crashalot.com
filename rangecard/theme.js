/* theme.js — Range Card
 *
 * Two jobs:
 *   1. Put the stored theme on <html> as early as possible. The inline snippet
 *      from the README goes at the top of <head>, before theme.css, otherwise
 *      you get a flash of the wrong theme on every page load.
 *   2. Drive the theme switch in the header.
 *
 * To add a theme: one block in theme.css and one line in THEMES.
 */
(function (global) {
  'use strict';

  var KEY = 'rc.theme';

  var THEMES = [
    { id: 'field', label: 'Field', chrome: '#14160F' },
    { id: 'night', label: 'Night', chrome: '#0B0E12' }
  ];

  function isKnown(id) {
    return THEMES.some(function (t) { return t.id === id; });
  }

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return isKnown(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') || THEMES[0].id;
  }

  function apply(id, persist) {
    if (!isKnown(id)) id = THEMES[0].id;
    document.documentElement.setAttribute('data-theme', id);

    var theme = THEMES.filter(function (t) { return t.id === id; })[0];
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.chrome);

    if (persist !== false) {
      try { localStorage.setItem(KEY, id); } catch (e) {}
    }

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-theme-button]'),
      function (btn) {
        btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme-button') === id));
      }
    );

    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: id } }));
  }

  // Builds the switch inside every element carrying data-theme-switch.
  function mount() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-theme-switch]'),
      function (host) {
        if (host.dataset.mounted) return;
        host.dataset.mounted = '1';
        host.className = (host.className ? host.className + ' ' : '') + 'theme-switch';
        host.setAttribute('role', 'group');
        host.setAttribute('aria-label', 'Color theme');

        THEMES.forEach(function (t) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = t.label;
          btn.setAttribute('data-theme-button', t.id);
          btn.setAttribute('aria-pressed', String(t.id === current()));
          btn.addEventListener('click', function () { apply(t.id, true); });
          host.appendChild(btn);
        });
      }
    );
  }

  // Other tabs on the same origin follow the switch.
  global.addEventListener('storage', function (e) {
    if (e.key === KEY && isKnown(e.newValue)) apply(e.newValue, false);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  global.Theme = {
    apply: apply,
    current: current,
    stored: stored,
    list: THEMES,
    key: KEY
  };
})(window);
