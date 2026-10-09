/* ============================================================
   DOMPETKU — Aplikasi Keuangan Pribadi
   Struktur: DB → State → Utils → Router → Modules → Init
   ============================================================ */

/* ============ 1. DATABASE (IndexedDB) ============ */
const DB = (() => {
  const DB_NAME = 'dompetku_db';
  const DB_VERSION = 1;
  let db = null;

  const STORES = {
    settings: { keyPath: 'key' },
    transactions: { keyPath: 'id' },
    categories: { keyPath: 'id' },
    accounts: { keyPath: 'id' },
    savings: { keyPath: 'id' },
    savingLogs: { keyPath: 'id' },
    debts: { keyPath: 'id' },
    debtLogs: { keyPath: 'id' },
    budgets: { keyPath: 'id' },
    schedules: { keyPath: 'id' }
  };

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        Object.entries(STORES).forEach(([name, cfg]) => {
          if (!d.objectStoreNames.contains(name)) {
            const store = d.createObjectStore(name, cfg);
            if (name === 'transactions') {
              store.createIndex('date', 'date');
              store.createIndex('type', 'type');
              store.createIndex('category', 'category');
              store.createIndex('account', 'account');
            }
          }
        });
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = e => reject(e.target.error);
    });
  }

  function tx(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function reqPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async init() { await open(); },
    async getAll(store) { return reqPromise(tx(store).getAll()); },
    async get(store, id) { return reqPromise(tx(store).get(id)); },
    async put(store, data) { return reqPromise(tx(store, 'readwrite').put(data)); },
    async delete(store, id) { return reqPromise(tx(store, 'readwrite').delete(id)); },
    async clear(store) { return reqPromise(tx(store, 'readwrite').clear()); },
    async putMany(store, items) {
      const t = db.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      items.forEach(it => s.put(it));
      return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    },
    async clearAll() {
      const names = Object.keys(STORES);
      const t = db.transaction(names, 'readwrite');
      names.forEach(n => t.objectStore(n).clear());
      return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    }
  };
})();

/* ============ 2. STATE ============ */
const State = {
  settings: { name:'', currency:'IDR', budgetStart:1, theme:'light' },
  transactions: [],
  categories: [],
  accounts: [],
  savings: [],
  savingLogs: [],
  debts: [],
  debtLogs: [],
  budgets: [],
  schedules: [],
  period: 'month',
  dateFrom: null,
  dateTo: null,
  calendarDate: new Date(),
  budgetMonth: new Date()
};

/* ============ 3. UTILITIES ============ */
const U = {
  uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
  fmtMoney: n => {
    n = Number(n) || 0;
    const neg = n < 0;
    const abs = Math.abs(n);
    const str = abs.toLocaleString('id-ID');
    const cur = State.settings.currency || 'IDR';
    const sym = cur === 'IDR' ? 'Rp' : cur + ' ';
    return (neg ? '-' : '') + sym + str;
  },
  fmtDate: d => {
    if (!d) return '-';
    const date = new Date(d);
    if (isNaN(date)) return '-';
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return `${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
  },
  fmtDateShort: d => {
    const date = new Date(d);
    if (isNaN(date)) return '-';
    const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
  },
  fmtDateISO: d => {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  todayISO: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  escapeHTML: s => {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },
  parseNum: s => {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    const cleaned = String(s).replace(/[^\d,-]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  },
  daysBetween: (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000),
  startOfMonth: d => { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; },
  endOfMonth: d => { const x = new Date(d); x.setMonth(x.getMonth()+1, 0); x.setHours(23,59,59,999); return x; },
  sameDay: (a, b) => {
    const x = new Date(a), y = new Date(b);
    return x.getFullYear()===y.getFullYear() && x.getMonth()===y.getMonth() && x.getDate()===y.getDate();
  }
};

/* ============ 4. TOAST & MODAL ============ */
const Toast = {
  show(msg, type = 'info', ms = 3000) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; t.style.transition = 'all .3s'; setTimeout(() => t.remove(), 300); }, ms);
  }
};

const Modal = {
  open(title, bodyHTML, footerHTML = '') {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;
    document.getElementById('modalFooter').innerHTML = footerHTML;
    document.getElementById('modalBackdrop').classList.remove('hidden');
  },
  close() { document.getElementById('modalBackdrop').classList.add('hidden'); },
  confirm(title, msg, onYes) {
    this.open(title, `<p>${U.escapeHTML(msg)}</p>`,
      `<button class="btn" onclick="Modal.close()">Batal</button>
       <button class="btn btn-danger" id="modalConfirmYes">Ya, Lanjutkan</button>`);
    document.getElementById('modalConfirmYes').onclick = () => { this.close(); onYes(); };
  }
};
document.getElementById('modalClose').onclick = () => Modal.close();
document.getElementById('modalBackdrop').addEventListener('click', e => {
  if (e.target.id === 'modalBackdrop') Modal.close();
});

/* ============ 5. ROUTER ============ */
const Router = {
  pages: ['dashboard','transaksi','tabungan','utang','anggaran','kalender','laporan','pengaturan'],
  titles: { dashboard:'Dashboard', transaksi:'Transaksi', tabungan:'Tabungan & Target', utang:'Utang & Paylater', anggaran:'Anggaran Bulanan', kalender:'Kalender & Tagihan', laporan:'Laporan', pengaturan:'Pengaturan' },
  init() {
    window.addEventListener('hashchange', () => this.go());
    this.go();
  },
  go() {
    const hash = (location.hash || '#dashboard').slice(1);
    const page = this.pages.includes(hash) ? hash : 'dashboard';
    this.pages.forEach(p => {
      document.getElementById('page-' + p).classList.toggle('hidden', p !== page);
    });
    document.querySelectorAll('.nav-item, .bn-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    document.getElementById('pageTitle').textContent = this.titles[page];
    document.getElementById('sidebar').classList.remove('open');
    // Refresh halaman aktif
    const refreshMap = {
      dashboard: () => Pages.dashboard.refresh(),
      transaksi: () => Pages.transaksi.refresh(),
      tabungan: () => Pages.savings.refresh(),
      utang: () => Pages.debts.refresh(),
      anggaran: () => Pages.budget.refresh(),
      kalender: () => Pages.calendar.refresh(),
      laporan: () => Pages.report.refresh(),
      pengaturan: () => Pages.settings.refresh()
    };
    if (refreshMap[page]) refreshMap[page]();;
  }
};

/* ============ 6. CORE CALCULATIONS ============ */
const Calc = {
  getPeriodRange() {
    const now = new Date();
    let from, to;
    switch (State.period) {
      case 'today':
        from = new Date(now); from.setHours(0,0,0,0);
        to = new Date(now); to.setHours(23,59,59,999);
        break;
      case 'week': {
        const day = now.getDay() || 7;
        from = new Date(now); from.setDate(now.getDate() - day + 1); from.setHours(0,0,0,0);
        to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23,59,59,999);
        break;
      }
      case 'month':
        from = U.startOfMonth(now);
        to = U.endOfMonth(now);
        break;
      case 'year':
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      case 'custom':
        from = State.dateFrom ? new Date(State.dateFrom + 'T00:00:00') : U.startOfMonth(now);
        to = State.dateTo ? new Date(State.dateTo + 'T23:59:59') : U.endOfMonth(now);
        break;
    }
    return { from, to };
  },
  filterByPeriod(txList) {
    const { from, to } = this.getPeriodRange();
    return txList.filter(t => {
      const d = new Date(t.date);
      return d >= from && d <= to;
    });
  },
  sumByType(txList) {
    let income = 0, expense = 0;
    txList.forEach(t => {
      if (t.type === 'income') income += Number(t.amount) || 0;
      else if (t.type === 'expense') expense += Number(t.amount) || 0;
    });
    return { income, expense, net: income - expense };
  },
  accountBalance(accountId) {
    const acc = State.accounts.find(a => a.id === accountId);
    if (!acc) return 0;
    let bal = Number(acc.initialBalance) || 0;
    State.transactions.forEach(t => {
      if (t.account === accountId) {
        if (t.type === 'income') bal += Number(t.amount);
        else if (t.type === 'expense') bal -= Number(t.amount);
      }
      if (t.type === 'transfer') {
        if (t.toAccount === accountId) bal += Number(t.amount);
        if (t.account === accountId) bal -= Number(t.amount);
      }
      // Pembayaran utang mengurangi saldo akun
      if (t.type === 'debt-payment' && t.account === accountId) {
        bal -= Number(t.amount);
      }
      // Setoran tabungan mengurangi saldo akun
      if (t.type === 'savings-deposit' && t.account === accountId) {
        bal -= Number(t.amount);
      }
      if (t.type === 'savings-withdraw' && t.account === accountId) {
        bal += Number(t.amount);
      }
    });
    return bal;
  },
  totalBalance() {
    return State.accounts.reduce((s, a) => s + this.accountBalance(a.id), 0);
  },
  totalSavings() {
    return State.savings.reduce((s, t) => s + (Number(t.collected) || 0), 0);
  },
  totalDebtRemaining() {
    return State.debts.filter(d => d.status !== 'lunas').reduce((s, d) => s + (Number(d.remaining) || 0), 0);
  },
  categoryTotal(catId, type = 'expense', period = null) {
    let list = State.transactions.filter(t => t.type === type && t.category === catId);
    if (period) list = list.filter(t => {
      const d = new Date(t.date);
      return d >= period.from && d <= period.to;
    });
    return list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  }
};

/* ============ 7. CHART (SVG) ============ */
const Chart = {
  bar(container, data, opts = {}) {
    const { width = 600, height = 220, pad = 30 } = opts;
    if (!data.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">📊</div>Belum ada data</div>'; return; }
    const max = Math.max(...data.map(d => Math.max(d.in || 0, d.out || 0, d.value || 0)), 1);
    const bw = (width - pad * 2) / data.length;
    const barW = Math.min(bw * 0.35, 30);
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;
    // grid
    for (let i = 0; i <= 4; i++) {
      const y = pad + ((height - pad * 2) / 4) * i;
      svg += `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="var(--border)" stroke-dasharray="2,2"/>`;
    }
    data.forEach((d, i) => {
      const x = pad + bw * i + bw / 2;
      const inH = ((d.in || 0) / max) * (height - pad * 2);
      const outH = ((d.out || 0) / max) * (height - pad * 2);
      const valH = ((d.value || 0) / max) * (height - pad * 2);
      if (d.in !== undefined) {
        svg += `<rect x="${x - barW - 2}" y="${height - pad - inH}" width="${barW}" height="${inH}" fill="var(--primary)" rx="3"><title>Pemasukan: ${U.fmtMoney(d.in)}</title></rect>`;
        svg += `<rect x="${x + 2}" y="${height - pad - outH}" width="${barW}" height="${outH}" fill="var(--danger)" rx="3"><title>Pengeluaran: ${U.fmtMoney(d.out)}</title></rect>`;
      } else {
        svg += `<rect x="${x - barW/2}" y="${height - pad - valH}" width="${barW}" height="${valH}" fill="${d.color || 'var(--primary)'}" rx="3"><title>${U.escapeHTML(d.label)}: ${U.fmtMoney(d.value)}</title></rect>`;
      }
      svg += `<text x="${x}" y="${height - pad + 14}" text-anchor="middle" font-size="10" fill="var(--muted)">${U.escapeHTML(d.label)}</text>`;
    });
    svg += '</svg>';
    container.innerHTML = svg;
  },
  line(container, data, opts = {}) {
    const { width = 600, height = 220, pad = 30 } = opts;
    if (!data.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">📈</div>Belum ada data</div>'; return; }
    const max = Math.max(...data.map(d => Math.max(d.in || 0, d.out || 0)), 1);
    const step = (width - pad * 2) / Math.max(data.length - 1, 1);
    const yAt = v => height - pad - (v / max) * (height - pad * 2);
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;
    for (let i = 0; i <= 4; i++) {
      const y = pad + ((height - pad * 2) / 4) * i;
      svg += `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="var(--border)" stroke-dasharray="2,2"/>`;
    }
    const pathIn = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${pad + step * i},${yAt(d.in || 0)}`).join(' ');
    const pathOut = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${pad + step * i},${yAt(d.out || 0)}`).join(' ');
    svg += `<path d="${pathIn}" stroke="var(--primary)" stroke-width="2" fill="none"/>`;
    svg += `<path d="${pathOut}" stroke="var(--danger)" stroke-width="2" fill="none"/>`;
    data.forEach((d, i) => {
      const x = pad + step * i;
      svg += `<circle cx="${x}" cy="${yAt(d.in || 0)}" r="3" fill="var(--primary)"><title>${U.escapeHTML(d.label)}: ${U.fmtMoney(d.in)}</title></circle>`;
      svg += `<circle cx="${x}" cy="${yAt(d.out || 0)}" r="3" fill="var(--danger)"><title>${U.escapeHTML(d.label)}: ${U.fmtMoney(d.out)}</title></circle>`;
      if (data.length <= 12) svg += `<text x="${x}" y="${height - pad + 14}" text-anchor="middle" font-size="10" fill="var(--muted)">${U.escapeHTML(d.label)}</text>`;
    });
    svg += `<g transform="translate(${width-120},10)"><rect width="10" height="10" fill="var(--primary)"/><text x="14" y="9" font-size="10" fill="var(--text)">Pemasukan</text><rect y="14" width="10" height="10" fill="var(--danger)"/><text x="14" y="23" font-size="10" fill="var(--text)">Pengeluaran</text></g>`;
    svg += '</svg>';
    container.innerHTML = svg;
  },
  donut(container, data, opts = {}) {
    const { size = 220 } = opts;
    if (!data.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">🍩</div>Belum ada data</div>'; return; }
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const cx = size / 2, cy = size / 2, r = size / 2 - 20, ri = r - 30;
    let svg = `<svg viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet">`;
    let a0 = -Math.PI / 2;
    data.forEach(d => {
      const a1 = a0 + (d.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const xi0 = cx + ri * Math.cos(a0), yi0 = cy + ri * Math.sin(a0);
      const xi1 = cx + ri * Math.cos(a1), yi1 = cy + ri * Math.sin(a1);
      svg += `<path d="M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${ri},${ri} 0 ${large} 0 ${xi0},${yi0} Z" fill="${d.color}" stroke="var(--surface)" stroke-width="2"><title>${U.escapeHTML(d.label)}: ${U.fmtMoney(d.value)} (${((d.value/total)*100).toFixed(1)}%)</title></path>`;
      a0 = a1;
    });
    svg += `<text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="12" fill="var(--muted)">Total</text>`;
    svg += `<text x="${cx}" y="${cy+14}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text)">${U.fmtMoney(total)}</text>`;
    svg += '</svg>';
    const legend = data.map(d => `<div style="display:flex;align-items:center;gap:6px;font-size:.82rem;margin-bottom:4px"><span style="width:10px;height:10px;border-radius:2px;background:${d.color}"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.escapeHTML(d.label)}</span><strong>${U.fmtMoney(d.value)}</strong></div>`).join('');
    container.innerHTML = `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${svg}<div style="flex:1;min-width:160px">${legend}</div></div>`;
  }
};

/* ============ 8. DEFAULT DATA ============ */
const DefaultData = {
  categories: [
    { id:'cat_gaji', name:'Gaji', type:'income', icon:'💼', color:'#10b981' },
    { id:'cat_bonus', name:'Bonus', type:'income', icon:'🎁', color:'#14b8a6' },
    { id:'cat_lain_in', name:'Pemasukan Lain', type:'income', icon:'💰', color:'#06b6d4' },
    { id:'cat_makan', name:'Makanan & Minuman', type:'expense', icon:'🍽️', color:'#ef4444' },
    { id:'cat_trans', name:'Transportasi', type:'expense', icon:'🚗', color:'#f59e0b' },
    { id:'cat_rumah', name:'Tempat Tinggal', type:'expense', icon:'🏠', color:'#8b5cf6' },
    { id:'cat_pribadi', name:'Kebutuhan Pribadi', type:'expense', icon:'👕', color:'#ec4899' },
    { id:'cat_hiburan', name:'Hiburan', type:'expense', icon:'🎮', color:'#3b82f6' },
    { id:'cat_sehat', name:'Kesehatan', type:'expense', icon:'💊', color:'#10b981' },
    { id:'cat_tagihan', name:'Tagihan', type:'expense', icon:'📄', color:'#6366f1' },
    { id:'cat_cicilan', name:'Cicilan', type:'expense', icon:'💳', color:'#f97316' },
    { id:'cat_lain_out', name:'Lainnya', type:'expense', icon:'📦', color:'#6b7280' }
  ],
  accounts: [
    { id:'acc_cash', name:'Uang Tunai', initialBalance:0, icon:'💵' },
    { id:'acc_bank', name:'Rekening Bank', initialBalance:0, icon:'🏦' },
    { id:'acc_dana', name:'DANA', initialBalance:0, icon:'💙' },
    { id:'acc_gopay', name:'GoPay', initialBalance:0, icon:'💚' },
    { id:'acc_ovo', name:'OVO', initialBalance:0, icon:'💜' }
  ],
  savingsTargets: [
    { id:'sav_emergency', name:'Dana Darurat', target:50000000, collected:0, startDate:U.todayISO(), deadline:'', note:'6x pengeluaran bulanan' },
    { id:'sav_marriage', name:'Tabungan Menikah', target:100000000, collected:0, startDate:U.todayISO(), deadline:'', note:'' },
    { id:'sav_house', name:'Beli Rumah', target:500000000, collected:0, startDate:U.todayISO(), deadline:'', note:'' },
    { id:'sav_vehicle', name:'Beli Kendaraan', target:50000000, collected:0, startDate:U.todayISO(), deadline:'', note:'' },
    { id:'sav_edu', name:'Pendidikan', target:30000000, collected:0, startDate:U.todayISO(), deadline:'', note:'' },
    { id:'sav_invest', name:'Investasi', target:100000000, collected:0, startDate:U.todayISO(), deadline:'', note:'' },
    { id:'sav_vacation', name:'Liburan', target:10000000, collected:0, startDate:U.todayISO(), deadline:'', note:'' }
  ]
};

/* ============ 9. PAGES ============ */
const Pages = {};

/* ---------- DASHBOARD ---------- */
Pages.dashboard = {
  refresh() {
    const txs = Calc.filterByPeriod(State.transactions);
    const { income, expense, net } = Calc.sumByType(txs);
    document.getElementById('statIncome').textContent = U.fmtMoney(income);
    document.getElementById('statExpense').textContent = U.fmtMoney(expense);
    document.getElementById('statNet').textContent = U.fmtMoney(net);
    document.getElementById('statIncomeCount').textContent = txs.filter(t=>t.type==='income').length + ' transaksi';
    document.getElementById('statExpenseCount').textContent = txs.filter(t=>t.type==='expense').length + ' transaksi';

    const totalBal = Calc.totalBalance();
    document.getElementById('statBalance').textContent = U.fmtMoney(totalBal);
    document.getElementById('statBalanceSub').textContent = State.accounts.length + ' akun';

    const totalSav = Calc.totalSavings();
    document.getElementById('statSavings').textContent = U.fmtMoney(totalSav);
    document.getElementById('statSavingsSub').textContent = State.savings.filter(s=>s.status!=='tercapai').length + ' target aktif';

    const totalDebt = Calc.totalDebtRemaining();
    document.getElementById('statDebt').textContent = U.fmtMoney(totalDebt);
    document.getElementById('statDebtSub').textContent = State.debts.filter(d=>d.status!=='lunas').length + ' utang aktif';

    // Chart arus kas
    this.renderCashflowChart(txs);
    // Chart kategori
    this.renderCategoryChart(txs);
    // Upcoming bills
    this.renderUpcomingBills();
    // Savings progress
    this.renderSavingsProgress();
    // Recent tx
    this.renderRecentTx();
  },
  renderCashflowChart(txs) {
    const container = document.getElementById('chartCashflow');
    const type = document.getElementById('chartType').value;
    const { from, to } = Calc.getPeriodRange();
    const days = U.daysBetween(from, to);
    let groups = [];
    if (days <= 31) {
      // per hari
      const d = new Date(from);
      while (d <= to) {
        const key = U.fmtDateISO(d);
        const dayTxs = txs.filter(t => U.fmtDateISO(new Date(t.date)) === key);
        const s = Calc.sumByType(dayTxs);
        groups.push({ label: d.getDate().toString(), in: s.income, out: s.expense });
        d.setDate(d.getDate() + 1);
      }
    } else {
      // per bulan
      const d = new Date(from.getFullYear(), from.getMonth(), 1);
      const end = new Date(to.getFullYear(), to.getMonth(), 1);
      const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      while (d <= end) {
        const mTxs = txs.filter(t => {
          const td = new Date(t.date);
          return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
        });
        const s = Calc.sumByType(mTxs);
        groups.push({ label: bulan[d.getMonth()], in: s.income, out: s.expense });
        d.setMonth(d.getMonth() + 1);
      }
    }
    if (type === 'line') Chart.line(container, groups);
    else Chart.bar(container, groups);
  },
  renderCategoryChart(txs) {
    const container = document.getElementById('chartCategory');
    const expTxs = txs.filter(t => t.type === 'expense');
    const byCat = {};
    expTxs.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount); });
    const data = Object.entries(byCat).map(([cid, val]) => {
      const c = State.categories.find(x => x.id === cid);
      return { label: c ? c.name : 'Tanpa kategori', value: val, color: c ? c.color : '#6b7280' };
    }).sort((a,b) => b.value - a.value);
    Chart.donut(container, data);
  },
  renderUpcomingBills() {
    const container = document.getElementById('listUpcomingBills');
    const now = new Date();
    const soon = new Date(); soon.setDate(soon.getDate() + 7);
    const items = [];
    State.debts.filter(d => d.status !== 'lunas').forEach(d => {
      const due = new Date(d.dueDate);
      if (due <= soon && due >= new Date(now.toDateString())) {
        items.push({ type:'debt', title:d.creditor || 'Utang', sub:'Jatuh tempo ' + U.fmtDateShort(d.dueDate), amount:d.installment, date:d.dueDate, warn: U.daysBetween(now, due) <= 3 });
      }
    });
    State.schedules.filter(s => {
      const d = new Date(s.date);
      return d >= new Date(now.toDateString()) && d <= soon;
    }).forEach(s => {
      items.push({ type:'schedule', title:s.title, sub:U.fmtDateShort(s.date), amount:s.amount || 0, date:s.date });
    });
    items.sort((a,b) => new Date(a.date) - new Date(b.date));
    if (!items.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">✅</div>Tidak ada tagihan dalam 7 hari ke depan</div>'; return; }
    container.innerHTML = items.map(it => `
      <div class="list-item" style="${it.warn?'border-left:3px solid var(--warn)':''}">
        <div class="list-icon out">💳</div>
        <div class="list-body">
          <div class="list-title">${U.escapeHTML(it.title)}</div>
          <div class="list-sub">${U.escapeHTML(it.sub)}</div>
        </div>
        <div class="list-amount out">${U.fmtMoney(it.amount)}</div>
      </div>`).join('');
  },
  renderSavingsProgress() {
    const container = document.getElementById('listSavingsProgress');
    if (!State.savings.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">🎯</div>Belum ada target tabungan</div>'; return; }
    container.innerHTML = State.savings.slice(0, 5).map(s => {
      const pct = s.target > 0 ? Math.min(100, (s.collected / s.target) * 100) : 0;
      const cls = pct >= 100 ? '' : pct >= 80 ? 'warn' : '';
      return `
        <div class="list-item">
          <div class="list-icon tr">🎯</div>
          <div class="list-body">
            <div class="list-title">${U.escapeHTML(s.name)}</div>
            <div class="progress"><div class="progress-bar ${cls}" style="width:${pct}%"></div></div>
            <div class="progress-label"><span>${pct.toFixed(1)}%</span><span>${U.fmtMoney(s.collected)} / ${U.fmtMoney(s.target)}</span></div>
          </div>
        </div>`;
    }).join('');
  },
  renderRecentTx() {
    const container = document.getElementById('listRecentTx');
    const recent = [...State.transactions].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 7);
    if (!recent.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">💸</div>Belum ada transaksi. Mulai catat keuangan Anda!</div>'; return; }
    container.innerHTML = recent.map(t => Pages.transaksi.renderTxItem(t)).join('');
  }
};

/* ---------- TRANSAKSI ---------- */
Pages.transaksi = {
  refresh() {
    this.populateFilters();
    this.renderList();
  },
  populateFilters() {
    const catSel = document.getElementById('txFilterCategory');
    const accSel = document.getElementById('txFilterAccount');
    catSel.innerHTML = '<option value="">Semua Kategori</option>' + State.categories.map(c => `<option value="${c.id}">${U.escapeHTML(c.name)}</option>`).join('');
    accSel.innerHTML = '<option value="">Semua Akun</option>' + State.accounts.map(a => `<option value="${a.id}">${U.escapeHTML(a.name)}</option>`).join('');
  },
  getFilteredList() {
    let list = [...State.transactions];
    const q = document.getElementById('txSearch').value.toLowerCase().trim();
    const type = document.getElementById('txFilterType').value;
    const cat = document.getElementById('txFilterCategory').value;
    const acc = document.getElementById('txFilterAccount').value;
    const from = document.getElementById('txFilterFrom').value;
    const to = document.getElementById('txFilterTo').value;
    const sort = document.getElementById('txSort').value;
    if (q) list = list.filter(t => (t.note||'').toLowerCase().includes(q) || (t.categoryName||'').toLowerCase().includes(q));
    if (type) list = list.filter(t => t.type === type);
    if (cat) list = list.filter(t => t.category === cat);
    if (acc) list = list.filter(t => t.account === acc || t.toAccount === acc);
    if (from) list = list.filter(t => U.fmtDateISO(new Date(t.date)) >= from);
    if (to) list = list.filter(t => U.fmtDateISO(new Date(t.date)) <= to);
    list.sort((a,b) => {
      switch(sort) {
        case 'date-asc': return new Date(a.date) - new Date(b.date);
        case 'amount-desc': return (b.amount||0) - (a.amount||0);
        case 'amount-asc': return (a.amount||0) - (b.amount||0);
        default: return new Date(b.date) - new Date(a.date);
      }
    });
    return list;
  },
  renderTxItem(t) {
    const cat = State.categories.find(c => c.id === t.category);
    const acc = State.accounts.find(a => a.id === t.account);
    const toAcc = State.accounts.find(a => a.id === t.toAccount);
    let icon = '💸', cls = 'out', amtCls = 'out', sign = '-';
    if (t.type === 'income') { icon = '💰'; cls = 'in'; amtCls = 'in'; sign = '+'; }
    else if (t.type === 'transfer') { icon = '🔁'; cls = 'tr'; amtCls = ''; sign = ''; }
    else if (t.type === 'debt-payment') { icon = '💳'; cls = 'out'; amtCls = 'out'; sign = '-'; }
    else if (t.type === 'savings-deposit') { icon = '🎯'; cls = 'tr'; amtCls = 'out'; sign = '-'; }
    else if (t.type === 'savings-withdraw') { icon = '🎯'; cls = 'tr'; amtCls = 'in'; sign = '+'; }
    const catName = cat ? cat.name : (t.type === 'transfer' ? 'Transfer' : t.type);
    const accName = acc ? acc.name : '';
    const sub = t.type === 'transfer' ? `${accName} → ${toAcc ? toAcc.name : '-'}` : `${catName} • ${accName}`;
    return `
      <div class="list-item" data-id="${t.id}">
        <div class="list-icon ${cls}">${icon}</div>
        <div class="list-body">
          <div class="list-title">${U.escapeHTML(t.note || catName)}</div>
          <div class="list-sub">${U.escapeHTML(sub)} • ${U.fmtDateShort(t.date)}</div>
        </div>
        <div class="list-amount ${amtCls}">${sign}${U.fmtMoney(t.amount)}</div>
        <div class="list-actions">
          <button title="Detail" data-act="view">👁️</button>
          <button title="Edit" data-act="edit">✏️</button>
          <button title="Hapus" data-act="del">🗑️</button>
        </div>
      </div>`;
  },
  renderList() {
    const list = this.getFilteredList();
    const container = document.getElementById('listTransactions');
    if (!list.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>Tidak ada transaksi sesuai filter</div>'; return; }
    container.innerHTML = list.map(t => this.renderTxItem(t)).join('');
  },
  openForm(tx = null) {
    const isEdit = !!tx;
    const t = tx || { type:'expense', date:U.todayISO(), amount:'', category:'', account:'', note:'', method:'' };
    const typeOpts = ['income','expense','transfer','debt-payment','savings-deposit','savings-withdraw'].map(tp => {
      const labels = { income:'Pemasukan', expense:'Pengeluaran', transfer:'Transfer', 'debt-payment':'Pembayaran Utang', 'savings-deposit':'Setoran Tabungan', 'savings-withdraw':'Penarikan Tabungan' };
      return `<option value="${tp}" ${t.type===tp?'selected':''}>${labels[tp]}</option>`;
    }).join('');
    const catOpts = State.categories.map(c => `<option value="${c.id}" ${t.category===c.id?'selected':''}>${U.escapeHTML(c.name)}</option>`).join('');
    const accOpts = State.accounts.map(a => `<option value="${a.id}" ${t.account===a.id?'selected':''}>${U.escapeHTML(a.name)}</option>`).join('');
    const savOpts = State.savings.map(s => `<option value="${s.id}" ${t.savingId===s.id?'selected':''}>${U.escapeHTML(s.name)}</option>`).join('');
    const debtOpts = State.debts.filter(d=>d.status!=='lunas').map(d => `<option value="${d.id}" ${t.debtId===d.id?'selected':''}>${U.escapeHTML(d.creditor)}</option>`).join('');
    const body = `
      <div class="form-group"><label>Jenis Transaksi</label><select id="fType" class="select">${typeOpts}</select></div>
      <div class="form-row">
        <div class="form-group"><label>Tanggal</label><input type="date" id="fDate" class="input" value="${U.fmtDateISO(new Date(t.date))}" /></div>
        <div class="form-group"><label>Nominal</label><input type="number" id="fAmount" class="input" value="${t.amount||''}" placeholder="0" min="0" step="1" /></div>
      </div>
      <div class="form-row">
        <div class="form-group" id="fCatGroup"><label>Kategori</label><select id="fCategory" class="select"><option value="">— Pilih —</option>${catOpts}</select></div>
        <div class="form-group"><label>Akun ${t.type==='transfer'?'Sumber':''}</label><select id="fAccount" class="select"><option value="">— Pilih —</option>${accOpts}</select></div>
      </div>
      <div class="form-row" id="fRow2" style="display:none">
        <div class="form-group" id="fToAccGroup"><label>Akun Tujuan</label><select id="fToAccount" class="select"><option value="">— Pilih —</option>${accOpts}</select></div>
        <div class="form-group" id="fSavGroup"><label>Target Tabungan</label><select id="fSaving" class="select"><option value="">— Pilih —</option>${savOpts}</select></div>
        <div class="form-group" id="fDebtGroup"><label>Utang</label><select id="fDebt" class="select"><option value="">— Pilih —</option>${debtOpts}</select></div>
      </div>
      <div class="form-group"><label>Metode Pembayaran</label><input type="text" id="fMethod" class="input" value="${U.escapeHTML(t.method||'')}" placeholder="Opsional" /></div>
      <div class="form-group"><label>Catatan</label><textarea id="fNote" class="input" placeholder="Opsional">${U.escapeHTML(t.note||'')}</textarea></div>
      <div class="form-group"><label>Lampiran (opsional)</label><input type="file" id="fAttachment" class="input" accept="image/*" /></div>
      ${t.attachment ? `<div class="muted">Lampiran saat ini: <a href="${t.attachment}" target="_blank">Lihat</a> <button class="btn btn-sm" id="fRemoveAtt">Hapus</button></div>` : ''}
    `;
    const footer = `
      <button class="btn" onclick="Modal.close()">Batal</button>
      <button class="btn btn-primary" id="fSave">${isEdit?'Simpan Perubahan':'Tambah'}</button>
    `;
    Modal.open(isEdit ? 'Edit Transaksi' : 'Tambah Transaksi', body, footer);

    const toggleFields = () => {
      const tp = document.getElementById('fType').value;
      document.getElementById('fCatGroup').style.display = (tp==='income'||tp==='expense') ? '' : 'none';
      document.getElementById('fRow2').style.display = (tp==='transfer'||tp==='savings-deposit'||tp==='savings-withdraw'||tp==='debt-payment') ? 'grid' : 'none';
      document.getElementById('fToAccGroup').style.display = tp==='transfer' ? '' : 'none';
      document.getElementById('fSavGroup').style.display = (tp==='savings-deposit'||tp==='savings-withdraw') ? '' : 'none';
      document.getElementById('fDebtGroup').style.display = tp==='debt-payment' ? '' : 'none';
    };
    toggleFields();
    document.getElementById('fType').addEventListener('change', toggleFields);

    document.getElementById('fRemoveAtt')?.addEventListener('click', () => {
      if (tx) { tx.attachment = null; DB.put('transactions', tx).then(() => { Toast.show('Lampiran dihapus','success'); this.openForm(tx); Pages.dashboard.refresh(); }); }
    });

    document.getElementById('fSave').onclick = () => {
      const tp = document.getElementById('fType').value;
      const amount = U.parseNum(document.getElementById('fAmount').value);
      if (amount <= 0) { Toast.show('Nominal harus lebih dari 0','error'); return; }
      const date = document.getElementById('fDate').value;
      if (!date) { Toast.show('Tanggal wajib diisi','error'); return; }
      const account = document.getElementById('fAccount').value;
      if (!account) { Toast.show('Akun wajib dipilih','error'); return; }
      if ((tp==='income'||tp==='expense') && !document.getElementById('fCategory').value) { Toast.show('Kategori wajib dipilih','error'); return; }
      if (tp==='transfer') {
        const toAcc = document.getElementById('fToAccount').value;
        if (!toAcc) { Toast.show('Akun tujuan wajib dipilih','error'); return; }
        if (toAcc === account) { Toast.show('Akun sumber dan tujuan tidak boleh sama','error'); return; }
      }

      const handleAttachment = (cb) => {
        const file = document.getElementById('fAttachment').files[0];
        if (!file) return cb(tx ? tx.attachment : null);
        if (file.size > 2 * 1024 * 1024) { Toast.show('Ukuran file maksimal 2MB','error'); return; }
        const reader = new FileReader();
        reader.onload = e => cb(e.target.result);
        reader.onerror = () => cb(null);
        reader.readAsDataURL(file);
      };

      handleAttachment(att => {
        const data = {
          id: tx ? tx.id : U.uid(),
          type: tp,
          date: new Date(date + 'T' + (new Date()).toTimeString().slice(0,5)).toISOString(),
          amount,
          category: (tp==='income'||tp==='expense') ? document.getElementById('fCategory').value : null,
          account,
          toAccount: tp==='transfer' ? document.getElementById('fToAccount').value : null,
          savingId: (tp==='savings-deposit'||tp==='savings-withdraw') ? document.getElementById('fSaving').value : null,
          debtId: tp==='debt-payment' ? document.getElementById('fDebt').value : null,
          method: document.getElementById('fMethod').value.trim(),
          note: document.getElementById('fNote').value.trim(),
          attachment: att,
          createdAt: tx ? tx.createdAt : Date.now(),
          updatedAt: Date.now()
        };
        DB.put('transactions', data).then(async () => {
          // Update saldo tabungan jika relevan
          if (data.type === 'savings-deposit' && data.savingId) {
            const s = State.savings.find(x => x.id === data.savingId);
            if (s) { s.collected = (Number(s.collected)||0) + amount; await DB.put('savings', s);
              await DB.put('savingLogs', { id:U.uid(), savingId:s.id, type:'deposit', amount, date:data.date, txId:data.id }); }
          } else if (data.type === 'savings-withdraw' && data.savingId) {
            const s = State.savings.find(x => x.id === data.savingId);
            if (s) { s.collected = Math.max(0, (Number(s.collected)||0) - amount); await DB.put('savings', s);
              await DB.put('savingLogs', { id:U.uid(), savingId:s.id, type:'withdraw', amount, date:data.date, txId:data.id }); }
          }
          if (data.type === 'debt-payment' && data.debtId) {
            const d = State.debts.find(x => x.id === data.debtId);
            if (d) {
              d.remaining = Math.max(0, (Number(d.remaining)||0) - amount);
              d.paid = (Number(d.paid)||0) + amount;
              if (d.remaining <= 0) d.status = 'lunas';
              await DB.put('debts', d);
              await DB.put('debtLogs', { id:U.uid(), debtId:d.id, amount, date:data.date, txId:data.id, note:data.note });
            }
          }
          await reloadAll();
          Toast.show(isEdit ? 'Transaksi diperbarui' : 'Transaksi ditambahkan', 'success');
          Modal.close();
          Pages.dashboard.refresh();
          this.renderList();
        }).catch(err => { Toast.show('Gagal menyimpan: ' + err.message, 'error'); });
      });
    };
  },
  viewDetail(id) {
    const t = State.transactions.find(x => x.id === id);
    if (!t) return;
    const cat = State.categories.find(c => c.id === t.category);
    const acc = State.accounts.find(a => a.id === t.account);
    const toAcc = State.accounts.find(a => a.id === t.toAccount);
    const sav = State.savings.find(s => s.id === t.savingId);
    const debt = State.debts.find(d => d.id === t.debtId);
    const typeLabels = { income:'Pemasukan', expense:'Pengeluaran', transfer:'Transfer', 'debt-payment':'Pembayaran Utang', 'savings-deposit':'Setoran Tabungan', 'savings-withdraw':'Penarikan Tabungan' };
    const body = `
      <div style="display:grid;gap:10px">
        <div><strong>Jenis:</strong> ${typeLabels[t.type]}</div>
        <div><strong>Tanggal:</strong> ${U.fmtDate(t.date)}</div>
        <div><strong>Nominal:</strong> ${U.fmtMoney(t.amount)}</div>
        ${cat?`<div><strong>Kategori:</strong> ${U.escapeHTML(cat.name)}</div>`:''}
        <div><strong>Akun:</strong> ${U.escapeHTML(acc?acc.name:'-')}</div>
        ${toAcc?`<div><strong>Akun Tujuan:</strong> ${U.escapeHTML(toAcc.name)}</div>`:''}
        ${sav?`<div><strong>Target Tabungan:</strong> ${U.escapeHTML(sav.name)}</div>`:''}
        ${debt?`<div><strong>Utang:</strong> ${U.escapeHTML(debt.creditor)}</div>`:''}
        ${t.method?`<div><strong>Metode:</strong> ${U.escapeHTML(t.method)}</div>`:''}
        ${t.note?`<div><strong>Catatan:</strong> ${U.escapeHTML(t.note)}</div>`:''}
        ${t.attachment?`<div><strong>Lampiran:</strong><br><img src="${t.attachment}" style="max-width:100%;border-radius:8px;margin-top:6px" /></div>`:''}
      </div>
    `;
    Modal.open('Detail Transaksi', body, `<button class="btn" onclick="Modal.close()">Tutup</button>`);
  }
};

/* ---------- TABUNGAN ---------- */
Pages.savings = {
  refresh() {
    const total = State.savings.reduce((s,x)=>s+(Number(x.collected)||0),0);
    const target = State.savings.reduce((s,x)=>s+(Number(x.target)||0),0);
    document.getElementById('savingsTotal').textContent = U.fmtMoney(total);
    document.getElementById('savingsTarget').textContent = U.fmtMoney(target);
    document.getElementById('savingsRemaining').textContent = U.fmtMoney(Math.max(0, target - total));
    this.renderList();
  },
  renderList() {
    const container = document.getElementById('listSavings');
    if (!State.savings.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">🎯</div>Belum ada target tabungan</div>'; return; }
    const now = new Date();
    container.innerHTML = State.savings.map(s => {
      const pct = s.target > 0 ? Math.min(100, (s.collected / s.target) * 100) : 0;
      const remaining = Math.max(0, s.target - s.collected);
      let status = 'Berjalan', statusCls = 'info';
      if (pct >= 100) { status = 'Tercapai'; statusCls = 'ok'; }
      else if (s.deadline && new Date(s.deadline) < now) { status = 'Terlambat'; statusCls = 'warn'; }
      // Estimasi setoran bulanan
      let monthlyEst = '-';
      if (s.deadline && remaining > 0) {
        const months = Math.max(1, Math.ceil((new Date(s.deadline) - now) / (1000*60*60*24*30)));
        monthlyEst = U.fmtMoney(Math.ceil(remaining / months));
      }
      return `
        <div class="list-item" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;gap:12px;align-items:center;width:100%">
            <div class="list-icon tr">🎯</div>
            <div class="list-body">
              <div class="list-title">${U.escapeHTML(s.name)} <span class="badge ${statusCls}">${status}</span></div>
              <div class="list-sub">Target: ${U.fmtMoney(s.target)} • Terkumpul: ${U.fmtMoney(s.collected)} • Sisa: ${U.fmtMoney(remaining)}</div>
              <div class="progress"><div class="progress-bar ${pct>=100?'':pct>=80?'warn':''}" style="width:${pct}%"></div></div>
              <div class="progress-label"><span>${pct.toFixed(1)}%</span><span>Est. bulanan: ${monthlyEst}</span></div>
              ${s.deadline?`<div class="list-sub">Tenggat: ${U.fmtDate(s.deadline)}</div>`:''}
            </div>
            <div class="list-actions">
              <button title="Setor" data-act="deposit">💵</button>
              <button title="Tarik" data-act="withdraw">💸</button>
              <button title="Edit" data-act="edit">✏️</button>
              <button title="Hapus" data-act="del">🗑️</button>
            </div>
          </div>
        </div>`;
    }).join('');
  },
  openForm(s = null) {
    const isEdit = !!s;
    const data = s || { name:'', target:0, collected:0, startDate:U.todayISO(), deadline:'', note:'' };
    const body = `
      <div class="form-group"><label>Nama Target</label><input type="text" id="sName" class="input" value="${U.escapeHTML(data.name)}" placeholder="Contoh: Dana Darurat" /></div>
      <div class="form-row">
        <div class="form-group"><label>Target Dana</label><input type="number" id="sTarget" class="input" value="${data.target||''}" min="0" /></div>
        <div class="form-group"><label>Terkumpul Saat Ini</label><input type="number" id="sCollected" class="input" value="${data.collected||0}" min="0" ${isEdit?'readonly':''} /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Tanggal Mulai</label><input type="date" id="sStart" class="input" value="${U.fmtDateISO(new Date(data.startDate))}" /></div>
        <div class="form-group"><label>Tenggat (Opsional)</label><input type="date" id="sDeadline" class="input" value="${data.deadline?U.fmtDateISO(new Date(data.deadline)):''}" /></div>
      </div>
      <div class="form-group"><label>Catatan</label><textarea id="sNote" class="input">${U.escapeHTML(data.note||'')}</textarea></div>
    `;
    Modal.open(isEdit?'Edit Target':'Target Baru', body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="sSave">${isEdit?'Simpan':'Tambah'}</button>`);
    document.getElementById('sSave').onclick = () => {
      const name = document.getElementById('sName').value.trim();
      const target = U.parseNum(document.getElementById('sTarget').value);
      if (!name) { Toast.show('Nama wajib diisi','error'); return; }
      if (target <= 0) { Toast.show('Target harus lebih dari 0','error'); return; }
      const rec = {
        id: data.id || U.uid(),
        name, target,
        collected: isEdit ? data.collected : U.parseNum(document.getElementById('sCollected').value),
        startDate: document.getElementById('sStart').value,
        deadline: document.getElementById('sDeadline').value,
        note: document.getElementById('sNote').value.trim(),
        status: 'aktif'
      };
      DB.put('savings', rec).then(async () => { await reloadAll(); Toast.show(isEdit?'Target diperbarui':'Target ditambahkan','success'); Modal.close(); this.refresh(); Pages.dashboard.refresh(); });
    };
  },
  deposit(s) {
    const body = `
      <div class="form-group"><label>Nominal Setoran</label><input type="number" id="dAmount" class="input" min="0" placeholder="0" /></div>
      <div class="form-group"><label>Akun Sumber</label><select id="dAccount" class="select">${State.accounts.map(a=>`<option value="${a.id}">${U.escapeHTML(a.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Catatan</label><input type="text" id="dNote" class="input" placeholder="Opsional" /></div>
    `;
    Modal.open('Setoran — ' + s.name, body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="dSave">Setor</button>`);
    document.getElementById('dSave').onclick = async () => {
      const amount = U.parseNum(document.getElementById('dAmount').value);
      if (amount <= 0) { Toast.show('Nominal harus lebih dari 0','error'); return; }
      const account = document.getElementById('dAccount').value;
      const txData = {
        id: U.uid(), type:'savings-deposit', date:new Date().toISOString(),
        amount, account, savingId:s.id, note:document.getElementById('dNote').value.trim()
      };
      await DB.put('transactions', txData);
      s.collected = (Number(s.collected)||0) + amount;
      await DB.put('savings', s);
      await DB.put('savingLogs', { id:U.uid(), savingId:s.id, type:'deposit', amount, date:txData.date, txId:txData.id });
      await reloadAll();
      Toast.show('Setoran tercatat','success');
      Modal.close(); this.refresh(); Pages.dashboard.refresh();
    };
  },
  withdraw(s) {
    if (s.collected <= 0) { Toast.show('Saldo tabungan kosong','error'); return; }
    const body = `
      <div class="muted">Saldo tersedia: ${U.fmtMoney(s.collected)}</div>
      <div class="form-group"><label>Nominal Penarikan</label><input type="number" id="wAmount" class="input" min="0" max="${s.collected}" /></div>
      <div class="form-group"><label>Akun Tujuan</label><select id="wAccount" class="select">${State.accounts.map(a=>`<option value="${a.id}">${U.escapeHTML(a.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Catatan</label><input type="text" id="wNote" class="input" /></div>
    `;
    Modal.open('Penarikan — ' + s.name, body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="wSave">Tarik</button>`);
    document.getElementById('wSave').onclick = async () => {
      const amount = U.parseNum(document.getElementById('wAmount').value);
      if (amount <= 0 || amount > s.collected) { Toast.show('Nominal tidak valid','error'); return; }
      const account = document.getElementById('wAccount').value;
      const txData = {
        id: U.uid(), type:'savings-withdraw', date:new Date().toISOString(),
        amount, account, savingId:s.id, note:document.getElementById('wNote').value.trim()
      };
      await DB.put('transactions', txData);
      s.collected = Math.max(0, (Number(s.collected)||0) - amount);
      await DB.put('savings', s);
      await DB.put('savingLogs', { id:U.uid(), savingId:s.id, type:'withdraw', amount, date:txData.date, txId:txData.id });
      await reloadAll();
      Toast.show('Penarikan tercatat','success');
      Modal.close(); this.refresh(); Pages.dashboard.refresh();
    };
  }
};

/* ---------- UTANG ---------- */
Pages.debts = {
  refresh() {
    const active = State.debts.filter(d => d.status !== 'lunas');
    const total = active.reduce((s,d) => s + (Number(d.remaining)||0), 0);
    const now = new Date();
    const thisMonth = active.filter(d => {
      const due = new Date(d.dueDate);
      return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth();
    }).reduce((s,d) => s + (Number(d.installment)||0), 0);
    const soon = active.filter(d => {
      const due = new Date(d.dueDate);
      const diff = U.daysBetween(now, due);
      return diff >= 0 && diff <= 7;
    }).length;
    const overdue = active.filter(d => new Date(d.dueDate) < now).length;
    document.getElementById('debtTotal').textContent = U.fmtMoney(total);
    document.getElementById('debtMonthly').textContent = U.fmtMoney(thisMonth);
    document.getElementById('debtDueSoon').textContent = soon;
    document.getElementById('debtOverdue').textContent = overdue;
    this.renderList();
  },
  renderList() {
    const container = document.getElementById('listDebts');
    if (!State.debts.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">💳</div>Belum ada catatan utang</div>'; return; }
    const now = new Date();
    container.innerHTML = State.debts.map(d => {
      const pct = d.total > 0 ? Math.min(100, ((d.total - d.remaining) / d.total) * 100) : 0;
      const due = new Date(d.dueDate);
      const diff = U.daysBetween(now, due);
      let statusBadge = '<span class="badge ok">Lunas</span>';
      let warn = '';
      if (d.status !== 'lunas') {
        if (diff < 0) { statusBadge = '<span class="badge warn">Terlambat</span>'; warn = 'border-left:3px solid var(--danger)'; }
        else if (diff <= 7) { statusBadge = '<span class="badge warn">Segera Jatuh Tempo</span>'; warn = 'border-left:3px solid var(--warn)'; }
        else statusBadge = '<span class="badge info">Aktif</span>';
      }
      return `
        <div class="list-item" style="flex-direction:column;align-items:stretch;${warn}">
          <div style="display:flex;gap:12px;align-items:center;width:100%">
            <div class="list-icon out">💳</div>
            <div class="list-body">
              <div class="list-title">${U.escapeHTML(d.creditor)} ${statusBadge}</div>
              <div class="list-sub">${U.escapeHTML(d.type||'')} • Sisa: ${U.fmtMoney(d.remaining)} / ${U.fmtMoney(d.total)}</div>
              <div class="progress"><div class="progress-bar ${pct>=100?'':pct>=80?'warn':''}" style="width:${pct}%"></div></div>
              <div class="progress-label"><span>Cicilan: ${U.fmtMoney(d.installment)}</span><span>Jatuh tempo: ${U.fmtDateShort(d.dueDate)}</span></div>
            </div>
            <div class="list-actions">
              <button title="Bayar" data-act="pay">💵</button>
              <button title="Edit" data-act="edit">✏️</button>
              <button title="Hapus" data-act="del">🗑️</button>
            </div>
          </div>
        </div>`;
    }).join('');
  },
  openForm(d = null) {
    const isEdit = !!d;
    const data = d || { creditor:'', type:'paylater', total:0, interest:0, remaining:0, paid:0, installment:0, dueDate:U.todayISO(), tenor:1, totalInstallments:1, note:'', status:'aktif' };
    const body = `
      <div class="form-group"><label>Nama Kreditur / Penyedia</label><input type="text" id="dCred" class="input" value="${U.escapeHTML(data.creditor)}" placeholder="Contoh: Shopee PayLater" /></div>
      <div class="form-row">
        <div class="form-group"><label>Jenis Utang</label><select id="dType" class="select">
          <option value="paylater" ${data.type==='paylater'?'selected':''}>Paylater</option>
          <option value="pinjaman" ${data.type==='pinjaman'?'selected':''}>Pinjaman Pribadi</option>
          <option value="cicilan" ${data.type==='cicilan'?'selected':''}>Cicilan Barang</option>
          <option value="kartu_kredit" ${data.type==='kartu_kredit'?'selected':''}>Kartu Kredit</option>
          <option value="lain" ${data.type==='lain'?'selected':''}>Lainnya</option>
        </select></div>
        <div class="form-group"><label>Total Pokok</label><input type="number" id="dTotal" class="input" value="${data.total||''}" min="0" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Bunga / Biaya</label><input type="number" id="dInterest" class="input" value="${data.interest||0}" min="0" /></div>
        <div class="form-group"><label>Nominal Cicilan</label><input type="number" id="dInst" class="input" value="${data.installment||''}" min="0" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Jatuh Tempo</label><input type="date" id="dDue" class="input" value="${U.fmtDateISO(new Date(data.dueDate))}" /></div>
        <div class="form-group"><label>Jumlah Cicilan</label><input type="number" id="dTenor" class="input" value="${data.totalInstallments||1}" min="1" /></div>
      </div>
      <div class="form-group"><label>Nomor Referensi (Opsional)</label><input type="text" id="dRef" class="input" value="${U.escapeHTML(data.reference||'')}" /></div>
      <div class="form-group"><label>Catatan</label><textarea id="dNote" class="input">${U.escapeHTML(data.note||'')}</textarea></div>
    `;
    Modal.open(isEdit?'Edit Utang':'Tambah Utang', body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="dSave">${isEdit?'Simpan':'Tambah'}</button>`);
    document.getElementById('dSave').onclick = async () => {
      const creditor = document.getElementById('dCred').value.trim();
      const total = U.parseNum(document.getElementById('dTotal').value);
      if (!creditor) { Toast.show('Nama kreditur wajib','error'); return; }
      if (total <= 0) { Toast.show('Total pokok harus lebih dari 0','error'); return; }
      const interest = U.parseNum(document.getElementById('dInterest').value);
      const totalBill = total + interest;
      const rec = {
        id: data.id || U.uid(),
        creditor,
        type: document.getElementById('dType').value,
        total, interest, total: totalBill,
        remaining: isEdit ? data.remaining : totalBill,
        paid: isEdit ? data.paid : 0,
        installment: U.parseNum(document.getElementById('dInst').value),
        dueDate: document.getElementById('dDue').value,
        totalInstallments: parseInt(document.getElementById('dTenor').value) || 1,
        reference: document.getElementById('dRef').value.trim(),
        note: document.getElementById('dNote').value.trim(),
        status: 'aktif',
        createdAt: data.createdAt || Date.now()
      };
      await DB.put('debts', rec);
      await reloadAll();
      Toast.show(isEdit?'Utang diperbarui':'Utang ditambahkan','success');
      Modal.close(); this.refresh(); Pages.dashboard.refresh();
    };
  },
  pay(d) {
    if (d.status === 'lunas') { Toast.show('Utang sudah lunas','info'); return; }
    const body = `
      <div class="muted">Sisa utang: ${U.fmtMoney(d.remaining)}</div>
      <div class="form-group"><label>Nominal Pembayaran</label><input type="number" id="pAmount" class="input" value="${d.installment||''}" min="0" max="${d.remaining}" /></div>
      <div class="form-group"><label>Akun Pembayaran</label><select id="pAccount" class="select">${State.accounts.map(a=>`<option value="${a.id}">${U.escapeHTML(a.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Catatan</label><input type="text" id="pNote" class="input" placeholder="Opsional" /></div>
      <div class="muted" style="margin-top:8px">💡 Pembayaran akan tercatat sebagai transaksi "Pembayaran Utang" yang mengurangi saldo akun dan sisa utang secara bersamaan.</div>
    `;
    Modal.open('Bayar — ' + d.creditor, body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="pSave">Bayar</button>`);
    document.getElementById('pSave').onclick = async () => {
      const amount = U.parseNum(document.getElementById('pAmount').value);
      if (amount <= 0 || amount > d.remaining) { Toast.show('Nominal tidak valid','error'); return; }
      const account = document.getElementById('pAccount').value;
      const txData = {
        id: U.uid(), type:'debt-payment', date:new Date().toISOString(),
        amount, account, debtId:d.id, note:document.getElementById('pNote').value.trim()
      };
      await DB.put('transactions', txData);
      d.remaining = Math.max(0, (Number(d.remaining)||0) - amount);
      d.paid = (Number(d.paid)||0) + amount;
      if (d.remaining <= 0) d.status = 'lunas';
      await DB.put('debts', d);
      await DB.put('debtLogs', { id:U.uid(), debtId:d.id, amount, date:txData.date, txId:txData.id });
      await reloadAll();
      Toast.show('Pembayaran tercatat','success');
      Modal.close(); this.refresh(); Pages.dashboard.refresh();
    };
  }
};

/* ---------- ANGGARAN ---------- */
Pages.budget = {
  refresh() {
    const monthInput = document.getElementById('budgetMonth');
    if (!monthInput.value) {
      const now = new Date();
      monthInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    }
    this.renderList();
    this.renderChart();
  },
  getMonthRange() {
    const v = document.getElementById('budgetMonth').value;
    if (!v) return null;
    const [y, m] = v.split('-').map(Number);
    const from = new Date(y, m-1, 1);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    return { from, to };
  },
  renderList() {
    const container = document.getElementById('listBudget');
    const period = this.getMonthRange();
    if (!period) { container.innerHTML = ''; return; }
    const expenseCats = State.categories.filter(c => c.type === 'expense');
    container.innerHTML = expenseCats.map(c => {
      const budget = State.budgets.find(b => b.categoryId === c.id && b.month === document.getElementById('budgetMonth').value);
      const limit = budget ? Number(budget.amount) : 0;
      const spent = State.transactions.filter(t => t.type === 'expense' && t.category === c.id && new Date(t.date) >= period.from && new Date(t.date) <= period.to).reduce((s,t)=>s+Number(t.amount),0);
      const remaining = limit - spent;
      const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
      const cls = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : '';
      const warn = pct >= 100 ? '⚠️ Melebihi anggaran!' : pct >= 80 ? '⚠️ Hampir mencapai batas' : '';
      return `
        <div class="list-item" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;gap:12px;align-items:center;width:100%">
            <div class="list-icon out" style="background:${c.color}20;color:${c.color}">${c.icon||'📦'}</div>
            <div class="list-body">
              <div class="list-title">${U.escapeHTML(c.name)}</div>
              <div class="list-sub">Anggaran: ${U.fmtMoney(limit)} • Terpakai: ${U.fmtMoney(spent)} • Sisa: ${U.fmtMoney(remaining)}</div>
              ${limit > 0 ? `<div class="progress"><div class="progress-bar ${cls}" style="width:${pct}%"></div></div>
              <div class="progress-label"><span>${pct.toFixed(1)}%</span><span>${warn}</span></div>` : '<div class="muted">Belum diatur</div>'}
            </div>
            <div class="list-actions"><button title="Atur" data-act="set" data-cat="${c.id}">✏️</button></div>
          </div>
        </div>`;
    }).join('');
  },
  renderChart() {
    const container = document.getElementById('chartBudget');
    const expenseCats = State.categories.filter(c => c.type === 'expense');
    const data = expenseCats.map(c => {
      const spent = State.transactions.filter(t => t.type === 'expense' && t.category === c.id).reduce((s,t)=>s+Number(t.amount),0);
      return { label: c.name, value: spent, color: c.color };
    }).filter(d => d.value > 0).sort((a,b) => b.value - a.value).slice(0, 8);
    Chart.bar(container, data);
  },
  setBudget(catId) {
    const cat = State.categories.find(c => c.id === catId);
    const month = document.getElementById('budgetMonth').value;
    const existing = State.budgets.find(b => b.categoryId === catId && b.month === month);
    const body = `
      <div class="muted">Kategori: ${U.escapeHTML(cat.name)} • Periode: ${month}</div>
      <div class="form-group"><label>Batas Anggaran</label><input type="number" id="bAmount" class="input" value="${existing?existing.amount:''}" min="0" /></div>
    `;
    Modal.open('Atur Anggaran', body, `<button class="btn btn-danger" id="bDel" ${existing?'':'disabled'}>Hapus</button><button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="bSave">Simpan</button>`);
    document.getElementById('bSave').onclick = async () => {
      const amount = U.parseNum(document.getElementById('bAmount').value);
      if (amount < 0) { Toast.show('Nominal tidak valid','error'); return; }
      const rec = { id: existing ? existing.id : U.uid(), categoryId: catId, month, amount };
      await DB.put('budgets', rec);
      await reloadAll();
      Toast.show('Anggaran disimpan','success');
      Modal.close(); this.renderList();
    };
    document.getElementById('bDel').onclick = async () => {
      if (!existing) return;
      Modal.confirm('Hapus Anggaran', 'Yakin ingin menghapus anggaran kategori ini?', async () => {
        await DB.delete('budgets', existing.id);
        await reloadAll();
        Toast.show('Anggaran dihapus','success');
        this.renderList();
      });
    };
  }
};

/* ---------- KALENDER ---------- */
Pages.calendar = {
  refresh() {
    this.render();
  },
  render() {
    const d = State.calendarDate;
    const y = d.getFullYear(), m = d.getMonth();
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    document.getElementById('calendarTitle').textContent = `${bulan[m]} ${y}`;
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m+1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Senin=0
    const totalDays = lastDay.getDate();
    const today = new Date();
    const dayNames = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
    let html = dayNames.map(n => `<div class="cal-header">${n}</div>`).join('');
    // Previous month padding
    const prevLast = new Date(y, m, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      html += `<div class="cal-day other"><div class="day-num">${prevLast - i}</div></div>`;
    }
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(y, m, day);
      const dateStr = U.fmtDateISO(date);
      const isToday = U.sameDay(date, today);
      // Events
      const txIn = State.transactions.filter(t => U.fmtDateISO(new Date(t.date)) === dateStr && t.type === 'income').length;
      const txOut = State.transactions.filter(t => U.fmtDateISO(new Date(t.date)) === dateStr && t.type === 'expense').length;
      const bills = State.debts.filter(db => db.status !== 'lunas' && U.fmtDateISO(new Date(db.dueDate)) === dateStr).length;
      const sch = State.schedules.filter(s => U.fmtDateISO(new Date(s.date)) === dateStr).length;
      let dots = '';
      if (txIn) dots += '<span class="cal-dot in"></span>';
      if (txOut) dots += '<span class="cal-dot out"></span>';
      if (bills) dots += '<span class="cal-dot bill"></span>';
      if (sch) dots += '<span class="cal-dot save"></span>';
      html += `<div class="cal-day ${isToday?'today':''}" data-date="${dateStr}"><div class="day-num">${day}</div><div>${dots}</div></div>`;
    }
    // Next month padding
    const used = startDow + totalDays;
    const pad = (7 - (used % 7)) % 7;
    for (let i = 1; i <= pad; i++) {
      html += `<div class="cal-day other"><div class="day-num">${i}</div></div>`;
    }
    document.getElementById('calendarGrid').innerHTML = html;
    // Click day
    document.querySelectorAll('.cal-day:not(.other)').forEach(el => {
      el.onclick = () => this.showDay(el.dataset.date);
    });
    // Agenda
    this.renderAgenda();
  },
  renderAgenda() {
    const d = State.calendarDate;
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59);
    const items = [];
    State.schedules.filter(s => { const sd = new Date(s.date); return sd >= from && sd <= to; }).forEach(s => items.push({ date:s.date, title:s.title, type:'schedule', data:s }));
    State.debts.filter(db => db.status !== 'lunas').forEach(db => { const dd = new Date(db.dueDate); if (dd >= from && dd <= to) items.push({ date:db.dueDate, title:'Jatuh Tempo: '+db.creditor, type:'debt', data:db }); });
    items.sort((a,b) => new Date(a.date) - new Date(b.date));
    const container = document.getElementById('listAgenda');
    if (!items.length) { container.innerHTML = '<div class="empty"><div class="empty-icon">📅</div>Tidak ada agenda bulan ini</div>'; return; }
    container.innerHTML = items.map(it => `
      <div class="list-item" ${it.type==='debt'?'style="border-left:3px solid var(--warn)"':''}>
        <div class="list-icon ${it.type==='debt'?'out':'tr'}">${it.type==='debt'?'💳':'📅'}</div>
        <div class="list-body">
          <div class="list-title">${U.escapeHTML(it.title)}</div>
          <div class="list-sub">${U.fmtDate(it.date)}</div>
        </div>
        ${it.data.amount?`<div class="list-amount out">${U.fmtMoney(it.data.amount)}</div>`:''}
        ${it.type==='schedule'?`<div class="list-actions"><button data-act="edit-sch">✏️</button><button data-act="del-sch">🗑️</button></div>`:''}
      </div>`).join('');
  },
  showDay(dateStr) {
    const txs = State.transactions.filter(t => U.fmtDateISO(new Date(t.date)) === dateStr);
    const sch = State.schedules.filter(s => U.fmtDateISO(new Date(s.date)) === dateStr);
    const bills = State.debts.filter(d => d.status !== 'lunas' && U.fmtDateISO(new Date(d.dueDate)) === dateStr);
    let body = `<div class="muted" style="margin-bottom:10px">${U.fmtDate(dateStr)}</div>`;
    if (!txs.length && !sch.length && !bills.length) body += '<div class="empty">Tidak ada aktivitas</div>';
    else {
      if (txs.length) body += '<h4 style="margin:10px 0 6px">Transaksi</h4>' + txs.map(t => `<div style="padding:6px 0;border-bottom:1px solid var(--border)">${U.escapeHTML(t.note||'-')} — ${U.fmtMoney(t.amount)}</div>`).join('');
      if (sch.length) body += '<h4 style="margin:10px 0 6px">Jadwal</h4>' + sch.map(s => `<div style="padding:6px 0;border-bottom:1px solid var(--border)">${U.escapeHTML(s.title)} ${s.amount?'— '+U.fmtMoney(s.amount):''}</div>`).join('');
      if (bills.length) body += '<h4 style="margin:10px 0 6px">Jatuh Tempo</h4>' + bills.map(d => `<div style="padding:6px 0;border-bottom:1px solid var(--border)">${U.escapeHTML(d.creditor)} — ${U.fmtMoney(d.installment)}</div>`).join('');
    }
    Modal.open('Aktivitas Hari Ini', body, `<button class="btn" onclick="Modal.close()">Tutup</button>`);
  },
  openScheduleForm(s = null) {
    const isEdit = !!s;
    const data = s || { title:'', date:U.todayISO(), amount:0, note:'', type:'other' };
    const body = `
      <div class="form-group"><label>Judul</label><input type="text" id="schTitle" class="input" value="${U.escapeHTML(data.title)}" /></div>
      <div class="form-row">
        <div class="form-group"><label>Tanggal</label><input type="date" id="schDate" class="input" value="${U.fmtDateISO(new Date(data.date))}" /></div>
        <div class="form-group"><label>Nominal (Opsional)</label><input type="number" id="schAmount" class="input" value="${data.amount||''}" /></div>
      </div>
      <div class="form-group"><label>Jenis</label><select id="schType" class="select">
        <option value="other" ${data.type==='other'?'selected':''}>Lainnya</option>
        <option value="salary" ${data.type==='salary'?'selected':''}>Gaji</option>
        <option value="bill" ${data.type==='bill'?'selected':''}>Tagihan Rutin</option>
        <option value="installment" ${data.type==='installment'?'selected':''}>Cicilan</option>
        <option value="saving" ${data.type==='saving'?'selected':''}>Setoran Tabungan</option>
      </select></div>
      <div class="form-group"><label>Catatan</label><input type="text" id="schNote" class="input" value="${U.escapeHTML(data.note||'')}" /></div>
    `;
    Modal.open(isEdit?'Edit Jadwal':'Jadwal Baru', body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="schSave">${isEdit?'Simpan':'Tambah'}</button>`);
    document.getElementById('schSave').onclick = async () => {
      const title = document.getElementById('schTitle').value.trim();
      if (!title) { Toast.show('Judul wajib','error'); return; }
      const rec = {
        id: data.id || U.uid(),
        title,
        date: document.getElementById('schDate').value,
        amount: U.parseNum(document.getElementById('schAmount').value),
        type: document.getElementById('schType').value,
        note: document.getElementById('schNote').value.trim()
      };
      await DB.put('schedules', rec);
      await reloadAll();
      Toast.show(isEdit?'Jadwal diperbarui':'Jadwal ditambahkan','success');
      Modal.close(); this.render();
    };
  }
};

/* ---------- LAPORAN ---------- */
Pages.report = {
  refresh() {
    const period = document.getElementById('reportPeriod').value;
    const now = new Date();
    let from, to;
    if (period === 'month') { from = U.startOfMonth(now); to = U.endOfMonth(now); }
    else if (period === 'last-month') { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); from = d; to = U.endOfMonth(d); }
    else if (period === 'year') { from = new Date(now.getFullYear(),0,1); to = new Date(now.getFullYear(),11,31,23,59,59,999); }
    else if (period === 'last-year') { const y = now.getFullYear()-1; from = new Date(y,0,1); to = new Date(y,11,31,23,59,59,999); }
    else {
      document.getElementById('reportFrom').style.display = '';
      document.getElementById('reportTo').style.display = '';
      const f = document.getElementById('reportFrom').value;
      const t = document.getElementById('reportTo').value;
      if (!f || !t) return;
      from = new Date(f+'T00:00:00'); to = new Date(t+'T23:59:59');
    }
    if (period !== 'custom') {
      document.getElementById('reportFrom').style.display = 'none';
      document.getElementById('reportTo').style.display = 'none';
    }
    const txs = State.transactions.filter(t => { const d = new Date(t.date); return d >= from && d <= to; });
    const { income, expense, net } = Calc.sumByType(txs);
    document.getElementById('rptIncome').textContent = U.fmtMoney(income);
    document.getElementById('rptExpense').textContent = U.fmtMoney(expense);
    document.getElementById('rptNet').textContent = U.fmtMoney(net);
    document.getElementById('rptCount').textContent = txs.length;

    // Per kategori
    const byCat = {};
    txs.filter(t => t.type === 'expense').forEach(t => { byCat[t.category] = (byCat[t.category]||0) + Number(t.amount); });
    const catContainer = document.getElementById('rptCategory');
    const catEntries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
    if (!catEntries.length) catContainer.innerHTML = '<div class="empty">Tidak ada pengeluaran</div>';
    else catContainer.innerHTML = catEntries.map(([cid, val]) => {
      const c = State.categories.find(x => x.id === cid);
      const pct = expense > 0 ? (val/expense*100) : 0;
      return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:.88rem"><span>${U.escapeHTML(c?c.name:'Tanpa kategori')}</span><strong>${U.fmtMoney(val)} (${pct.toFixed(1)}%)</strong></div><div class="progress"><div class="progress-bar" style="width:${pct}%;background:${c?c.color:'#6b7280'}"></div></div></div>`;
    }).join('');

    // Per akun
    const byAcc = {};
    txs.forEach(t => {
      if (t.type === 'transfer') return;
      const key = t.account;
      if (t.type === 'income') byAcc[key] = (byAcc[key]||0) + Number(t.amount);
      else if (t.type === 'expense' || t.type === 'debt-payment' || t.type === 'savings-deposit') byAcc[key] = (byAcc[key]||0) - Number(t.amount);
      else if (t.type === 'savings-withdraw') byAcc[key] = (byAcc[key]||0) + Number(t.amount);
    });
    const accContainer = document.getElementById('rptAccount');
    const accEntries = Object.entries(byAcc);
    if (!accEntries.length) accContainer.innerHTML = '<div class="empty">Tidak ada data</div>';
    else accContainer.innerHTML = accEntries.map(([aid, val]) => {
      const a = State.accounts.find(x => x.id === aid);
      return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${U.escapeHTML(a?a.name:'-')}</span><strong style="color:${val>=0?'var(--primary-dark)':'var(--danger)'}">${U.fmtMoney(val)}</strong></div>`;
    }).join('');

    // Tren bulanan
    const trendContainer = document.getElementById('chartTrend');
    const months = [];
    const startM = new Date(from.getFullYear(), from.getMonth(), 1);
    const endM = new Date(to.getFullYear(), to.getMonth(), 1);
    const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const cur = new Date(startM);
    while (cur <= endM) {
      const mTxs = State.transactions.filter(t => {
        const td = new Date(t.date);
        return td.getFullYear() === cur.getFullYear() && td.getMonth() === cur.getMonth();
      });
      const s = Calc.sumByType(mTxs);
      months.push({ label: bulan[cur.getMonth()] + ' ' + cur.getFullYear().toString().slice(2), in: s.income, out: s.expense });
      cur.setMonth(cur.getMonth() + 1);
    }
    Chart.bar(trendContainer, months);
  }
};

/* ---------- PENGATURAN ---------- */
Pages.settings = {
  refresh() {
    document.getElementById('setName').value = State.settings.name || '';
    document.getElementById('setCurrency').value = State.settings.currency || 'IDR';
    document.getElementById('setBudgetStart').value = State.settings.budgetStart || 1;
    document.getElementById('setTheme').value = State.settings.theme || 'light';
    this.renderCategories();
    this.renderAccounts();
  },
  renderCategories() {
    const container = document.getElementById('listCategories');
    container.innerHTML = State.categories.map(c => `
      <div class="list-item">
        <div class="list-icon" style="background:${c.color}20;color:${c.color}">${c.icon||'📦'}</div>
        <div class="list-body">
          <div class="list-title">${U.escapeHTML(c.name)}</div>
          <div class="list-sub">${c.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</div>
        </div>
        <div class="list-actions">
          <button data-act="edit">✏️</button>
          <button data-act="del">🗑️</button>
        </div>
      </div>`).join('');
  },
  renderAccounts() {
    const container = document.getElementById('listAccounts');
    container.innerHTML = State.accounts.map(a => `
      <div class="list-item">
        <div class="list-icon tr">${a.icon||'💰'}</div>
        <div class="list-body">
          <div class="list-title">${U.escapeHTML(a.name)}</div>
          <div class="list-sub">Saldo awal: ${U.fmtMoney(a.initialBalance)} • Saldo sekarang: ${U.fmtMoney(Calc.accountBalance(a.id))}</div>
        </div>
        <div class="list-actions">
          <button data-act="edit">✏️</button>
          <button data-act="del">🗑️</button>
        </div>
      </div>`).join('');
  },
  openCategoryForm(c = null) {
    const isEdit = !!c;
    const data = c || { name:'', type:'expense', icon:'📦', color:'#6b7280' };
    const body = `
      <div class="form-group"><label>Nama Kategori</label><input type="text" id="cName" class="input" value="${U.escapeHTML(data.name)}" /></div>
      <div class="form-row">
        <div class="form-group"><label>Jenis</label><select id="cType" class="select">
          <option value="income" ${data.type==='income'?'selected':''}>Pemasukan</option>
          <option value="expense" ${data.type==='expense'?'selected':''}>Pengeluaran</option>
        </select></div>
        <div class="form-group"><label>Ikon (emoji)</label><input type="text" id="cIcon" class="input" value="${U.escapeHTML(data.icon||'')}" maxlength="4" /></div>
      </div>
      <div class="form-group"><label>Warna</label><input type="color" id="cColor" class="input" value="${data.color||'#6b7280'}" /></div>
    `;
    Modal.open(isEdit?'Edit Kategori':'Kategori Baru', body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="cSave">${isEdit?'Simpan':'Tambah'}</button>`);
    document.getElementById('cSave').onclick = async () => {
      const name = document.getElementById('cName').value.trim();
      if (!name) { Toast.show('Nama wajib','error'); return; }
      const rec = { id: data.id || U.uid(), name, type: document.getElementById('cType').value, icon: document.getElementById('cIcon').value, color: document.getElementById('cColor').value };
      await DB.put('categories', rec);
      await reloadAll();
      Toast.show(isEdit?'Kategori diperbarui':'Kategori ditambahkan','success');
      Modal.close(); this.renderCategories();
    };
  },
  openAccountForm(a = null) {
    const isEdit = !!a;
    const data = a || { name:'', initialBalance:0, icon:'💰' };
    const body = `
      <div class="form-group"><label>Nama Akun</label><input type="text" id="aName" class="input" value="${U.escapeHTML(data.name)}" /></div>
      <div class="form-row">
        <div class="form-group"><label>Saldo Awal</label><input type="number" id="aInitial" class="input" value="${data.initialBalance||0}" /></div>
        <div class="form-group"><label>Ikon (emoji)</label><input type="text" id="aIcon" class="input" value="${U.escapeHTML(data.icon||'')}" maxlength="4" /></div>
      </div>
    `;
    Modal.open(isEdit?'Edit Akun':'Akun Baru', body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="aSave">${isEdit?'Simpan':'Tambah'}</button>`);
    document.getElementById('aSave').onclick = async () => {
      const name = document.getElementById('aName').value.trim();
      if (!name) { Toast.show('Nama wajib','error'); return; }
      const rec = { id: data.id || U.uid(), name, initialBalance: U.parseNum(document.getElementById('aInitial').value), icon: document.getElementById('aIcon').value };
      await DB.put('accounts', rec);
      await reloadAll();
      Toast.show(isEdit?'Akun diperbarui':'Akun ditambahkan','success');
      Modal.close(); this.renderAccounts();
    };
  }
};

/* ============ 10. EXPORT / IMPORT ============ */
const Exporter = {
  download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  },
  async allJSON() {
    const data = {
      version: 1, exportedAt: new Date().toISOString(),
      settings: State.settings,
      transactions: State.transactions,
      categories: State.categories,
      accounts: State.accounts,
      savings: State.savings,
      savingLogs: State.savingLogs,
      debts: State.debts,
      debtLogs: State.debtLogs,
      budgets: State.budgets,
      schedules: State.schedules
    };
    this.download(`dompetku-backup-${U.todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
    Toast.show('Backup JSON diunduh','success');
  },
  txCSV() {
    const header = ['ID','Tanggal','Jenis','Kategori','Nominal','Akun','AkunTujuan','Metode','Catatan'];
    const rows = State.transactions.map(t => {
      const cat = State.categories.find(c=>c.id===t.category);
      const acc = State.accounts.find(a=>a.id===t.account);
      const toAcc = State.accounts.find(a=>a.id===t.toAccount);
      return [t.id, U.fmtDateISO(new Date(t.date)), t.type, cat?cat.name:'', t.amount, acc?acc.name:'', toAcc?toAcc.name:'', t.method||'', (t.note||'').replace(/[\r\n]/g,' ')];
    });
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    this.download(`transaksi-${U.todayISO()}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
    Toast.show('CSV diunduh','success');
  },
  txXLSX() {
    // SpreadsheetML (Excel 2003 XML) — dapat dibuka Excel, LibreOffice, Google Sheets
    const rows = [['ID','Tanggal','Jenis','Kategori','Nominal','Akun','AkunTujuan','Metode','Catatan']];
    State.transactions.forEach(t => {
      const cat = State.categories.find(c=>c.id===t.category);
      const acc = State.accounts.find(a=>a.id===t.account);
      const toAcc = State.accounts.find(a=>a.id===t.toAccount);
      rows.push([t.id, U.fmtDateISO(new Date(t.date)), t.type, cat?cat.name:'', Number(t.amount), acc?acc.name:'', toAcc?toAcc.name:'', t.method||'', t.note||'']);
    });
    let tableRows = rows.map(r => '<Row>' + r.map((c,i) => {
      const type = (typeof c === 'number' && i === 4) ? 'Number' : 'String';
      return `<Cell><Data ss:Type="${type}">${U.escapeHTML(String(c))}</Data></Cell>`;
    }).join('') + '</Row>').join('');
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="1"><Font ss:Bold="1"/></Style></Styles>
<Worksheet ss:Name="Transaksi"><Table>${tableRows}</Table></Worksheet>
</Workbook>`;
    this.download(`transaksi-${U.todayISO()}.xls`, xml, 'application/vnd.ms-excel');
    Toast.show('Excel diunduh','success');
  },
  savingsJSON() {
    const data = { savings: State.savings, logs: State.savingLogs };
    this.download(`tabungan-${U.todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
    Toast.show('Data tabungan diunduh','success');
  },
  debtsJSON() {
    const data = { debts: State.debts, logs: State.debtLogs };
    this.download(`utang-${U.todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
    Toast.show('Data utang diunduh','success');
  },
  reportPDF() {
    // Buka dialog cetak browser (user dapat simpan sebagai PDF)
    window.print();
  }
};

const Importer = {
  async load(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try { resolve(JSON.parse(e.target.result)); }
        catch (err) { reject(new Error('File bukan JSON valid')); }
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsText(file);
    });
  },
  validate(data) {
    if (!data || typeof data !== 'object') throw new Error('Format tidak valid');
    if (!data.version) throw new Error('File bukan backup DompetKu');
    return true;
  },
  summary(data) {
    const parts = [];
    if (data.transactions) parts.push(`${data.transactions.length} transaksi`);
    if (data.categories) parts.push(`${data.categories.length} kategori`);
    if (data.accounts) parts.push(`${data.accounts.length} akun`);
    if (data.savings) parts.push(`${data.savings.length} target tabungan`);
    if (data.debts) parts.push(`${data.debts.length} utang`);
    if (data.schedules) parts.push(`${data.schedules.length} jadwal`);
    if (data.budgets) parts.push(`${data.budgets.length} anggaran`);
    return parts.join(', ') || 'Tidak ada data';
  },
  async replace(data) {
    await DB.clearAll();
    const stores = ['settings','transactions','categories','accounts','savings','savingLogs','debts','debtLogs','budgets','schedules'];
    for (const s of stores) {
      if (Array.isArray(data[s])) await DB.putMany(s, data[s]);
      else if (s === 'settings' && data[s]) await DB.put('settings', { key:'main', ...data[s] });
    }
    await reloadAll();
    Toast.show('Data berhasil dipulihkan','success');
  },
  async merge(data) {
    const stores = ['transactions','categories','accounts','savings','savingLogs','debts','debtLogs','budgets','schedules'];
    for (const s of stores) {
      if (!Array.isArray(data[s])) continue;
      const existing = await DB.getAll(s);
      const existIds = new Set(existing.map(x => x.id));
      const toAdd = data[s].filter(x => !existIds.has(x.id));
      if (toAdd.length) await DB.putMany(s, toAdd);
    }
    if (data.settings) {
      const cur = await DB.get('settings', 'main') || { key:'main' };
      await DB.put('settings', { ...cur, ...data.settings, key:'main' });
    }
    await reloadAll();
    Toast.show('Data digabungkan','success');
  }
};

/* ============ 11. EVENT BINDINGS ============ */
function bindEvents() {
  // Menu toggle
  document.getElementById('menuToggle').onclick = () => document.getElementById('sidebar').classList.toggle('open');

  // Theme toggle
  document.getElementById('themeToggle').onclick = () => {
    const cur = State.settings.theme;
    const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'auto' : 'light';
    State.settings.theme = next;
    DB.put('settings', { key:'main', ...State.settings });
    applyTheme();
    Toast.show('Tema: ' + (next === 'auto' ? 'Otomatis' : next === 'dark' ? 'Gelap' : 'Terang'), 'info');
  };

  // Period selector
  document.querySelectorAll('#periodSelector button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#periodSelector button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      State.period = b.dataset.period;
      document.getElementById('customRange').style.display = State.period === 'custom' ? 'flex' : 'none';
      if (State.period !== 'custom') Pages.dashboard.refresh();
    };
  });
  document.getElementById('applyRange').onclick = () => {
    State.dateFrom = document.getElementById('dateFrom').value;
    State.dateTo = document.getElementById('dateTo').value;
    if (!State.dateFrom || !State.dateTo) { Toast.show('Pilih rentang tanggal','error'); return; }
    Pages.dashboard.refresh();
  };
  document.getElementById('chartType').onchange = () => Pages.dashboard.renderCashflowChart(Calc.filterByPeriod(State.transactions));

  // Quick actions
  document.querySelectorAll('.qa-btn').forEach(b => {
    b.onclick = () => {
      const a = b.dataset.action;
      if (a === 'add-income') Pages.transaksi.openForm({ type:'income', date:U.todayISO() });
      else if (a === 'add-expense') Pages.transaksi.openForm({ type:'expense', date:U.todayISO() });
      else if (a === 'add-debt') Pages.debts.openForm();
      else if (a === 'add-savings') Pages.savings.openForm();
    };
  });

  // Transaksi
  document.getElementById('btnAddTx').onclick = () => Pages.transaksi.openForm();
  ['txSearch','txFilterType','txFilterCategory','txFilterAccount','txFilterFrom','txFilterTo','txSort'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => Pages.transaksi.renderList());
    document.getElementById(id).addEventListener('change', () => Pages.transaksi.renderList());
  });
  document.getElementById('btnClearFilter').onclick = () => {
    ['txSearch','txFilterType','txFilterCategory','txFilterAccount','txFilterFrom','txFilterTo'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('txSort').value = 'date-desc';
    Pages.transaksi.renderList();
  };
  document.getElementById('listTransactions').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    const item = e.target.closest('.list-item');
    if (btn) {
      const id = item.dataset.id;
      const t = State.transactions.find(x => x.id === id);
      if (!t) return;
      if (btn.dataset.act === 'view') Pages.transaksi.viewDetail(id);
      else if (btn.dataset.act === 'edit') Pages.transaksi.openForm(t);
      else if (btn.dataset.act === 'del') Modal.confirm('Hapus Transaksi','Yakin ingin menghapus transaksi ini? Tindakan ini tidak dapat dibatalkan.', async () => {
        // Reverse effects
        if (t.type === 'savings-deposit' && t.savingId) {
          const s = State.savings.find(x=>x.id===t.savingId); if (s) { s.collected = Math.max(0,(Number(s.collected)||0)-Number(t.amount)); await DB.put('savings', s); }
        } else if (t.type === 'savings-withdraw' && t.savingId) {
          const s = State.savings.find(x=>x.id===t.savingId); if (s) { s.collected = (Number(s.collected)||0)+Number(t.amount); await DB.put('savings', s); }
        } else if (t.type === 'debt-payment' && t.debtId) {
          const d = State.debts.find(x=>x.id===t.debtId); if (d) { d.remaining = (Number(d.remaining)||0)+Number(t.amount); d.paid = Math.max(0,(Number(d.paid)||0)-Number(t.amount)); if (d.remaining>0) d.status='aktif'; await DB.put('debts', d); }
        }
        await DB.delete('transactions', id);
        await reloadAll();
        Toast.show('Transaksi dihapus','success');
        Pages.transaksi.renderList(); Pages.dashboard.refresh();
      });
      e.stopPropagation();
    } else if (item) {
      Pages.transaksi.viewDetail(item.dataset.id);
    }
  });

  // Tabungan
  document.getElementById('btnAddSavings').onclick = () => Pages.savings.openForm();
  document.getElementById('listSavings').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    const item = e.target.closest('.list-item');
    if (!btn || !item) return;
    const id = item.querySelector('[data-id]')?.dataset.id || State.savings.find(s => item.textContent.includes(s.name))?.id;
    const s = State.savings.find(x => item.textContent.includes(x.name));
    if (!s) return;
    if (btn.dataset.act === 'deposit') Pages.savings.deposit(s);
    else if (btn.dataset.act === 'withdraw') Pages.savings.withdraw(s);
    else if (btn.dataset.act === 'edit') Pages.savings.openForm(s);
    else if (btn.dataset.act === 'del') Modal.confirm('Hapus Target','Yakin ingin menghapus target ini? Riwayat setoran tidak akan dihapus.', async () => {
      await DB.delete('savings', s.id);
      await reloadAll();
      Toast.show('Target dihapus','success');
      Pages.savings.refresh(); Pages.dashboard.refresh();
    });
  });

  // Utang
  document.getElementById('btnAddDebt').onclick = () => Pages.debts.openForm();
  document.getElementById('listDebts').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    const item = e.target.closest('.list-item');
    if (!btn || !item) return;
    const d = State.debts.find(x => item.textContent.includes(x.creditor));
    if (!d) return;
    if (btn.dataset.act === 'pay') Pages.debts.pay(d);
    else if (btn.dataset.act === 'edit') Pages.debts.openForm(d);
    else if (btn.dataset.act === 'del') Modal.confirm('Hapus Utang','Yakin ingin menghapus utang ini?', async () => {
      await DB.delete('debts', d.id);
      await reloadAll();
      Toast.show('Utang dihapus','success');
      Pages.debts.refresh(); Pages.dashboard.refresh();
    });
  });

  // Anggaran
  document.getElementById('budgetMonth').onchange = () => Pages.budget.renderList();
  document.getElementById('btnEditBudget').onclick = () => {
    const cats = State.categories.filter(c => c.type === 'expense');
    const month = document.getElementById('budgetMonth').value;
    let body = cats.map(c => {
      const b = State.budgets.find(x => x.categoryId === c.id && x.month === month);
      return `<div class="form-group"><label>${U.escapeHTML(c.name)}</label><input type="number" class="input" data-cat="${c.id}" value="${b?b.amount:''}" min="0" placeholder="0" /></div>`;
    }).join('');
    Modal.open('Atur Anggaran — ' + month, body, `<button class="btn" onclick="Modal.close()">Batal</button><button class="btn btn-primary" id="bSaveAll">Simpan Semua</button>`);
    document.getElementById('bSaveAll').onclick = async () => {
      const inputs = document.querySelectorAll('#modalBody input[data-cat]');
      for (const inp of inputs) {
        const catId = inp.dataset.cat;
        const amount = U.parseNum(inp.value);
        const existing = State.budgets.find(b => b.categoryId === catId && b.month === month);
        if (amount > 0) {
          await DB.put('budgets', { id: existing?.id || U.uid(), categoryId: catId, month, amount });
        } else if (existing) {
          await DB.delete('budgets', existing.id);
        }
      }
      await reloadAll();
      Toast.show('Anggaran disimpan','success');
      Modal.close();
      Pages.budget.renderList();
    };
  };
  document.getElementById('listBudget').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act="set"]');
    if (btn) Pages.budget.setBudget(btn.dataset.cat);
  });

  // Kalender
  document.getElementById('calPrev').onclick = () => { State.calendarDate.setMonth(State.calendarDate.getMonth()-1); Pages.calendar.render(); };
  document.getElementById('calNext').onclick = () => { State.calendarDate.setMonth(State.calendarDate.getMonth()+1); Pages.calendar.render(); };
  document.getElementById('calToday').onclick = () => { State.calendarDate = new Date(); Pages.calendar.render(); };
  document.getElementById('btnAddSchedule').onclick = () => Pages.calendar.openScheduleForm();

  // Laporan
  document.getElementById('reportPeriod').onchange = () => Pages.report.refresh();
  document.getElementById('reportFrom').onchange = () => Pages.report.refresh();
  document.getElementById('reportTo').onchange = () => Pages.report.refresh();
  document.getElementById('btnPrintReport').onclick = () => Exporter.reportPDF();

  // Pengaturan
  document.getElementById('btnSaveSettings').onclick = async () => {
    State.settings.name = document.getElementById('setName').value.trim();
    State.settings.currency = document.getElementById('setCurrency').value;
    State.settings.budgetStart = parseInt(document.getElementById('setBudgetStart').value) || 1;
    State.settings.theme = document.getElementById('setTheme').value;
    await DB.put('settings', { key:'main', ...State.settings });
    applyTheme();
    Toast.show('Pengaturan disimpan','success');
  };
  document.getElementById('btnAddCategory').onclick = () => Pages.settings.openCategoryForm();
  document.getElementById('btnAddAccount').onclick = () => Pages.settings.openAccountForm();
  document.getElementById('listCategories').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    const item = e.target.closest('.list-item');
    if (!btn || !item) return;
    const c = State.categories.find(x => item.textContent.includes(x.name));
    if (!c) return;
    if (btn.dataset.act === 'edit') Pages.settings.openCategoryForm(c);
    else if (btn.dataset.act === 'del') Modal.confirm('Hapus Kategori','Yakin ingin menghapus kategori ini?', async () => {
      await DB.delete('categories', c.id);
      await reloadAll();
      Toast.show('Kategori dihapus','success');
      Pages.settings.renderCategories();
    });
  });
  document.getElementById('listAccounts').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    const item = e.target.closest('.list-item');
    if (!btn || !item) return;
    const a = State.accounts.find(x => item.textContent.includes(x.name));
    if (!a) return;
    if (btn.dataset.act === 'edit') Pages.settings.openAccountForm(a);
    else if (btn.dataset.act === 'del') Modal.confirm('Hapus Akun','Yakin ingin menghapus akun ini? Riwayat transaksi tetap ada.', async () => {
      await DB.delete('accounts', a.id);
      await reloadAll();
      Toast.show('Akun dihapus','success');
      Pages.settings.renderAccounts();
    });
  });

  // Export
  document.querySelectorAll('[data-export]').forEach(b => {
    b.onclick = () => {
      const act = b.dataset.export;
      if (act === 'all-json') Exporter.allJSON();
      else if (act === 'tx-csv') Exporter.txCSV();
      else if (act === 'tx-xlsx') Exporter.txXLSX();
      else if (act === 'savings-json') Exporter.savingsJSON();
      else if (act === 'debts-json') Exporter.debtsJSON();
      else if (act === 'report-pdf') Exporter.reportPDF();
    };
  });

  // Import
  document.getElementById('btnImportReplace').onclick = async () => {
    const file = document.getElementById('importFile').files[0];
    if (!file) { Toast.show('Pilih file terlebih dahulu','error'); return; }
    try {
      const data = await Importer.load(file);
      Importer.validate(data);
      const sum = Importer.summary(data);
      Modal.confirm('Pulihkan Data (Ganti)', `File berisi: ${sum}. SEMUA data saat ini akan DIHAPUS dan digantikan. Lanjutkan?`, async () => {
        await Importer.replace(data);
        Pages.settings.refresh();
        Pages.dashboard.refresh();
      });
    } catch (err) { Toast.show('Gagal: ' + err.message, 'error'); }
  };
  document.getElementById('btnImportMerge').onclick = async () => {
    const file = document.getElementById('importFile').files[0];
    if (!file) { Toast.show('Pilih file terlebih dahulu','error'); return; }
    try {
      const data = await Importer.load(file);
      Importer.validate(data);
      const sum = Importer.summary(data);
      Modal.confirm('Pulihkan Data (Gabung)', `File berisi: ${sum}. Data akan digabungkan tanpa menimpa ID yang sudah ada. Lanjutkan?`, async () => {
        await Importer.merge(data);
        Pages.settings.refresh();
        Pages.dashboard.refresh();
      });
    } catch (err) { Toast.show('Gagal: ' + err.message, 'error'); }
  };

  // Clear all
  document.getElementById('btnClearAll').onclick = () => {
    Modal.confirm('Hapus Semua Data', 'SEMUA data (transaksi, tabungan, utang, pengaturan) akan dihapus permanen. Pastikan Anda sudah melakukan backup. Lanjutkan?', async () => {
      await DB.clearAll();
      await initDefaultData();
      await reloadAll();
      Toast.show('Semua data dihapus','success');
      Pages.settings.refresh();
      Pages.dashboard.refresh();
    });
  };
}

/* ============ 12. THEME ============ */
function applyTheme() {
  const t = State.settings.theme;
  let mode = t;
  if (t === 'auto') mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', mode);
  document.getElementById('themeToggle').textContent = mode === 'dark' ? '☀️' : '🌙';
}

/* ============ 13. INIT ============ */
async function initDefaultData() {
  await DB.putMany('categories', DefaultData.categories);
  await DB.putMany('accounts', DefaultData.accounts);
  await DB.putMany('savings', DefaultData.savingsTargets);
  await DB.put('settings', { key:'main', ...State.settings });
}

async function reloadAll() {
  const [settings, transactions, categories, accounts, savings, savingLogs, debts, debtLogs, budgets, schedules] = await Promise.all([
    DB.getAll('settings'), DB.getAll('transactions'), DB.getAll('categories'), DB.getAll('accounts'),
    DB.getAll('savings'), DB.getAll('savingLogs'), DB.getAll('debts'), DB.getAll('debtLogs'),
    DB.getAll('budgets'), DB.getAll('schedules')
  ]);
  const s = settings.find(x => x.key === 'main');
  if (s) State.settings = { ...State.settings, ...s };
  State.transactions = transactions;
  State.categories = categories;
  State.accounts = accounts;
  State.savings = savings;
  State.savingLogs = savingLogs;
  State.debts = debts;
  State.debtLogs = debtLogs;
  State.budgets = budgets;
  State.schedules = schedules;
}

async function init() {
  try {
    await DB.init();
    const cats = await DB.getAll('categories');
    if (!cats.length) await initDefaultData();
    await reloadAll();
    applyTheme();
    bindEvents();
    Router.init();
    // Default date inputs
    document.getElementById('dateFrom').value = U.todayISO();
    document.getElementById('dateTo').value = U.todayISO();
    // PWA registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    console.log('DompetKu siap digunakan');
  } catch (err) {
    console.error(err);
    Toast.show('Gagal memuat aplikasi: ' + err.message, 'error', 8000);
  }
}

// Prevent double-submit on forms
document.addEventListener('submit', e => {
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn && btn.disabled) { e.preventDefault(); return; }
  if (btn) { btn.disabled = true; setTimeout(() => btn.disabled = false, 1000); }
});

init();
