/* ============================================================
   RECEIVABLES.JS — Cuentas por Cobrar
   Se generan automáticamente al registrar ventas a crédito.
   ============================================================ */

let _receivables = [];
let _recProfiles = [];

async function renderReceivables() {
  const fetches = [fetchReceivables()];
  if (isAdmin()) fetches.push(fetchProfiles());
  const results  = await Promise.all(fetches);
  _receivables   = results[0];
  _recProfiles   = isAdmin() ? (results[1] || []) : [];
  _renderReceivablesUI();
}

function _renderReceivablesUI() {
  const recs       = _receivables;
  const pending    = recs.filter(r => r.status !== 'pagado');
  const totalPend  = pending.reduce((a, r) => a + Number(r.balance), 0);
  const overdue    = pending.filter(r => r.due_date && r.due_date < todayStr());
  const overdueTot = overdue.reduce((a, r) => a + Number(r.balance), 0);
  const now        = new Date();
  const monthStr   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cobMes     = recs
    .flatMap(r => r.payments || [])
    .filter(p => p.date && p.date.startsWith(monthStr))
    .reduce((a, p) => a + Number(p.amount), 0);

  const vendorFilter = isAdmin() && _recProfiles.length > 0
    ? `<select id="recVendorFilter" onchange="filterReceivables()">
        <option value="">Todos los vendedores</option>
        ${_recProfiles.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
       </select>`
    : '';

  const initialRecs = recs.filter(r => r.status !== 'pagado');

  el('mod-receivables').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Cuentas por Cobrar</h2>
    </div>

    <div class="stats-row mb-20" style="grid-template-columns:repeat(3,1fr)">
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
          <th class="td-center">Pago</th>
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

    return `<tr class="row-clickable" onclick="openRecRowModal('${r.id}')" ${r.status === 'pagado' ? 'style="opacity:0.6"' : ''}>
      <td data-label="Cliente"><strong>${escHtml(r.customer_name)}</strong></td>
      ${isAdmin() ? `<td data-label="Vendedor" class="td-muted" style="font-size:12px">${escHtml(r.seller_name || '—')}</td>` : ''}
      <td data-label="F. Venta" class="td-muted">${fmtDate(saleDate)}</td>
      <td data-label="Vencimiento" class="td-muted">${fmtDate(r.due_date)}</td>
      <td data-label="Días" class="td-center">${daysLabel}</td>
      <td data-label="Total" class="td-right">${fmt(r.original_amount)}</td>
      <td data-label="Abonado" class="td-right text-success">${fmt(r.paid_amount)}</td>
      <td data-label="Saldo" class="td-right fw-bold ${isOverdue ? 'text-danger' : Number(r.balance) > 0 ? 'text-warning' : ''}">${fmt(r.balance)}</td>
      <td data-label="Estado">${statusBadge(r.status)}</td>
      <td class="td-center" onclick="event.stopPropagation()">
        ${r.status !== 'pagado'
          ? `<button class="btn btn-xs btn-primary" onclick="openAddPaymentModal('${r.id}')">$ Abonar</button>`
          : '<span class="text-muted" style="font-size:12px">✓</span>'}
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
//  ROW CLICK — modal con cliente + productos + importes
// ============================================================
async function openRecRowModal(id) {
  const r = _receivables.find(x => x.id === id);
  if (!r) return;

  // Open with loading state
  openModal(escHtml(r.customer_name),
    '<div class="loading-state"><div class="spinner"></div> Cargando detalle…</div>',
    'modal-lg'
  );

  // Try to fetch sale items from the linked sale
  let saleItems = [];
  if (r.sale_id) {
    try {
      const sale = await fetchSaleById(r.sale_id);
      saleItems = sale?.items || [];
    } catch (_) {}
  }

  const saleDate  = r.sale_date || (r.created_at ? r.created_at.split('T')[0] : null);
  const days      = daysUntil(r.due_date);

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

  const itemsSection = saleItems.length > 0
    ? `<div class="card-title mb-8 mt-16">Productos de la venta</div>
       <div class="table-wrapper">
         <table>
           <thead><tr>
             <th>Producto</th>
             <th class="td-center">Cant.</th>
             <th class="td-right">Precio</th>
             <th class="td-right">Subtotal</th>
           </tr></thead>
           <tbody>
             ${saleItems.map(i => `<tr>
               <td data-label="Producto">${escHtml(i.product_name || i.name || '—')}</td>
               <td data-label="Cant." class="td-center">${i.quantity}</td>
               <td data-label="Precio" class="td-right">${fmt(i.unit_price || i.price || 0)}</td>
               <td data-label="Subtotal" class="td-right fw-bold">${fmt(i.subtotal || (i.quantity * (i.unit_price || i.price || 0)))}</td>
             </tr>`).join('')}
           </tbody>
         </table>
       </div>`
    : `<div class="mt-12 text-muted" style="font-size:13px;padding:12px;background:var(--bg2);border-radius:8px;text-align:center">
         Sin detalle de productos disponible
       </div>`;

  el('modalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:16px">
      <div>
        <div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px">Cliente</div>
        <strong style="font-size:16px">${escHtml(r.customer_name)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px">Estado</div>
        ${statusBadge(r.status)}
      </div>
      <div>
        <div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px">Fecha de venta</div>
        <strong>${fmtDate(saleDate)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px">Vencimiento</div>
        <strong>${fmtDate(r.due_date)}</strong><br>
        ${daysNote}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:8px;
      background:var(--bg2);border-radius:10px;padding:14px">
      <div>
        <div class="text-muted" style="font-size:11px">TOTAL</div>
        <strong style="font-size:17px">${fmt(r.original_amount)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">PAGADO</div>
        <strong style="font-size:17px;color:var(--success)">${fmt(r.paid_amount)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">SALDO</div>
        <strong style="font-size:18px;color:${Number(r.balance) === 0 ? 'var(--success)' : 'var(--warning)'}">${fmt(r.balance)}</strong>
      </div>
    </div>

    ${itemsSection}

    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      ${r.status !== 'pagado'
        ? `<button class="btn btn-primary"
             onclick="closeModal();openAddPaymentModal('${r.id}')">$ Registrar Pago</button>`
        : ''}
    </div>
  `;
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
              <div class="flex-between" style="font-size:12px;padding:5px 0;border-bottom:1px solid var(--border)">
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
    <div style="background:var(--bg2);border-radius:10px;padding:12px 16px;margin-bottom:16px">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">${escHtml(r.customer_name)}</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:12px">
        <span class="text-muted">Venta: <strong>${fmtDate(saleDate)}</strong></span>
        <span class="text-muted">Total: <strong>${fmt(r.original_amount)}</strong></span>
        <span class="text-muted">Pagado: <strong class="text-success">${fmt(r.paid_amount)}</strong></span>
      </div>
      <div style="margin-top:8px;font-size:15px;font-weight:700">
        Saldo pendiente: <span style="color:var(--warning)">${fmt(balance)}</span>
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
              border:none;border-radius:20px;cursor:pointer;font-weight:700;white-space:nowrap">
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
      'success'
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
