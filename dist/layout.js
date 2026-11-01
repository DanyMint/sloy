(function () {
  'use strict';
  const key = 'kontur-sidebar';
  let compact = false;
  try { compact = localStorage.getItem(key) === 'compact'; } catch {}
  function apply() {
    document.documentElement.dataset.sidebar = compact ? 'compact' : 'expanded';
    const button = document.querySelector('[data-action="toggle-sidebar"]');
    if (button) {
      const label = compact ? 'Развернуть боковую панель' : 'Свернуть боковую панель';
      button.setAttribute('aria-expanded', String(!compact));
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-action="toggle-sidebar"]')) return;
    compact = !compact;
    try { localStorage.setItem(key, compact ? 'compact' : 'expanded'); } catch {}
    apply();
  });
  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) {
      compact = event.newValue === 'compact';
      apply();
    }
  });
}());
