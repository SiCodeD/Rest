// Lucide icons initializer (local, offline-first).
// Depends on: js/vendor/lucide.min.js (UMD, copied from npm package `lucide`).
// Usage: <i data-lucide="house"></i> then window.refreshLucideIcons().
(function () {
  'use strict';

  // Material Symbols -> Lucide map (for dynamic icon names coming from JS data).
  var MATERIAL_TO_LUCIDE = {
    add: 'plus',
    alarm: 'alarm-clock',
    analytics: 'chart-line',
    arrow_back: 'arrow-left',
    autorenew: 'refresh-cw',
    badge: 'badge',
    calendar_month: 'calendar-days',
    campaign: 'megaphone',
    cancel: 'circle-x',
    category: 'layout-grid',
    chat_bubble: 'message-circle',
    check: 'check',
    check_circle: 'circle-check',
    close: 'x',
    cloud_off: 'cloud-off',
    cloud_upload: 'cloud-upload',
    colorize: 'pipette',
    content_copy: 'copy',
    contrast: 'contrast',
    dark_mode: 'moon',
    delete: 'trash-2',
    delivery_dining: 'bike',
    done: 'check',
    download: 'download',
    edit: 'pencil',
    error: 'circle-alert',
    event_available: 'calendar-check',
    expand_more: 'chevron-down',
    fastfood: 'sandwich',
    fiber_new: 'sparkles',
    filter_list: 'list-filter',
    group_add: 'user-plus',
    group_off: 'user-x',
    groups: 'users',
    help: 'circle-help',
    home: 'house',
    info: 'info',
    language: 'languages',
    light_mode: 'sun',
    local_dining: 'utensils-crossed',
    local_fire_department: 'flame',
    lock_reset: 'key-round',
    logout: 'log-out',
    mail: 'mail',
    menu: 'menu',
    menu_book: 'book-open',
    monitoring: 'activity',
    notifications: 'bell',
    notifications_active: 'bell-ring',
    notifications_none: 'bell-off',
    open_in_new: 'external-link',
    palette: 'palette',
    payments: 'wallet',
    pending_actions: 'history',
    percent: 'percent',
    person: 'user',
    person_add: 'user-plus',
    person_check: 'user-check',
    person_off: 'user-x',
    pie_chart: 'chart-pie',
    point_of_sale: 'store',
    preview: 'eye',
    print: 'printer',
    progress_activity: 'loader-circle',
    qr_code_2: 'qr-code',
    qr_code_scanner: 'scan-line',
    receipt_long: 'receipt-text',
    refresh: 'refresh-cw',
    request_quote: 'file-text',
    restart_alt: 'rotate-ccw',
    restaurant: 'utensils',
    restaurant_menu: 'notebook-text',
    room_service: 'concierge-bell',
    save: 'save',
    schedule: 'clock',
    search: 'search',
    settings: 'settings',
    share: 'share-2',
    shield: 'shield',
    soup_kitchen: 'soup',
    speed: 'gauge',
    sticky_note_2: 'sticky-note',
    swap_vert: 'arrow-up-down',
    table_bar: 'martini',
    table_restaurant: 'armchair',
    task_alt: 'circle-check-big',
    verified: 'badge-check',
    verified_user: 'shield-check',
    visibility: 'eye',
    warning: 'triangle-alert',
  };
  window.MATERIAL_TO_LUCIDE = MATERIAL_TO_LUCIDE;

  function resolveName(name) {
    if (!name) return 'circle-help';
    var key = String(name).trim();
    if (MATERIAL_TO_LUCIDE[key]) return MATERIAL_TO_LUCIDE[key];
    // Already a lucide name? use as-is (createIcons warns if unknown).
    return key;
  }

  // Build an icon placeholder string for dynamic innerHTML templates.
  // Usage: el.innerHTML = window.lucideIcon(s.icon) + label;
  function lucideIcon(name, extraClass) {
    var cls = 'lucide-icon' + (extraClass ? ' ' + extraClass : '');
    return (
      '<i data-lucide="' +
      resolveName(name) +
      '" class="' +
      cls +
      '"></i>'
    );
  }
  window.lucideIcon = lucideIcon;

  // Swap the icon of an existing element (works for <i data-lucide> and
  // already-rendered <svg class="lucide">). Accepts material OR lucide names.
  function setLucideIcon(el, name) {
    if (!el) return;
    try {
      var fresh = document.createElement('i');
      fresh.setAttribute('data-lucide', resolveName(name));
      // Preserve sizing/positioning classes + inline style + id.
      var keep = [];
      if (el.getAttribute) {
        var c = el.getAttribute('class') || '';
        c.split(/\s+/).forEach(function (tok) {
          if (
            tok &&
            tok !== 'lucide' &&
            tok.indexOf('lucide-') !== 0 &&
            keep.indexOf(tok) === -1
          ) {
            keep.push(tok);
          }
        });
        if (keep.indexOf('lucide-icon') === -1) keep.unshift('lucide-icon');
        fresh.setAttribute('class', keep.join(' '));
        if (el.id) fresh.id = el.id;
        var st = el.getAttribute('style');
        if (st) fresh.setAttribute('style', st);
      }
      el.replaceWith(fresh);
      render(document);
    } catch (err) {
      console.warn('[lucide] setLucideIcon failed:', err);
    }
  }
  window.setLucideIcon = setLucideIcon;

  function render(root) {
    try {
      if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
      // createIcons scans document by default; passing attrs keeps stroke consistent.
      window.lucide.createIcons({
        attrs: { 'stroke-width': 2 },
        root: root || document,
      });
    } catch (err) {
      console.warn('[lucide] createIcons failed:', err);
    }
  }

  function refresh(root) {
    render(root || document);
  }

  window.refreshLucideIcons = refresh;

  function init() {
    render(document);

    // Auto-render icons injected later via innerHTML (dashboard.js, employees.js...).
    // Observes only for unconverted <i data-lucide> nodes to stay cheap.
    try {
      var pending = false;
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node.nodeType !== 1) continue;
            if (
              (node.matches && node.matches('i[data-lucide]')) ||
              (node.querySelector && node.querySelector('i[data-lucide]'))
            ) {
              if (!pending) {
                pending = true;
                requestAnimationFrame(function () {
                  pending = false;
                  render(document);
                });
              }
              return;
            }
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (err) {
      console.warn('[lucide] observer unavailable:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
