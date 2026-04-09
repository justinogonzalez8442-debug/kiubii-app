/* ============================================================
   EXPENSES.JS  —  Admin only
   ============================================================ */

const EXPENSE_CATS = ['Mercancía','Renta','Marketing','Logística','Personal','Servicios','Equipo','Impuestos','Otros'];

let _expenses = [];

async function renderExpenses() {
  if (!isAdmin()) {
    el('mod-expenses').innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔒</div>
      <div class="empty-state-title">Acceso restringido</div>
      <div class="empty-state-desc">Solo los administradores pueden ver los gastos.</div></div>`;
    return;
  }
  _expenses = await fetchExpenses();
  _renderExpensesUI();
}

function _renderExpensesUI() {
  const expenses = _expenses;
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyTotal = expenses.filter(e => e.date && e.date.startsWith(monthStr))
    .reduce((a, e) => a + Number(e.amount), 0);

  const byCat = {};
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  el('mod-expenses').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Gastos</h2>
      <button class="btn btn-primary" onclick="openNewExpenseModal()">+ Nuevo Gasto</button>
    </div>

    <div class="stats-row mb-20" style="grid-template-columns:1fr">
      <div class="kpi-card warning">
        <div class="kpi-label">Gastos del mes</div>
        <div class="kpi-value" style="font-size:20px">${fmt(monthlyTotal)}</div>
        <div class="kpi-sub">${expenses.filter(e => e.date && e.date.startsWith(monthStr)).length} registros este mes</div>
      </div>
    </div>

    <div class="grid-2 mb-20">
      <div class="card">
        <div class="card-title">Por categoría (total)</div>
        ${topCat.length === 0
          ? '<div class="text-muted" style="font-size:13px">Sin datos</div>'
          : topCat.map(([cat, amt]) => {
              const pct = total > 0 ? (amt / total * 100).toFixed(0) : 0;
              return `<div class="mb-8">
                <div class="flex-between mb-4">
                  <span style="font-size:13px">${escHtml(cat)}</span>
                  <span style="font-size:13px;font-weight:600">${fmt(amt)} <span class="text-muted">(${pct}%)</span></span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
              </div>`;
            }).join('')
        }
      </div>
      <div class="filter-row" style="align-items:flex-start;flex-direction:column;gap:8px">
        <div class="search-bar" style="width:100%">
          <span class="search-bar-icon">&#128269;</span>
          <input type="text" id="expSearch" placeholder="Buscar descripción o proveedor…" oninput="filterExpenses()">
        </div>
        <select id="expCatFilter" onchange="filterExpenses()" style="width:100%">
          <option value="">Todas las categorías</option>
          ${EXPENSE_CATS.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <div>
          <label style="font-size:11px">Desde</label>
          <input type="date" id="expDateFrom" onchange="filterExpenses()" style="margin-top:4px">
        </div>
        <div>
          <label style="font-size:11px">Hasta</label>
          <input type="date" id="expDateTo" onchange="filterExpenses()" style="margin-top:4px">
        </div>
      </div>
    </div>

    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Proveedor</th>
          <th class="td-right">Monto</th><th>Método</th><th class="td-center">Acciones</th>
        </tr></thead>
        <tbody id="expTableBody">${renderExpenseRows(expenses)}</tbody>
      </table>
    </div>
    <div class="exp-total-footer">
      <span style="font-size:13px;color:var(--text2)">Total filtrado:</span>
      <span id="expFilteredTotal" class="fw-bold" style="font-size:16px;color:var(--warning)">${fmt(total)}</span>
    </div>
  `;
}

function renderExpenseRows(expenses) {
  if (expenses.length === 0) return `<tr><td colspan="7">
    <div class="empty-state"><div class="empty-state-icon">📤</div>
    <div class="empty-state-title">Sin gastos registrados</div></div>
  </td></tr>`;

  return expenses.map(e => `<tr>
    <td data-label="Fecha" class="td-muted">${fmtDate(e.date)}</td>
    <td data-label="Categoría"><span class="badge badge-neutral">${escHtml(e.category || '—')}</span></td>
    <td data-label="Descripción">${escHtml(e.description)}</td>
    <td data-label="Proveedor" class="td-muted">${escHtml(e.supplier || '—')}</td>
    <td data-label="Monto" class="td-right fw-bold" style="color:var(--warning)">${fmt(e.amount)}</td>
    <td data-label="Método" class="td-muted" style="font-size:12px;text-transform:capitalize">${escHtml(e.payment_method)}</td>
    <td class="td-center">
      <div style="display:flex;gap:4px;justify-content:center">
        <button class="btn btn-xs btn-ghost" onclick="openEditExpenseModal('${e.id}')">✏</button>
        <button class="btn btn-xs btn-danger" onclick="deleteExpense('${e.id}')">✕</button>
      </div>
    </td>
  </tr>`).join('');
}

function filterExpenses() {
  const search   = (el('expSearch')?.value || '').toLowerCase();
  const cat      = el('expCatFilter')?.value || '';
  const dateFrom = el('expDateFrom')?.value || '';
  const dateTo   = el('expDateTo')?.value || '';
  let expenses   = [..._expenses];

  if (search)   expenses = expenses.filter(e => e.description.toLowerCase().includes(search) || (e.supplier || '').toLowerCase().includes(search));
  if (cat)      expenses = expenses.filter(e => e.category === cat);
  if (dateFrom) expenses = expenses.filter(e => e.date >= dateFrom);
  if (dateTo)   expenses = expenses.filter(e => e.date <= dateTo);

  el('expTableBody').innerHTML = renderExpenseRows(expenses);

  // Update dynamic total
  const filteredTotal = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const totalEl = el('expFilteredTotal');
  if (totalEl) totalEl.textContent = fmt(filteredTotal);
}

function openNewExpenseModal() {
  openModal('Nuevo Gasto', expenseForm());
}

function openEditExpenseModal(id) {
  const e = _expenses.find(x => x.id === id);
  if (!e) return;
  openModal('Editar Gasto', expenseForm(e));
}

function expenseForm(e = {}) {
  return `
    <div class="form-grid-2">
      <div class="form-group">
        <label>Fecha *</label>
        <input id="f_expDate" type="date" value="${e.date || todayStr()}">
      </div>
      <div class="form-group">
        <label>Categoría *</label>
        <select id="f_expCat">
          ${EXPENSE_CATS.map(c => `<option value="${c}" ${e.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Descripción *</label>
      <input id="f_expDesc" type="text" value="${escHtml(e.description || '')}" placeholder="Describe el gasto…">
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Proveedor / Beneficiario</label>
        <input id="f_expSupplier" type="text" value="${escHtml(e.supplier || '')}">
      </div>
      <div class="form-group">
        <label>Monto (MXN) *</label>
        <input id="f_expAmount" type="number" min="0" step="0.01" value="${e.amount || ''}">
      </div>
    </div>
    <div class="form-group">
      <label>Método de Pago</label>
      <select id="f_expPay">
        <option value="efectivo"       ${e.payment_method === 'efectivo'       ? 'selected' : ''}>Efectivo</option>
        <option value="transferencia"  ${e.payment_method === 'transferencia'  ? 'selected' : ''}>Transferencia</option>
        <option value="tarjeta"        ${e.payment_method === 'tarjeta'        ? 'selected' : ''}>Tarjeta</option>
        <option value="cheque"         ${e.payment_method === 'cheque'         ? 'selected' : ''}>Cheque</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveExpense('${e.id || ''}')">Guardar</button>
    </div>
  `;
}

async function saveExpense(id) {
  const date        = el('f_expDate').value;
  const description = el('f_expDesc').value.trim();
  const amount      = parseFloat(el('f_expAmount').value);
  if (!date || !description || isNaN(amount)) { toast('Completa todos los campos requeridos', 'error'); return; }
  const data = {
    date, description, amount,
    category:       el('f_expCat').value,
    supplier:       el('f_expSupplier').value.trim(),
    payment_method: el('f_expPay').value,
    user_id:        currentUser.id,
  };
  try {
    if (id) { await dbUpdateRow('expenses', id, data); toast('Gasto actualizado'); }
    else    { await dbInsert('expenses', data);         toast('Gasto registrado'); }
    closeModal();
    await renderExpenses();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function deleteExpense(id) {
  const e = _expenses.find(x => x.id === id);
  if (!e) return;
  confirmAction(`¿Eliminar el gasto: <strong>${escHtml(e.description)}</strong>?`,
    asyncHandler(async () => {
      await dbDeleteRow('expenses', id);
      toast('Gasto eliminado', 'warning');
      await renderExpenses();
    })
  );
}
