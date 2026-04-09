/* ============================================================
   RECEIVABLES.JS — Cuentas por Cobrar
   Se generan automáticamente al registrar ventas a crédito.
   No se crean ni eliminan manualmente.
   ============================================================ */

let _receivables = [];
let _recProfiles = []; // para filtro de vendedor (admin only)

async function renderReceivables() {
  const fetches = [fetchReceivables()];
  if (isAdmin()) fetches.push(fetchProfiles());
  const results  = await Promise.all(fetches);
  _receivables   = results[0];
  _recProfiles   = isAdmin() ? (results[1] || []) : [];
  _renderReceivablesUI();
}

function _renderReceivablesUI() {
  const recs        = _receivables;
  const pending     = recs.filter(r => r.status !== 'pagado');
  const totalPend   = pending.reduce((a, r) => a + Number(r.balance), 0);
  const overdue     = pending.filter(r => r.due_date && r.due_date < todayStr());
  const overdueTot  = overdue.reduce((a, r) => a + Number(r.balance), 0);
  const now         = new Date();
  const monthStr    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cobMes      = recs
    .flatMap(r => r.payments || [])
    .filter(p => p.date && p.date.startsWith(monthStr))
    .reduce((a, p) => a + Number(p.amount), 0);

  const vendorFilter = isAdmin() && _recProfiles.length > 0
    ? `<select id="recVendorFilter" onchange="filterReceivables()">
        <option value="">Todos los vendedores</option>
        ${_recProfiles.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
       </select>`
    : '';

  // Default: solo pendientes de cobro
  const initialRecs = recs.filter(r => r.status !== 'pagado');

  el('mod-receivables').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Cuentas por Cobrar</h2>
    </div>

    <div class="mb-16" style="background:#1e3a5f22;border:1px solid #3b82f6;border-radius:8px;
      padding:10px 14px;font-size:12px;color:var(--text2);display:flex;gap:8px;align-items:flex-start">
      <span style="color:#3b82f6;margin-top:1px">ℹ</span>
      <span>Las CxC se generan automáticamente al registrar una venta con estado
        <strong>Crédito</strong>. El vencimiento se fija a 15 días de la fecha de venta.</span>
    </div>

    <div class="stats-row mb-20" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi-card">
        <div class="kpi-label">Por cobrar</div>
        <div class="kpi-value" style="font-size:20px">${fmt(totalPend)}</div>
        <div class="kpi-sub">${pending.length} cuentas activas</div>
      </div>
      <div class="kpi-card ${overdue.length > 0 ? 'danger' : ''}">
        <div class="kpi-label">Vencidas</div>
        <div class="kpi-value ${overdue.length > 0 ? 'text-danger' : ''}" style="font-size:20px">${fmt(overdueTot)}</div>
        <div class="kpi-sub">${overdue.length} cuentas</div>
      </div>
      <div class="kpi-card success">
        <div class="kpi-label">Cobrado este mes</div>
        <div class="kpi-value" style="font-size:20px">${fmt(cobMes)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total documentado</div>
        <div class="kpi-value" style="font-size:20px">${fmt(recs.reduce((a, r) => a + Number(r.original_amount), 0))}</div>
        <div class="kpi-sub">${recs.length} cuentas totales</div>
      </div>
    </div>

    <div class="filter-row mb-16">
      <div class="search-bar">
        <span class="search-bar-icon">&#128269;</span>
        <input type="text" id="recSearch"
          placeholder="Buscar cliente…" oninput="filterReceivables()">
      </div>
      <select id="recStatusFilter" onchange="filterReceivables()">
        <option value="active">Pendientes de cobro</option>
        <option value="">Todas</option>
        <option value="pendiente">Pendiente</option>
        <option value="parcial">Parcial</option>
        <option value="vencido">Vencido</option>
        <option value="pagado">Pagado</option>
      </select>
      ${vendorFilter}
    </div>

    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Cliente</th>
          ${isAdmin() ? '<th>Vendedor</th>' : ''}
          <th>F. Venta</th>
          <th>Vencimiento</th>
          <th class="td-center">Días</th>
          <th class="td-right">Total</th>
          <th class="td-right">Abonado</th>
          <th class="td-right">Saldo</th>
          <th>Estado</th>
          <th class="td-center">Acciones</th>
        </tr></thead>
        <tbody id="recTableBody">${_renderRecRows(initialRecs)}</tbody>
      </table>
    </div>
  `;
}

function _renderRecRows(recs) {
  const cols = isAdmin() ? 10 : 9;
  if (recs.length === 0) return `<tr><td colspan="${cols}">
    <div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-title">Sin cuentas por cobrar</div>
      <div class="empty-state-desc">Aparecerán aquí cuando registres ventas a crédito</div>
    </div>
  </td></tr>`;

  return recs.map(r => {
    const days = daysUntil(r.due_date);
    let daysLabel = '—';
    if (r.status !== 'pagado' && days !== null) {
      daysLabel = days < 0  ? `<span class="text-danger fw-bold">Hace ${Math.abs(days)}d</span>`
                : days === 0 ? `<span class="text-warning fw-bold">Hoy</span>`
                : days <= 3  ? `<span class="text-warning">${days}d</span>`
                             : `<span class="text-muted">${days}d</span>`;
    }
    const saleDate  = r.sale_date || (r.created_at ? r.created_at.split('T')[0] : null);
    const isOverdue = r.status !== 'pagado' && days !== null && days < 0;

    return `<tr ${r.status === 'pagado' ? 'style="opacity:0.55"' : ''}>
      <td><strong>${escHtml(r.customer_name)}</strong></td>
      ${isAdmin() ? `<td class="td-muted" style="font-size:12px">${escHtml(r.seller_name || '—')}</td>` : ''}
      <td class="td-muted">${fmtDate(saleDate)}</td>
      <td class="td-muted">${fmtDate(r.due_date)}</td>
      <td class="td-center">${daysLabel}</td>
      <td class="td-right">${fmt(r.original_amount)}</td>
      <td class="td-right text-success">${fmt(r.paid_amount)}</td>
      <td class="td-right fw-bold ${isOverdue ? 'text-danger' : Number(r.balance) > 0 ? 'text-warning' : ''}">${fmt(r.balance)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-center">
        <div style="display:flex;gap:4px;justify-content:center">
          ${r.status !== 'pagado'
            ? `<button class="btn btn-xs btn-primary" onclick="openAddPaymentModal('${r.id}')">$ Abonar</button>`
            : ''}
          <button class="btn btn-xs btn-ghost" onclick="viewRecDetail('${r.id}')">👁 Ver</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterReceivables() {
  const search   = (el('recSearch')?.value || '').toLowerCase();
  const status   = el('recStatusFilter')?.value ?? 'active';
  const vendorId = el('recVendorFilter')?.value || '';

  let recs = [..._receivables];
  if (search)   recs = recs.filter(r => (r.customer_name || '').toLowerCase().includes(search));
  if (status === 'active') recs = recs.filter(r => r.status !== 'pagado');
  else if (status)         recs = recs.filter(r => r.status === status);
  if (vendorId)            recs = recs.filter(r => r.owner_id === vendorId);
  el('recTableBody').innerHTML = _renderRecRows(recs);
}

// ============================================================
//  REGISTRAR PAGO
// ============================================================
function openAddPaymentModal(id) {
  const r = _receivables.find(x => x.id === id);
  if (!r) return;
  const balance  = Number(r.balance);
  const saleDate = r.sale_date || (r.created_at ? r.created_at.split('T')[0] : null);

  const paymentsHTML = (r.payments || []).length > 0
    ? `<div class="mb-16">
        <div class="card-title mb-6">Pagos anteriores</div>
        <div style="max-height:130px;overflow-y:auto">
          ${r.payments
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(p => `
              <div class="flex-between" style="font-size:12px;padding:5px 0;border-bottom:1px solid var(--border1)">
                <span>${fmtDate(p.date)}
                  <span class="td-muted" style="text-transform:capitalize"> · ${escHtml(p.method)}</span>
                  ${p.notes ? `<span class="td-muted"> · ${escHtml(p.notes)}</span>` : ''}
                </span>
                <span class="text-success fw-bold">+${fmt(p.amount)}</span>
              </div>`).join('')}
        </div>
       </div>`
    : '';

  openModal('Registrar Pago', `
    <div style="background:var(--bg3);border-radius:8px;padding:12px 16px;margin-bottom:16px">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">${escHtml(r.customer_name)}</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px">
        <span class="text-muted">Venta: <strong>${fmtDate(saleDate)}</strong></span>
        <span class="text-muted">Total: <strong>${fmt(r.original_amount)}</strong></span>
        <span class="text-muted">Pagado: <strong class="text-success">${fmt(r.paid_amount)}</strong></span>
      </div>
      <div style="margin-top:8px;font-size:15px;font-weight:700">
        Saldo pendiente: <span class="text-warning">${fmt(balance)}</span>
      </div>
    </div>

    ${paymentsHTML}

    <div class="form-grid-2">
      <div class="form-group">
        <label>Monto del pago *</label>
        <div style="position:relative">
          <input id="f_payAmt" type="number" min="0.01" step="0.01"
            max="${balance}" placeholder="0.00">
          <button type="button"
            onclick="el('f_payAmt').value=${balance}"
            style="position:absolute;right:6px;top:50%;transform:translateY(-50%);
              font-size:10px;padding:2px 7px;background:var(--accent);color:#000;
              border:none;border-radius:4px;cursor:pointer;font-weight:700;white-space:nowrap">
            Todo
          </button>
        </div>
      </div>
      <div class="form-group">
        <label>Fecha del pago *</label>
        <input id="f_payDate" type="date" value="${todayStr()}">
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Método de Pago</label>
        <select id="f_payMethod">
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="cheque">Cheque</option>
        </select>
      </div>
      <div class="form-group">
        <label>Notas / Referencia</label>
        <input id="f_payNotes" type="text" placeholder="Banco, número de referencia…">
      </div>
    </div>
    <div id="payFormError" class="login-error hidden" style="margin-bottom:4px"></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="applyPayBtn"
        onclick="applyPayment('${id}', ${balance})">Aplicar Pago</button>
    </div>
  `);
}

async function applyPayment(id, balance) {
  const amount = parseFloat(el('f_payAmt').value);
  const date   = el('f_payDate').value;
  const errEl  = el('payFormError');
  const btnEl  = el('applyPayBtn');

  errEl.classList.add('hidden');
  if (!amount || amount <= 0) {
    errEl.textContent = 'Ingresa un monto mayor a $0.';
    errEl.classList.remove('hidden'); return;
  }
  if (!date) {
    errEl.textContent = 'Ingresa la fecha del pago.';
    errEl.classList.remove('hidden'); return;
  }
  if (amount > balance + 0.01) {
    errEl.textContent = `El pago (${fmt(amount)}) no puede superar el saldo (${fmt(balance)}).`;
    errEl.classList.remove('hidden'); return;
  }

  btnEl.disabled = true;
  btnEl.textContent = 'Aplicando…';

  try {
    await rpcApplyPayment(id, amount, date, el('f_payMethod').value, el('f_payNotes').value.trim());
    const isFullPayment = amount >= balance - 0.01;
    toast(
      isFullPayment
        ? `¡Cuenta liquidada! ${fmt(amount)} cobrados ✓`
        : `Abono de ${fmt(amount)} aplicado. Saldo restante: ${fmt(balance - amount)}`,
      isFullPayment ? 'success' : 'success'
    );
    closeModal();
    _receivables = await fetchReceivables();
    _renderReceivablesUI();
  } catch (err) {
    errEl.textContent = 'Error: ' + err.message;
    errEl.classList.remove('hidden');
    console.error('[CxC] applyPayment error:', err);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = 'Aplicar Pago';
  }
}

// ============================================================
//  VER DETALLE
// ============================================================
function viewRecDetail(id) {
  const r = _receivables.find(x => x.id === id);
  if (!r) return;
  const days     = daysUntil(r.due_date);
  const saleDate = r.sale_date || (r.created_at ? r.created_at.split('T')[0] : null);

  let daysNote = '';
  if (r.status !== 'pagado' && days !== null) {
    daysNote = days < 0
      ? `<span class="text-danger" style="font-size:12px">Vencida hace ${Math.abs(days)} días</span>`
      : days === 0
      ? `<span class="text-warning" style="font-size:12px">Vence hoy</span>`
      : `<span class="text-muted" style="font-size:12px">${days} días restantes</span>`;
  } else if (r.status === 'pagado') {
    daysNote = `<span class="text-success" style="font-size:12px">Liquidada ✓</span>`;
  }

  openModal(`CxC — ${escHtml(r.customer_name)}`, `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px">
      <div>
        <div class="text-muted" style="font-size:11px">CLIENTE</div>
        <strong>${escHtml(r.customer_name)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">VENDEDOR</div>
        <strong>${escHtml(r.seller_name || '—')}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">ESTADO</div>
        ${statusBadge(r.status)}
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">FECHA DE VENTA</div>
        <strong>${fmtDate(saleDate)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">VENCIMIENTO</div>
        <strong>${fmtDate(r.due_date)}</strong><br>
        ${daysNote}
      </div>
      <div></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;
      background:var(--bg3);border-radius:8px;padding:14px">
      <div>
        <div class="text-muted" style="font-size:11px">TOTAL ORIGINAL</div>
        <strong style="font-size:18px">${fmt(r.original_amount)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">PAGADO</div>
        <strong style="font-size:18px;color:var(--success,#22c55e)">${fmt(r.paid_amount)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">SALDO PENDIENTE</div>
        <strong style="font-size:20px;color:${Number(r.balance) === 0 ? 'var(--success,#22c55e)' : 'var(--warning,#f59e0b)'}">${fmt(r.balance)}</strong>
      </div>
    </div>

    ${r.notes ? `<div class="mb-12 text-muted" style="font-size:12px">
      <strong>Notas:</strong> ${escHtml(r.notes)}</div>` : ''}

    <div class="card-title mb-8">Historial de Pagos</div>
    ${(r.payments || []).length === 0
      ? '<p class="text-muted" style="font-size:13px;padding:4px 0">Sin pagos registrados aún</p>'
      : `<div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Fecha</th>
              <th>Método</th>
              <th class="td-right">Monto</th>
              <th>Notas / Referencia</th>
            </tr></thead>
            <tbody>
              ${r.payments
                .slice().sort((a, b) => a.date.localeCompare(b.date))
                .map(p => `<tr>
                  <td>${fmtDate(p.date)}</td>
                  <td class="td-muted" style="text-transform:capitalize">${escHtml(p.method)}</td>
                  <td class="td-right text-success fw-bold">+${fmt(p.amount)}</td>
                  <td class="td-muted" style="font-size:12px">${escHtml(p.notes || '—')}</td>
                </tr>`).join('')}
              <tr style="border-top:2px solid var(--border2)">
                <td colspan="2" class="td-right text-muted" style="font-size:12px">Total pagado:</td>
                <td class="td-right text-success fw-bold">${fmt(r.paid_amount)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>`
    }
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      ${r.status !== 'pagado'
        ? `<button class="btn btn-primary"
             onclick="closeModal();openAddPaymentModal('${r.id}')">$ Registrar Pago</button>`
        : ''}
    </div>
  `, 'modal-lg');
}
