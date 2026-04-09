/* ============================================================
   UTILS.JS — Shared helper functions
   ============================================================ */

// ---- Formatting ----
function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '$0.00';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

function fmtNum(n) {
  return new Intl.NumberFormat('es-MX').format(n || 0);
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + (str.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateShort(str) {
  if (!str) return '—';
  const d = new Date(str + (str.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ---- DOM helpers ----
function el(id) { return document.getElementById(id); }

function html(id, content) {
  const e = el(id);
  if (e) e.innerHTML = content;
}

function show(id) { const e = el(id); if (e) e.classList.remove('hidden'); }
function hide(id) { const e = el(id); if (e) e.classList.add('hidden'); }

// ---- Loading / Error states ----
function showLoading(containerId) {
  const e = el(containerId);
  if (e) e.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Cargando…</span></div>`;
}

function showModuleError(containerId, message) {
  const e = el(containerId);
  if (e) e.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">⚠</div>
      <div class="empty-state-title">Error al cargar datos</div>
      <div class="empty-state-desc">${escHtml(message)}</div>
    </div>`;
}

// ---- Modal ----
function openModal(title, bodyHTML, size = '') {
  el('modalTitle').textContent = title;
  el('modalBody').innerHTML = bodyHTML;
  el('modal').className = 'modal' + (size ? ' ' + size : '');
  el('modalOverlay').classList.remove('hidden');
  setTimeout(() => {
    const first = el('modalBody').querySelector('input:not([readonly]), select, textarea');
    if (first) first.focus();
  }, 60);
}

function closeModal() {
  el('modalOverlay').classList.add('hidden');
  el('modalBody').innerHTML = '';
}

// ---- Toast ----
function toast(message, type = 'success') {
  const icons = { success: '✓', error: '✗', warning: '⚠' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || '●'}</span><span>${message}</span>`;
  el('toastContainer').appendChild(t);
  setTimeout(() => {
    t.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

// ---- Badges ----
const CAT_COLORS = {
  'Proteínas':   '#a3e635',
  'Creatina':    '#3b82f6',
  'Pre-Entreno': '#f59e0b',
  'Aminoácidos': '#8b5cf6',
  'Vitaminas':   '#22c55e',
  'Quemadores':  '#ef4444',
};

function catBadge(cat) {
  const color = CAT_COLORS[cat] || '#606060';
  return `<span class="badge" style="background:${color}20;color:${color}">${escHtml(cat)}</span>`;
}

function statusBadge(status) {
  const map = {
    pagado:    ['badge-success', 'Pagado'],
    credito:   ['badge-warning', 'Crédito'],
    cancelado: ['badge-danger',  'Cancelado'],
    pendiente: ['badge-warning', 'Pendiente'],
    parcial:   ['badge-info',    'Parcial'],
    vencido:   ['badge-danger',  'Vencido'],
    borrador:  ['badge-neutral', 'Borrador'],
    enviada:   ['badge-info',    'Enviada'],
    aceptada:  ['badge-success', 'Aceptada'],
    rechazada: ['badge-danger',  'Rechazada'],
  };
  const [cls, label] = map[status] || ['badge-neutral', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function typeBadge(type) {
  const map = {
    menudeo:     ['badge-accent',   'Menudeo'],
    mayoreo:     ['badge-info',     'Mayoreo'],
    distribuidor:['badge-success',  'Distribuidor'],
  };
  const [cls, label] = map[type] || ['badge-neutral', type || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ---- Confirm dialog ----
function confirmAction(message, onConfirmFn) {
  openModal('Confirmar', `
    <p style="color:var(--text2);margin-bottom:20px">${message}</p>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-danger" id="confirmActionBtn">Confirmar</button>
    </div>
  `);
  // Attach after render
  setTimeout(() => {
    const btn = el('confirmActionBtn');
    if (btn) btn.onclick = () => { closeModal(); onConfirmFn(); };
  }, 20);
}

// ---- Dates ----
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
}

// ---- Security ----
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Async error wrapper for event handlers ----
function asyncHandler(fn) {
  return function(...args) {
    fn.apply(this, args).catch(err => {
      console.error(err);
      toast('Error: ' + err.message, 'error');
    });
  };
}
