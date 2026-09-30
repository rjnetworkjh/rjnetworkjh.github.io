/* RJ NETWORK — Cart + Cash on Delivery checkout + Telegram order notification
   store.html ও product.html দুই পেজেই products.js এর পরে এই ফাইল লোড করতে হবে। */
(function () {
  'use strict';

  /* ========= CONFIG ========= */
  const CFG = {
    TELEGRAM_PROXY_URL: 'https://rj-telegram-proxy.rakibulrabbi-hp.workers.dev/',
    HOTLINE: '09639-019016',
    MAX_QTY: 99,
    COOLDOWN_MS: 20000, // এক অর্ডারের পর পরের অর্ডারের আগে অপেক্ষা (spam ঠেকাতে)
    // Worker কী format নেয় সেটা এখানে বদলালেই হবে
    buildPayload: (text) => ({ text: text, parse_mode: 'HTML' })
  };

  const CART_KEY = 'rj_cart_v1';
  const CUSTOMER_KEY = 'rj_customer_v1';
  const LAST_ORDER_KEY = 'rj_last_order_at';

  /* ========= HELPERS ========= */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const taka = (n) => '৳ ' + Number(n).toLocaleString('en-BD');
  // products.js তে `const PRODUCTS` আছে, যা window.PRODUCTS হয় না — তাই সরাসরি নাম দিয়ে ধরতে হবে
  const products = () => (typeof PRODUCTS !== 'undefined' && Array.isArray(PRODUCTS) ? PRODUCTS : []);
  const find = (id) => products().find((p) => p.id === id);

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
  }

  /* ========= STATE ========= */
  let cart = readJSON(CART_KEY, {});
  // যে পণ্য আর নেই বা স্টক শেষ, সেগুলো বাদ
  Object.keys(cart).forEach((id) => {
    const p = find(id);
    if (!p || !p.stock || !(cart[id] > 0)) delete cart[id];
  });

  let view = 'cart'; // cart | checkout | success
  let isOpen = false;
  let sending = false;
  let lastOrder = null;
  let draft = Object.assign({ name: '', phone: '', address: '', note: '' }, readJSON(CUSTOMER_KEY, {}));
  draft.note = '';

  const lines = () => Object.keys(cart).map((id) => ({ p: find(id), qty: cart[id] })).filter((x) => x.p);
  const count = () => lines().reduce((s, x) => s + x.qty, 0);
  const total = () => lines().reduce((s, x) => s + x.p.price * x.qty, 0);

  /* ========= STYLES ========= */
  const style = document.createElement('style');
  style.textContent = `
  .rjc-overlay{position:fixed;inset:0;background:rgba(2,6,14,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .2s;z-index:80}
  .rjc-overlay.open{opacity:1;pointer-events:auto}
  .rjc-drawer{position:fixed;top:0;right:0;height:100%;height:100dvh;width:min(440px,100%);transform:translateX(100%);transition:transform .25s ease;z-index:90;display:flex;flex-direction:column;background:#06111f;border-left:1px solid rgba(56,189,248,.18);color:#f1f5f9;font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Bengali",sans-serif}
  .rjc-drawer.open{transform:none}
  .rjc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(148,163,184,.14)}
  .rjc-head h2{margin:0;font-size:18px;font-weight:900}
  .rjc-icon{width:38px;height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.2);background:transparent;color:#cbd5e1;font-size:18px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
  .rjc-icon:hover{border-color:rgba(34,211,238,.5);color:#67e8f9}
  .rjc-body{flex:1;overflow-y:auto;padding:14px 18px;-webkit-overflow-scrolling:touch}
  .rjc-foot{padding:14px 18px calc(14px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(148,163,184,.14);background:rgba(3,9,20,.6)}
  .rjc-line{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid rgba(148,163,184,.1)}
  .rjc-line:last-child{border-bottom:0}
  .rjc-thumb{width:64px;height:64px;border-radius:12px;background:#0a2138;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:24px}
  .rjc-thumb img{width:100%;height:100%;object-fit:cover}
  .rjc-name{font-size:13px;font-weight:700;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#f1f5f9;text-decoration:none}
  .rjc-unit{font-size:12px;color:#94a3b8;margin-top:2px}
  .rjc-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}
  .rjc-linetotal{font-weight:900;color:#67e8f9;font-size:15px}
  .rjc-remove{background:none;border:0;color:#94a3b8;font-size:12px;cursor:pointer;padding:4px}
  .rjc-remove:hover{color:#fb7185}
  .rjc-step{display:inline-flex;align-items:center;border:1px solid rgba(34,211,238,.35);border-radius:12px;overflow:hidden;background:rgba(34,211,238,.06);width:100%;justify-content:space-between}
  .rjc-step button{width:40px;height:38px;border:0;background:transparent;color:#67e8f9;font-size:20px;font-weight:800;cursor:pointer}
  .rjc-step button:hover{background:rgba(34,211,238,.14)}
  .rjc-step span{font-weight:900;font-size:14px;min-width:28px;text-align:center}
  .rjc-line .rjc-step{width:auto}
  .rjc-line .rjc-step button{width:34px;height:32px}
  .rjc-btn{display:block;width:100%;border:0;border-radius:12px;padding:10px 12px;font-weight:800;font-size:13px;cursor:pointer;text-align:center;font-family:inherit;transition:filter .15s,transform .1s}
  .rjc-btn:active{transform:scale(.98)}
  .rjc-btn:hover{filter:brightness(1.1)}
  .rjc-btn-add{background:linear-gradient(135deg,#0891b2,#2563eb);color:#fff}
  .rjc-btn-order{background:linear-gradient(135deg,#10b981,#22c55e);color:#03130c;padding:14px;font-size:15px;font-weight:900}
  .rjc-btn-ghost{background:transparent;border:1px solid rgba(148,163,184,.3);color:#e2e8f0}
  .rjc-btn-off{background:rgba(148,163,184,.12);color:#64748b;cursor:not-allowed}
  .rjc-btn[disabled]{opacity:.6;cursor:not-allowed;filter:none}
  [data-size="lg"] .rjc-btn{padding:14px;font-size:15px;border-radius:16px}
  [data-size="lg"] .rjc-step{border-radius:16px}
  [data-size="lg"] .rjc-step button{height:48px;width:52px}
  .rjc-sum{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
  .rjc-sum b{font-size:22px;color:#67e8f9;font-weight:900}
  .rjc-hint{font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:12px}
  .rjc-field{margin-bottom:14px}
  .rjc-field label{display:block;font-size:13px;font-weight:700;margin-bottom:6px;color:#cbd5e1}
  .rjc-input{width:100%;background:rgba(8,22,40,.9);border:1px solid rgba(148,163,184,.22);border-radius:12px;padding:12px 14px;color:#f1f5f9;font-size:15px;font-family:inherit}
  .rjc-input:focus{outline:none;border-color:rgba(34,211,238,.65);box-shadow:0 0 0 3px rgba(34,211,238,.1)}
  .rjc-input.bad{border-color:#fb7185}
  .rjc-err{color:#fb7185;font-size:12px;margin-top:4px;display:none}
  .rjc-input.bad + .rjc-err{display:block}
  .rjc-formerr{background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.35);color:#fda4af;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.6;margin-bottom:12px}
  .rjc-pay{display:flex;align-items:center;gap:10px;border:1px solid rgba(34,211,238,.5);background:rgba(34,211,238,.07);border-radius:12px;padding:12px 14px;font-size:14px;font-weight:700}
  .rjc-pay i{width:16px;height:16px;border-radius:50%;border:5px solid #22d3ee;background:#06111f;flex:none}
  .rjc-pay small{display:block;font-weight:400;color:#94a3b8;font-size:12px;margin-top:2px}
  .rjc-mini{border:1px solid rgba(148,163,184,.14);border-radius:12px;padding:10px 12px;margin-bottom:16px;font-size:13px}
  .rjc-mini div{display:flex;justify-content:space-between;gap:10px;padding:3px 0;color:#cbd5e1}
  .rjc-mini div span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rjc-mini .t{border-top:1px solid rgba(148,163,184,.14);margin-top:6px;padding-top:8px;font-weight:900;color:#67e8f9}
  .rjc-hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
  .rjc-empty,.rjc-done{text-align:center;padding:56px 12px}
  .rjc-empty .em,.rjc-done .em{font-size:52px;margin-bottom:12px}
  .rjc-empty p,.rjc-done p{color:#94a3b8;font-size:14px;line-height:1.7;margin:8px 0 0}
  .rjc-oid{display:inline-block;margin-top:14px;padding:8px 14px;border-radius:10px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:#67e8f9;font-weight:900;letter-spacing:.5px}
  .rjc-bar{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translate(-50%,140%);z-index:70;display:flex;align-items:center;gap:12px;width:min(520px,calc(100% - 24px));padding:12px 16px;border:1px solid rgba(103,232,249,.5);border-radius:18px;background:linear-gradient(135deg,#0891b2,#2563eb);color:#fff;font-weight:800;font-size:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);cursor:pointer;transition:transform .25s ease;font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Bengali",sans-serif}
  .rjc-bar.show{transform:translate(-50%,0)}
  .rjc-bar .grow{flex:1;text-align:left}
  .rjc-bar .price{font-weight:900}
  .rjc-toast{position:fixed;left:50%;top:78px;transform:translate(-50%,-20px);opacity:0;pointer-events:none;z-index:95;background:#0b1f36;border:1px solid rgba(34,211,238,.5);color:#e0f2fe;padding:10px 16px;border-radius:12px;font-size:13px;font-weight:700;transition:all .22s ease;max-width:calc(100% - 24px);font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Bengali",sans-serif}
  .rjc-toast.show{opacity:1;transform:translate(-50%,0)}
  .rjc-badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#22d3ee;color:#03131c;font-size:11px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;line-height:1}
  @media (prefers-reduced-motion:reduce){.rjc-drawer,.rjc-overlay,.rjc-bar,.rjc-toast{transition:none}}
  `;
  document.head.appendChild(style);

  /* ========= DOM ========= */
  const overlay = document.createElement('div');
  overlay.className = 'rjc-overlay';
  const drawer = document.createElement('aside');
  drawer.className = 'rjc-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', 'কার্ট');
  drawer.innerHTML = '<div class="rjc-head"></div><div class="rjc-body"></div><div class="rjc-foot"></div>';
  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'rjc-bar';
  bar.setAttribute('data-cart-open', '');
  const toast = document.createElement('div');
  toast.className = 'rjc-toast';
  toast.setAttribute('role', 'status');

  function mount() {
    document.body.append(overlay, drawer, bar, toast);
    renderAll();
  }

  const elHead = () => drawer.children[0];
  const elBody = () => drawer.children[1];
  const elFoot = () => drawer.children[2];

  /* ========= UI HELPERS ========= */
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function actionsHTML(id, size) {
    const p = find(id);
    if (!p) return '';
    if (!p.stock) return '<button type="button" disabled class="rjc-btn rjc-btn-off">স্টক শেষ</button>';
    const q = cart[id] || 0;
    if (!q) return '<button type="button" data-cart-add="' + esc(id) + '" class="rjc-btn rjc-btn-add">কার্টে যোগ করুন</button>';
    return '<div class="rjc-step"><button type="button" data-cart-dec="' + esc(id) + '" aria-label="কমান">−</button><span>' + q + '</span><button type="button" data-cart-inc="' + esc(id) + '" aria-label="বাড়ান">+</button></div>';
  }

  function refreshActions() {
    document.querySelectorAll('[data-cart-actions]').forEach((el) => {
      el.innerHTML = actionsHTML(el.getAttribute('data-cart-actions'), el.dataset.size);
    });
  }

  function refreshBadges() {
    const n = count();
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = n;
      el.style.display = n ? 'inline-flex' : 'none';
    });
    bar.innerHTML = '<span aria-hidden="true">🛒</span><span class="grow">' + n + 'টি পণ্য · <span class="price">' + taka(total()) + '</span></span><span>কার্ট দেখুন</span>';
    bar.classList.toggle('show', n > 0 && !isOpen);
  }

  /* ========= DRAWER VIEWS ========= */
  function renderCart() {
    const list = lines();
    elHead().innerHTML = '<h2>আপনার কার্ট</h2><button type="button" class="rjc-icon" data-cart-close aria-label="বন্ধ করুন">✕</button>';

    if (!list.length) {
      elBody().innerHTML = '<div class="rjc-empty"><div class="em">🛒</div><b>কার্ট খালি আছে</b><p>পছন্দের পণ্য কার্টে যোগ করুন, তারপর একসাথে অর্ডার দিন।</p></div>';
      elFoot().innerHTML = '<button type="button" class="rjc-btn rjc-btn-ghost" data-cart-close style="padding:13px;font-size:14px">কেনাকাটা করুন</button>';
      return;
    }

    elBody().innerHTML = list.map(({ p, qty }) => {
      const img = p.images && p.images[0];
      return '<div class="rjc-line">' +
        '<div class="rjc-thumb">' + (img ? '<img src="' + esc(img) + '" alt="" onerror="this.remove()">' : '📦') + '</div>' +
        '<div><a class="rjc-name" href="product.html?id=' + encodeURIComponent(p.id) + '">' + esc(p.name) + '</a>' +
        '<div class="rjc-unit">' + taka(p.price) + (p.unit ? ' / ' + esc(p.unit) : '') + '</div>' +
        '<div class="rjc-row"><div class="rjc-step"><button type="button" data-cart-dec="' + esc(p.id) + '" aria-label="কমান">−</button><span>' + qty + '</span><button type="button" data-cart-inc="' + esc(p.id) + '" aria-label="বাড়ান">+</button></div>' +
        '<span class="rjc-linetotal">' + taka(p.price * qty) + '</span></div>' +
        '<button type="button" class="rjc-remove" data-cart-remove="' + esc(p.id) + '">মুছে ফেলুন</button></div></div>';
    }).join('');

    elFoot().innerHTML =
      '<div class="rjc-sum"><span>সাবটোটাল (' + count() + 'টি পণ্য)</span><b>' + taka(total()) + '</b></div>' +
      '<div class="rjc-hint">পেমেন্ট: ক্যাশ অন ডেলিভারি। ডেলিভারি চার্জ (প্রযোজ্য হলে) কনফার্মেশন কলে জানানো হবে।</div>' +
      '<button type="button" class="rjc-btn rjc-btn-order" data-cart-checkout>অর্ডার করতে এগিয়ে যান</button>';
  }

  function fieldHTML(id, label, input, err) {
    return '<div class="rjc-field"><label for="' + id + '">' + label + '</label>' + input + '<div class="rjc-err">' + err + '</div></div>';
  }

  function renderCheckout() {
    const list = lines();
    elHead().innerHTML = '<button type="button" class="rjc-icon" data-cart-back aria-label="ফিরে যান">←</button><h2 style="flex:1">অর্ডারের তথ্য</h2><button type="button" class="rjc-icon" data-cart-close aria-label="বন্ধ করুন">✕</button>';

    const mini = '<div class="rjc-mini">' +
      list.map(({ p, qty }) => '<div><span>' + esc(p.name) + ' × ' + qty + '</span><span>' + taka(p.price * qty) + '</span></div>').join('') +
      '<div class="t"><span>মোট</span><span>' + taka(total()) + '</span></div></div>';

    elBody().innerHTML = mini +
      '<form id="rjcForm" novalidate autocomplete="on">' +
      '<input class="rjc-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      fieldHTML('rjcName', 'আপনার নাম', '<input class="rjc-input" id="rjcName" name="name" type="text" autocomplete="name" placeholder="যেমন: রাকিব ইসলাম" value="' + esc(draft.name) + '">', 'নাম লিখুন') +
      fieldHTML('rjcPhone', 'মোবাইল নম্বর', '<input class="rjc-input" id="rjcPhone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="01XXXXXXXXX" value="' + esc(draft.phone) + '">', 'সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (01XXXXXXXXX)') +
      fieldHTML('rjcAddress', 'ডেলিভারি ঠিকানা', '<textarea class="rjc-input" id="rjcAddress" name="address" rows="3" autocomplete="street-address" placeholder="গ্রাম/মহল্লা, থানা, জেলা">' + esc(draft.address) + '</textarea>', 'পুরো ঠিকানা লিখুন') +
      fieldHTML('rjcNote', 'নোট (ঐচ্ছিক)', '<input class="rjc-input" id="rjcNote" name="note" type="text" placeholder="কিছু জানানোর থাকলে" value="' + esc(draft.note) + '">', '') +
      '<div class="rjc-pay"><i></i><div>ক্যাশ অন ডেলিভারি<small>পণ্য হাতে পেয়ে টাকা দিন</small></div></div>' +
      '<div id="rjcFormErr" class="rjc-formerr" style="display:none;margin-top:12px"></div>' +
      '</form>';

    elFoot().innerHTML = '<button type="submit" form="rjcForm" id="rjcSubmit" class="rjc-btn rjc-btn-order">অর্ডার কনফার্ম করুন · ' + taka(total()) + '</button>';
  }

  function renderSuccess() {
    elHead().innerHTML = '<h2>অর্ডার সম্পন্ন</h2><button type="button" class="rjc-icon" data-cart-close aria-label="বন্ধ করুন">✕</button>';
    elBody().innerHTML = '<div class="rjc-done"><div class="em">✅</div><b style="font-size:20px">ধন্যবাদ! অর্ডার পাঠানো হয়েছে</b>' +
      '<div class="rjc-oid">' + esc(lastOrder.id) + '</div>' +
      '<p>আমাদের প্রতিনিধি শীঘ্রই আপনার নম্বরে কল করে অর্ডার কনফার্ম করবেন।<br>পেমেন্ট: ক্যাশ অন ডেলিভারি · মোট ' + taka(lastOrder.total) + '</p>' +
      '<p>জরুরি প্রয়োজনে কল করুন: <a href="tel:' + CFG.HOTLINE.replace(/-/g, '') + '" style="color:#67e8f9;font-weight:800">' + CFG.HOTLINE + '</a></p></div>';
    elFoot().innerHTML = '<button type="button" class="rjc-btn rjc-btn-ghost" data-cart-close style="padding:13px;font-size:14px">কেনাকাটা চালিয়ে যান</button>';
  }

  function renderDrawer() {
    if (view === 'checkout' && !lines().length) view = 'cart';
    if (view === 'success') renderSuccess();
    else if (view === 'checkout') renderCheckout();
    else renderCart();
  }

  function renderAll() {
    refreshBadges();
    refreshActions();
    if (isOpen) renderDrawer();
  }

  /* ========= CART ACTIONS ========= */
  function commit() {
    writeJSON(CART_KEY, cart);
    renderAll();
    document.dispatchEvent(new CustomEvent('cart:change'));
  }

  function add(id, n) {
    const p = find(id);
    if (!p || !p.stock) return;
    const first = !cart[id];
    cart[id] = Math.min(CFG.MAX_QTY, (cart[id] || 0) + (n || 1));
    commit();
    if (first) showToast('কার্টে যোগ হয়েছে ✓');
  }
  function setQty(id, q) {
    if (q <= 0) delete cart[id];
    else cart[id] = Math.min(CFG.MAX_QTY, q);
    commit();
  }
  function remove(id) { delete cart[id]; commit(); }
  function clear() { cart = {}; commit(); }

  function open(v) {
    view = v || 'cart';
    isOpen = true;
    renderDrawer();
    refreshBadges();
    overlay.classList.add('open');
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    isOpen = false;
    if (view === 'success') view = 'cart';
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    document.body.style.overflow = '';
    refreshBadges();
  }

  /* ========= CHECKOUT ========= */
  function normalizePhone(v) {
    let d = String(v || '').replace(/[^\d+]/g, '');
    d = d.replace(/^\+?880/, '0');
    return d;
  }
  const phoneOk = (v) => /^01[3-9]\d{8}$/.test(v);

  function makeOrderId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'RJ' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + rand;
  }

  function buildMessage(o) {
    const when = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true });
    const rows = o.lines.map((l, i) =>
      (i + 1) + '. ' + esc(l.p.name) + '\n    ' + l.qty + ' × ' + taka(l.p.price) + (l.p.unit ? '/' + esc(l.p.unit) : '') + ' = <b>' + taka(l.p.price * l.qty) + '</b>'
    ).join('\n');
    let msg =
      '🛒 নতুন স্টোর অর্ডার  #' + o.id + '\n\n' +
      '👤 ' + esc(o.name) + '\n' +
      '📞 ' + esc(o.phone) + '\n' +
      '📍 ' + esc(o.address) + '\n' +
      (o.note ? '📝 ' + esc(o.note) + '\n' : '') +
      '\nপণ্য:\n' + rows + '\n\n' +
      '💰 মোট: ' + taka(o.total) + '\n' +
      '💵 পেমেন্ট: ক্যাশ অন ডেলিভারি\n' +
      '🕒 ' + when;
    if (msg.length > 3900) msg = msg.slice(0, 3850) + '\n… (মেসেজ ছোট করা হয়েছে)';
    return msg;
  }

  async function sendToTelegram(text) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      // text/plain ব্যবহার করলে browser preflight (OPTIONS) request পাঠায় না
      const res = await fetch(CFG.TELEGRAM_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(CFG.buildPayload(text)),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } finally {
      clearTimeout(timer);
    }
  }

  async function onSubmit(form) {
    if (sending) return;
    const fd = new FormData(form);
    if (fd.get('website')) return; // honeypot — bot

    const name = String(fd.get('name') || '').trim();
    const phone = normalizePhone(fd.get('phone'));
    const address = String(fd.get('address') || '').trim();
    const note = String(fd.get('note') || '').trim().slice(0, 300);
    draft = { name, phone: String(fd.get('phone') || '').trim(), address, note };

    const errBox = form.querySelector('#rjcFormErr');
    errBox.style.display = 'none';

    const checks = [
      ['name', name.length >= 2],
      ['phone', phoneOk(phone)],
      ['address', address.length >= 8]
    ];
    let firstBad = null;
    checks.forEach(([field, ok]) => {
      const el = form.elements[field];
      el.classList.toggle('bad', !ok);
      if (!ok && !firstBad) firstBad = el;
    });
    if (firstBad) { firstBad.focus(); return; }

    const list = lines();
    if (!list.length) { view = 'cart'; renderDrawer(); return; }

    const since = Date.now() - Number(localStorage.getItem(LAST_ORDER_KEY) || 0);
    if (since < CFG.COOLDOWN_MS) {
      errBox.textContent = 'একটু অপেক্ষা করে আবার চেষ্টা করুন।';
      errBox.style.display = 'block';
      return;
    }

    const order = { id: makeOrderId(), name, phone, address, note, lines: list, total: total() };
    const btn = document.getElementById('rjcSubmit');
    const btnLabel = btn.textContent;
    sending = true;
    btn.disabled = true;
    btn.textContent = 'অর্ডার পাঠানো হচ্ছে...';

    try {
      await sendToTelegram(buildMessage(order));
      try { localStorage.setItem(LAST_ORDER_KEY, String(Date.now())); } catch (e) {}
      writeJSON(CUSTOMER_KEY, { name: name, phone: draft.phone, address: address });
      lastOrder = { id: order.id, total: order.total };
      draft.note = '';
      sending = false;
      view = 'success';
      clear(); // কার্ট খালি + সব UI আপডেট
    } catch (err) {
      sending = false;
      btn.disabled = false;
      btn.textContent = btnLabel;
      errBox.innerHTML = 'অর্ডার পাঠানো যায়নি। ইন্টারনেট চেক করে আবার চেষ্টা করুন, অথবা <a href="tel:' + CFG.HOTLINE.replace(/-/g, '') + '" style="color:#67e8f9;font-weight:800">' + CFG.HOTLINE + '</a> নম্বরে কল করুন।';
      errBox.style.display = 'block';
      console.error('Order send failed:', err);
    }
  }

  /* ========= EVENTS ========= */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cart-add],[data-cart-inc],[data-cart-dec],[data-cart-remove],[data-cart-open],[data-cart-close],[data-cart-checkout],[data-cart-back]');
    if (!t) return;
    if (t.hasAttribute('data-cart-add')) { add(t.getAttribute('data-cart-add')); return; }
    if (t.hasAttribute('data-cart-inc')) { const id = t.getAttribute('data-cart-inc'); setQty(id, (cart[id] || 0) + 1); return; }
    if (t.hasAttribute('data-cart-dec')) { const id = t.getAttribute('data-cart-dec'); setQty(id, (cart[id] || 0) - 1); return; }
    if (t.hasAttribute('data-cart-remove')) { remove(t.getAttribute('data-cart-remove')); return; }
    if (t.hasAttribute('data-cart-open')) { e.preventDefault(); open('cart'); return; }
    if (t.hasAttribute('data-cart-close')) { close(); return; }
    if (t.hasAttribute('data-cart-checkout')) { view = 'checkout'; renderDrawer(); elBody().scrollTop = 0; return; }
    if (t.hasAttribute('data-cart-back')) { view = 'cart'; renderDrawer(); return; }
  });

  overlay.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });

  drawer.addEventListener('submit', (e) => {
    if (e.target.id === 'rjcForm') { e.preventDefault(); onSubmit(e.target); }
  });
  drawer.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.form || el.form.id !== 'rjcForm') return;
    el.classList.remove('bad');
    if (el.name in draft) draft[el.name] = el.value;
  });

  // অন্য ট্যাবে কার্ট বদলালে sync
  window.addEventListener('storage', (e) => {
    if (e.key !== CART_KEY) return;
    cart = readJSON(CART_KEY, {});
    renderAll();
    document.dispatchEvent(new CustomEvent('cart:change'));
  });

  /* ========= PUBLIC API ========= */
  window.Cart = {
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    qty: (id) => cart[id] || 0,
    count: count,
    total: total,
    open: open,
    close: close,
    refreshActions: refreshActions,
    // "এখনই অর্ডার করুন": কার্টে অন্তত ১টি রেখে সরাসরি checkout এ যায়
    buyNow: function (id) {
      const p = find(id);
      if (!p || !p.stock) return;
      if (!cart[id]) { cart[id] = 1; commit(); }
      open('checkout');
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
