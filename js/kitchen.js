/**
 * Mazaq Plus - Kitchen Display System (KDS) Logic
 * System Card Design Matching EduPulse & Admin Dashboard
 */

(function () {
  'use strict';

  // --- KDS State ---
  let kdsState = {
    restaurantId: null,
    orders: [],
    previousOrderIds: new Set(),
    viewMode: 'tickets', // 'tickets' | 'aggregator'
    filterStatus: 'all', // 'all' | 'new' | 'preparing' | 'ready'
    searchQuery: '',
    soundMuted: localStorage.getItem('kds_sound_muted') === 'true',
    timerInterval: null,
    pollingInterval: null,
    realtimeChannel: null,
  };

  // --- Web Audio API Chime Synthesizer ---
  function playKitchenChime() {
    if (kdsState.soundMuted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const now = ctx.currentTime;

      // Tone 1 (High chime)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Tone 2 (Harmonic response)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.15); // A5
      gain2.gain.setValueAtTime(0.4, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.8);

    } catch (e) {
      console.warn('Audio playback failed or muted by browser policy:', e);
    }
  }

  // --- Initialize KDS ---
  async function initKDS() {
    try {
      updateClock();
      setInterval(updateClock, 1000);

      // Verify User & Restaurant Session
      const { data: { session }, error: authErr } = await window.supabase.auth.getSession();
      if (authErr || !session) {
        window.location.href = 'Login.html';
        return;
      }

      // Get user profile restaurant_id
      const { data: profile, error: profErr } = await window.supabase
        .from('profiles')
        .select('restaurant_id, full_name')
        .eq('id', session.user.id)
        .single();

      if (profErr || !profile || !profile.restaurant_id) {
        console.error('Restaurant ID not found for profile');
        return;
      }

      kdsState.restaurantId = profile.restaurant_id;

      // Update Header User Name
      if (profile.full_name) {
        const userNameEl = document.getElementById('headerUserName');
        if (userNameEl) userNameEl.textContent = profile.full_name;
        const avatarEl = document.getElementById('headerAvatar');
        if (avatarEl) avatarEl.textContent = profile.full_name.substring(0, 2);
      }

      // Bind Controls
      bindEventListeners();

      // Load Orders
      await loadKitchenOrders();

      // Timers & Sync
      kdsState.timerInterval = setInterval(renderOrders, 10000);
      setupRealtimeSubscription();
      kdsState.pollingInterval = setInterval(loadKitchenOrders, 5000);

    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  // --- Realtime Subscription ---
  function setupRealtimeSubscription() {
    if (!kdsState.restaurantId) return;

    try {
      kdsState.realtimeChannel = window.supabase
        .channel('kds_orders_channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `restaurant_id=eq.${kdsState.restaurantId}`
          },
          () => {
            loadKitchenOrders();
          }
        )
        .subscribe((status) => {
          const liveIndicator = document.getElementById('kdsLiveStatus');
          if (liveIndicator) {
            liveIndicator.textContent = status === 'SUBSCRIBED' ? 'متصل مباشر' : 'محدث تلقائياً';
          }
        });
    } catch (e) {
      console.warn('Realtime subscription fallback:', e);
    }
  }

  // --- Load Orders ---
  async function loadKitchenOrders() {
    if (!kdsState.restaurantId) return;

    try {
      const { data: ordersData, error: ordersErr } = await window.supabase
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          customer_name,
          notes,
          created_at,
          table_id,
          restaurant_tables ( name, code )
        `)
        .eq('restaurant_id', kdsState.restaurantId)
        .in('status', ['accepted', 'preparing', 'ready'])
        .order('created_at', { ascending: true });

      if (ordersErr) throw ordersErr;

      const activeOrders = ordersData || [];
      const orderIds = activeOrders.map(o => o.id);

      if (orderIds.length === 0) {
        kdsState.orders = [];
        renderOrders();
        return;
      }

      const { data: itemsData, error: itemsErr } = await window.supabase
        .from('order_items')
        .select('id, order_id, item_name, quantity, unit_price')
        .in('order_id', orderIds);

      if (itemsErr) throw itemsErr;

      const itemsByOrder = {};
      (itemsData || []).forEach(item => {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push(item);
      });

      let hasNewOrder = false;
      activeOrders.forEach(o => {
        if (o.status === 'accepted' && !kdsState.previousOrderIds.has(o.id)) {
          hasNewOrder = true;
        }
      });

      kdsState.orders = activeOrders.map(o => ({
        ...o,
        items: itemsByOrder[o.id] || []
      }));

      kdsState.previousOrderIds = new Set(activeOrders.map(o => o.id));

      if (hasNewOrder) {
        playKitchenChime();
      }

      renderOrders();

    } catch (err) {
      console.error('Error loading kitchen orders:', err);
    }
  }

  // --- Render Engine ---
  function renderOrders() {
    updateCounters();

    const mainContainer = document.getElementById('kdsContentArea');
    if (!mainContainer) return;

    // Search & Filter Query
    const q = (kdsState.searchQuery || '').trim().toLowerCase();

    let filtered = kdsState.orders.filter(o => {
      // Status Filter
      if (kdsState.filterStatus === 'new' && o.status !== 'new' && o.status !== 'accepted') return false;
      if (kdsState.filterStatus === 'preparing' && o.status !== 'preparing') return false;
      if (kdsState.filterStatus === 'ready' && o.status !== 'ready') return false;

      // Search Query
      if (q) {
        const orderNum = String(o.order_number || '');
        const tableName = (o.restaurant_tables?.name || '').toLowerCase();
        const custName = (o.customer_name || '').toLowerCase();
        if (!orderNum.includes(q) && !tableName.includes(q) && !custName.includes(q)) {
          return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      mainContainer.innerHTML = `
        <div class="card" style="padding: 3.5rem 1.5rem; text-align: center; color: var(--muted);">
          <span class="material-symbols-outlined" style="font-size: 3.5rem; color: var(--muted); margin-bottom: 0.75rem;">soup_kitchen</span>
          <h3 style="font-size: 1.35rem; color: var(--text); font-weight: 800; margin-bottom: 0.35rem;">لا توجد طلبات نشطة</h3>
          <p>جميع طلبات المطبخ جاري إعدادها أو لا توجد نتائج للبحث المطبق.</p>
        </div>
      `;
      return;
    }

    if (kdsState.viewMode === 'aggregator') {
      renderAggregatorView(mainContainer, filtered);
    } else {
      renderTicketsView(mainContainer, filtered);
    }
  }

  // --- Render System Tickets View ---
  function renderTicketsView(container, orders) {
    const gridHtml = orders.map(order => {
      const elapsedMins = getElapsedMinutes(order.created_at);
      const isDelayed = elapsedMins >= 15;

      let timerClass = 'timer-green';
      if (elapsedMins >= 10 && elapsedMins < 15) timerClass = 'timer-yellow';
      if (elapsedMins >= 15) timerClass = 'timer-red';

      const tableName = order.restaurant_tables?.name || (order.table_id ? `طاولة #${order.table_id.substring(0, 4)}` : 'طلب سفري');

      const itemsHtml = (order.items || []).map(item => `
        <div class="kds-item-box">
          <div class="kds-item-qty">${item.quantity}x</div>
          <div class="kds-item-title">${escapeHtml(item.item_name)}</div>
        </div>
      `).join('');

      let statusClass = 'status-new';
      let dotColor = 'yellow';
      if (order.status === 'preparing') {
        statusClass = 'status-preparing';
        dotColor = 'blue';
      } else if (order.status === 'ready') {
        statusClass = 'status-ready';
        dotColor = 'green';
      }

      let actionBtns = '';
      if (order.status === 'new' || order.status === 'accepted') {
        actionBtns = `
          <button class="btn-primary" style="width: 100%; justify-content: center; font-weight: 800; font-size: 0.95rem; border-radius: 14px; padding: 11px;" onclick="window.kdsAction('${order.id}', 'preparing')">
            <span class="material-symbols-outlined">skillet</span>
            بدء التحضير
          </button>
        `;
      } else if (order.status === 'preparing') {
        actionBtns = `
          <button class="btn-primary" style="flex: 1; justify-content: center; font-weight: 800; font-size: 0.95rem; background: #3b82f6; border-color: #3b82f6; border-radius: 14px; padding: 11px;" onclick="window.kdsAction('${order.id}', 'ready')">
            <span class="material-symbols-outlined">notifications_active</span>
            جاهز للتسليم
          </button>
          <button class="btn-secondary" style="border-radius: 14px; padding: 11px 14px;" title="إعادة للجديد" onclick="window.kdsAction('${order.id}', 'new')">
            <span class="material-symbols-outlined">undo</span>
          </button>
        `;
      } else if (order.status === 'ready') {
        actionBtns = `
          <button class="btn-primary" style="flex: 1; justify-content: center; font-weight: 800; font-size: 0.95rem; background: #10b981; border-color: #10b981; border-radius: 14px; padding: 11px;" onclick="window.kdsAction('${order.id}', 'served')">
            <span class="material-symbols-outlined">done_all</span>
            تم التسليم
          </button>
          <button class="btn-secondary" style="border-radius: 14px; padding: 11px 14px;" title="إعادة للتحضير" onclick="window.kdsAction('${order.id}', 'preparing')">
            <span class="material-symbols-outlined">undo</span>
          </button>
        `;
      }

      return `
        <div class="kds-order-card ${statusClass} ${isDelayed ? 'is-delayed' : ''}">
          <div class="kds-card-head">
            <div class="kds-card-title-group">
              <span class="kds-status-dot ${dotColor}"></span>
              <div class="kds-order-num">طلب #${order.order_number || order.id.substring(0, 5)}</div>
            </div>
            <div class="kds-timer-pill ${timerClass}">
              <span class="material-symbols-outlined text-xs">schedule</span>
              ${elapsedMins} دقيقة
            </div>
          </div>

          <div class="kds-card-meta">
            <div class="kds-meta-tag">
              <span class="material-symbols-outlined text-xs muted">table_restaurant</span>
              <span>${escapeHtml(tableName)}</span>
            </div>
            ${order.customer_name ? `<span>👤 ${escapeHtml(order.customer_name)}</span>` : ''}
          </div>

          <div class="kds-card-body">
            ${itemsHtml}
            ${order.notes ? `
              <div class="kds-notes-box">
                📝 ملاحظة: ${escapeHtml(order.notes)}
              </div>
            ` : ''}
          </div>

          <div class="kds-card-foot">
            ${actionBtns}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="kds-tickets-grid">${gridHtml}</div>`;
  }

  // --- Render Aggregator View ---
  function renderAggregatorView(container, orders) {
    const summary = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const name = item.item_name;
        if (!summary[name]) {
          summary[name] = { count: 0, orderNums: [] };
        }
        summary[name].count += item.quantity;
        summary[name].orderNums.push(`#${order.order_number || order.id.substring(0, 4)}`);
      });
    });

    const keys = Object.keys(summary);
    if (keys.length === 0) {
      container.innerHTML = `<div class="card" style="padding: 3rem; text-align: center;"><h3 style="color: var(--text);">لا توجد أصناف مطلوب إعدادها حالياً</h3></div>`;
      return;
    }

    const cardsHtml = keys.map(itemName => {
      const info = summary[itemName];
      return `
        <div class="kds-agg-card-item">
          <div>
            <div class="kds-agg-number">${info.count}x</div>
            <div class="kds-agg-name">${escapeHtml(itemName)}</div>
          </div>
          <div style="margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center;">
            <span style="font-size: 0.8rem; color: var(--muted); font-weight: 700;">الطلبات: </span>
            ${info.orderNums.map(n => `<span class="kds-agg-tag">${n}</span>`).join(' ')}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="kds-agg-grid">${cardsHtml}</div>`;
  }

  // --- Order Status Update ---
  window.kdsAction = async function (orderId, newStatus) {
    try {
      const { error } = await window.supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      const target = kdsState.orders.find(o => o.id === orderId);
      if (target) target.status = newStatus;

      renderOrders();
    } catch (err) {
      console.error('Error updating order status:', err);
      alert('تعذر تحديث حالة الطلب. يرجى محاولة التحديث مرة أخرى.');
    }
  };

  // --- Update Counter Pills ---
  function updateCounters() {
    let countNew = 0;
    let countPrep = 0;
    let countReady = 0;

    kdsState.orders.forEach(o => {
      if (o.status === 'new' || o.status === 'accepted') countNew++;
      else if (o.status === 'preparing') countPrep++;
      else if (o.status === 'ready') countReady++;
    });

    const elNew = document.getElementById('countNew');
    const elPrep = document.getElementById('countPrep');
    const elReady = document.getElementById('countReady');

    if (elNew) elNew.textContent = countNew;
    if (elPrep) elPrep.textContent = countPrep;
    if (elReady) elReady.textContent = countReady;
  }

  // --- Bind Event Listeners ---
  function bindEventListeners() {
    const btnTickets = document.getElementById('btnViewTickets');
    const btnAggregator = document.getElementById('btnViewAggregator');

    btnTickets?.addEventListener('click', () => {
      kdsState.viewMode = 'tickets';
      btnTickets.classList.add('active');
      btnAggregator?.classList.remove('active');
      renderOrders();
    });

    btnAggregator?.addEventListener('click', () => {
      kdsState.viewMode = 'aggregator';
      btnAggregator.classList.add('active');
      btnTickets?.classList.remove('active');
      renderOrders();
    });

    const selectFilter = document.getElementById('kdsFilterStatus');
    selectFilter?.addEventListener('change', (e) => {
      kdsState.filterStatus = e.target.value;
      renderOrders();
    });

    const searchInput = document.getElementById('kdsSearchInput');
    searchInput?.addEventListener('input', (e) => {
      kdsState.searchQuery = e.target.value;
      renderOrders();
    });

    const btnSound = document.getElementById('btnToggleSound');
    updateSoundBtnUI();

    btnSound?.addEventListener('click', () => {
      kdsState.soundMuted = !kdsState.soundMuted;
      localStorage.setItem('kds_sound_muted', kdsState.soundMuted);
      updateSoundBtnUI();
      if (!kdsState.soundMuted) playKitchenChime();
    });

    document.getElementById('btnRefreshKds')?.addEventListener('click', () => {
      loadKitchenOrders();
    });
  }

  function updateSoundBtnUI() {
    const soundLabel = document.getElementById('soundLabel');
    const btnSound = document.getElementById('btnToggleSound');
    if (!btnSound) return;

    if (kdsState.soundMuted) {
      if (soundLabel) soundLabel.textContent = 'الصوت معطل';
      btnSound.style.opacity = '0.6';
    } else {
      if (soundLabel) soundLabel.textContent = 'الصوت مفعّل';
      btnSound.style.opacity = '1';
    }
  }

  function getElapsedMinutes(createdAt) {
    if (!createdAt) return 0;
    const diffMs = new Date() - new Date(createdAt);
    return Math.max(0, Math.floor(diffMs / 60000));
  }

  function updateClock() {
    const clockEl = document.getElementById('kdsClock');
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKDS);
  } else {
    initKDS();
  }

})();
