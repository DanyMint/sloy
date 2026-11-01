(function () {
  'use strict';
  const key = 'kontur-color-theme';
  const choices = ['system', 'light', 'dark'];
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { const saved = localStorage.getItem(key); if (choices.includes(saved)) preference = saved; } catch {}
  function apply(announce = false) {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#1c1924' : '#fcfcfd';
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(theme === 'dark'));
      toggle.title = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
    }
    const label = document.getElementById('theme-label');
    if (label) label.textContent = theme === 'dark' ? 'Тёмная' : 'Светлая';
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerHTML = theme === 'dark'
      ? '<path d="M20.8 13.4A9 9 0 0 1 10.6 3.2 9 9 0 1 0 20.8 13.4Z"/>'
      : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>';
    const status = document.getElementById('theme-status');
    if (status && announce) status.textContent = (theme === 'dark' ? 'Тёмная тема' : 'Светлая тема') + (preference === 'system' ? ', по настройке системы' : '');
  }
  apply();
  document.addEventListener('DOMContentLoaded', function () {
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.addEventListener('click', function () {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch {}
      apply(true);
    });
    apply();
  });
  system.addEventListener('change', function () { if (preference === 'system') apply(true); });
  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) {
      preference = choices.includes(event.newValue) ? event.newValue : 'system';
      apply(true);
    }
  });
}());
