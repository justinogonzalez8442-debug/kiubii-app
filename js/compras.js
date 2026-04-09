/* ============================================================
   COMPRAS.JS — Módulo de Compras (solo admin)
   ============================================================ */

let _purchases     = [];
let _purchProds    = [];  // productos para el selector del modal
let _purchModalItems = []; // líneas en construcción dentro del modal

// ============================================================
//  RENDER PRINCIPAL
// ============================================================
async function renderCompras() {
  if (!isAdmin()) {
    el('mod-compras').innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🔒</div>
      <div class="empty-state-title">Acceso restringido</div>
      <div class="empty-state-desc">Solo los administradores pueden ver las compras.</div>
    </div>`;
    return;
  }
  _purchases = await fetchPurchases();
  _renderComprasUI();
}

function _renderComprasUI() {
  const purchases = _purchases;
  const total = purchases.reduce((a, p) => a + Number(p.total), 0);
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyTotal = purchases
    .filter(p => p.date && p.date.startsWith(monthStr))
    .reduce((a, p) => a + Number(p.total), 0);
  const suppliers = new Set(purchases.map(p => p.supplier).filter(Boolean)).size;

  el('mod-compras').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Compras</h2>
      <button class="btn btn-primary" onclick="openNewPurchaseModal()">+ Nueva Compra</button>
    </div>

    <div class="stats-row mb-20" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-card">
        <div class="kpi-label">Total comprado</div>
        <div class="kpi-value" style="font-size:20px">${fmt(total)}</div>
        <div class="kpi-sub">${purchases.length} compras registradas</div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-label">Compras del mes</div>
        <div class="kpi-value" style="font-size:20px">${fmt(monthlyTotal)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Proveedores únicos</div>
        <div class="kpi-value">${suppliers}</div>
      </div>
    </div>

    <div class="filter-row mb-16">
      <div class="search-bar">
        <span class="search-bar-icon">&#128269;</span>
        <input type="text" id="purchSearch"
          placeholder="Buscar por proveedor o factura…"
          oninput="filterPurchases()">
      </div>
    </div>

    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Fecha</th>
          <th>Proveedor</th>
          <th>Factura / Folio</th>
          <th class="td-center">Productos</th>
          <th class="td-right">Total</th>
          <th>Método</th>
          <th class="td-center">Acciones</th>
        </tr></thead>
        <tbody id="purchTableBody">${_renderPurchaseRows(purchases)}</tbody>
      </table>
    </div>
  `;
}

function _renderPurchaseRows(purchases) {
  if (purchases.length === 0) return `<tr><td colspan="7">
    <div class="empty-state">
      <div class="empty-state-icon">📦</div>
      <div class="empty-state-title">Sin compras registradas</div>
      <div class="empty-state-desc">Registra tu primera compra de mercancía</div>
    </div>
  </td></tr>`;

  return purchases.map(p => `<tr>
    <td class="td-muted">${fmtDate(p.date)}</td>
    <td><strong>${escHtml(p.supplier || '—')}</strong></td>
    <td class="td-muted" style="font-size:12px">${escHtml(p.invoice_number || '—')}</td>
    <td class="td-center">${(p.items || []).length}</td>
    <td class="td-right fw-bold text-warning">${fmt(p.total)}</td>
    <td class="td-muted" style="font-size:12px;text-transform:capitalize">${escHtml(p.payment_method)}</td>
    <td class="td-center">
      <button class="btn btn-xs btn-ghost" onclick="viewPurchaseDetail('${p.id}')">👁 Ver</button>
    </td>
  </tr>`).join('');
}

function filterPurchases() {
  const search = (el('purchSearch')?.value || '').toLowerCase();
  let list = [..._purchases];
  if (search) list = list.filter(p =>
    (p.supplier || '').toLowerCase().includes(search) ||
    (p.invoice_number || '').toLowerCase().includes(search));
  el('purchTableBody').innerHTML = _renderPurchaseRows(list);
}

// ============================================================
//  VER DETALLE
// ============================================================
function viewPurchaseDetail(id) {
  const p = _purchases.find(x => x.id === id);
  if (!p) return;
  const items = p.items || [];

  openModal(`Compra — ${escHtml(p.supplier || '—')}`, `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div>
        <div class="text-muted" style="font-size:11px">FECHA</div>
        <strong>${fmtDate(p.date)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">MÉTODO DE PAGO</div>
        <strong style="text-transform:capitalize">${escHtml(p.payment_method)}</strong>
      </div>
      <div>
        <div class="text-muted" style="font-size:11px">TOTAL</div>
        <strong class="text-warning" style="font-size:18px">${fmt(p.total)}</strong>
      </div>
    </div>
    ${p.invoice_number ? `<div class="mb-8">
      <span class="text-muted" style="font-size:11px">FACTURA / FOLIO: </span>
      <strong>${escHtml(p.invoice_number)}</strong>
    </div>` : ''}
    ${p.notes ? `<div class="mb-12 text-muted" style="font-size:12px">
      <strong>Notas:</strong> ${escHtml(p.notes)}
    </div>` : ''}

    <div class="card-title mb-8">Productos comprados</div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Producto</th>
          <th class="td-center">Cantidad</th>
          <th class="td-right">Precio Unitario</th>
          <th class="td-right">Subtotal</th>
        </tr></thead>
        <tbody>
          ${items.map(i => `<tr>
            <td>${escHtml(i.product_name)}</td>
            <td class="td-center">${fmtNum(i.quantity)}</td>
            <td class="td-right">${fmt(i.unit_price)}</td>
            <td class="td-right fw-bold">${fmt(i.subtotal)}</td>
          </tr>`).join('')}
          <tr style="border-top:2px solid var(--border2)">
            <td colspan="3" class="td-right"><strong>Total</strong></td>
            <td class="td-right fw-bold text-warning">${fmt(p.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
    </div>
  `, 'modal-lg');
}

// ============================================================
//  NUEVA COMPRA
// ============================================================
async function openNewPurchaseModal() {
  _purchProds    = await fetchProducts();
  _purchModalItems = [];
  openModal('Nueva Compra', _purchFormHTML(), 'modal-lg');
  _renderPurchItems();
}

function _purchFormHTML() {
  return `
    <div class="form-grid-2">
      <div class="form-group">
        <label>Proveedor *</label>
        <input id="f_pSupplier" type="text" placeholder="Nombre del proveedor">
      </div>
      <div class="form-group">
        <label>Fecha *</label>
        <input id="f_pDate" type="date" value="${todayStr()}">
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Número de Factura / Folio</label>
        <input id="f_pInvoice" type="text" placeholder="FAC-0001">
      </div>
      <div class="form-group">
        <label>Método de Pago *</label>
        <select id="f_pPayment">
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="cheque">Cheque</option>
          <option value="credito">Crédito (a pagar)</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Notas</label>
      <textarea id="f_pNotes" rows="2" placeholder="Observaciones, condiciones de pago…"></textarea>
    </div>

    <div style="display:flex;align-items:center;gap:10px;border-top:1px solid var(--border1);padding-top:14px;margin-top:4px;margin-bottom:10px">
      <div class="card-title" style="margin:0">Productos</div>
      <button type="button" class="btn btn-xs btn-secondary" onclick="addPurchItem()">+ Agregar producto</button>
    </div>
    <div id="purchItemsContainer"></div>

    <div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;
                margin-top:12px;padding-top:12px;border-top:1px solid var(--border1)">
      <span class="text-muted">Total:</span>
      <span id="purchTotalDisplay" style="font-size:22px;font-weight:700;color:var(--warning)">$0.00</span>
    </div>

    <div id="purchFormError" class="login-error hidden" style="margin-bottom:4px"></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="savePurchBtn" onclick="savePurchase()">Registrar Compra</button>
    </div>
  `;
}

function _renderPurchItems() {
  const container = el('purchItemsContainer');
  if (!container) return;

  if (_purchModalItems.length === 0) {
    container.innerHTML = `<div class="text-muted" style="font-size:13px;text-align:center;
      padding:16px;border:1px dashed var(--border2);border-radius:8px">
      Sin productos. Haz clic en "+ Agregar producto".
    </div>`;
    _refreshPurchTotal();
    return;
  }

  container.innerHTML = `
    <div class="table-wrapper" style="overflow-x:auto">
      <table style="min-width:520px">
        <thead><tr>
          <th>Producto</th>
          <th style="width:85px">Cantidad</th>
          <th style="width:130px">Precio Unit. (MXN)</th>
          <th style="width:110px" class="td-right">Subtotal</th>
          <th style="width:36px"></th>
        </tr></thead>
        <tbody>
          ${_purchModalItems.map((item, idx) => `<tr id="pi_row_${idx}">
            <td>
              <select style="width:100%" onchange="onPurchProdChange(${idx}, this)">
                <option value="">— Seleccionar producto —</option>
                ${_purchProds.map(p =>
                  `<option value="${p.id}" data-price="${p.buy_price || 0}"
                    ${item.product_id === p.id ? 'selected' : ''}>
                    ${escHtml(p.name)} (stock: ${p.stock})
                  </option>`
                ).join('')}
              </select>
            </td>
            <td>
              <input type="number" min="1" step="1" value="${item.quantity || 1}"
                style="width:100%;text-align:center"
                oninput="onPurchQtyChange(${idx}, this.value)">
            </td>
            <td>
              <input type="number" min="0" step="0.01"
                value="${item.unit_price > 0 ? item.unit_price : ''}"
                placeholder="0.00"
                style="width:100%;text-align:right"
                oninput="onPurchPriceChange(${idx}, this.value)">
            </td>
            <td class="td-right fw-bold" id="pi_sub_${idx}">${fmt(item.subtotal || 0)}</td>
            <td>
              <button type="button" class="btn btn-xs btn-danger"
                onclick="removePurchItem(${idx})">✕</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  _refreshPurchTotal();
}

function addPurchItem() {
  _purchModalItems.push({ product_id: '', product_name: '', quantity: 1, unit_price: 0, subtotal: 0 });
  _renderPurchItems();
}

function removePurchItem(idx) {
  _purchModalItems.splice(idx, 1);
  _renderPurchItems();
}

function onPurchProdChange(idx, selectEl) {
  const id   = selectEl.value;
  const prod = _purchProds.find(p => p.id === id);
  _purchModalItems[idx].product_id   = id;
  _purchModalItems[idx].product_name = prod ? prod.name : '';
  // Pre-fill last buy_price if available
  if (prod && prod.buy_price > 0) {
    _purchModalItems[idx].unit_price = prod.buy_price;
  }
  _purchModalItems[idx].subtotal =
    _purchModalItems[idx].unit_price * _purchModalItems[idx].quantity;
  // Full re-render to populate price input with pre-filled value
  _renderPurchItems();
}

function onPurchQtyChange(idx, val) {
  _purchModalItems[idx].quantity = Math.max(1, parseInt(val) || 1);
  _purchModalItems[idx].subtotal =
    _purchModalItems[idx].unit_price * _purchModalItems[idx].quantity;
  _refreshPurchRow(idx);
  _refreshPurchTotal();
}

function onPurchPriceChange(idx, val) {
  _purchModalItems[idx].unit_price = parseFloat(val) || 0;
  _purchModalItems[idx].subtotal   =
    _purchModalItems[idx].unit_price * _purchModalItems[idx].quantity;
  _refreshPurchRow(idx);
  _refreshPurchTotal();
}

function _refreshPurchRow(idx) {
  const subEl = el('pi_sub_' + idx);
  if (subEl) subEl.textContent = fmt(_purchModalItems[idx].subtotal);
}

function _refreshPurchTotal() {
  const total = _purchModalItems.reduce((a, i) => a + (i.subtotal || 0), 0);
  const display = el('purchTotalDisplay');
  if (display) display.textContent = fmt(total);
}

async function savePurchase() {
  const supplier = el('f_pSupplier')?.value.trim() || '';
  const date     = el('f_pDate')?.value || '';
  const invoice  = el('f_pInvoice')?.value.trim() || '';
  const payment  = el('f_pPayment')?.value || 'efectivo';
  const notes    = el('f_pNotes')?.value.trim() || '';
  const errEl    = el('purchFormError');
  const btnEl    = el('savePurchBtn');

  errEl.classList.add('hidden');

  if (!supplier) {
    errEl.textContent = 'El proveedor es obligatorio.';
    errEl.classList.remove('hidden'); return;
  }
  if (!date) {
    errEl.textContent = 'La fecha es obligatoria.';
    errEl.classList.remove('hidden'); return;
  }
  if (_purchModalItems.length === 0) {
    errEl.textContent = 'Agrega al menos un producto.';
    errEl.classList.remove('hidden'); return;
  }
  const invalid = _purchModalItems.filter(i => !i.product_id || i.quantity < 1 || i.unit_price <= 0);
  if (invalid.length > 0) {
    errEl.textContent = 'Verifica que todos los productos tengan producto, cantidad y precio válidos.';
    errEl.classList.remove('hidden'); return;
  }

  const total = _purchModalItems.reduce((a, i) => a + i.subtotal, 0);

  btnEl.disabled = true;
  btnEl.textContent = 'Registrando…';

  try {
    await rpcRegisterPurchase(
      { supplier, date, payment_method: payment, invoice_number: invoice, notes, total, user_id: currentUser.id },
      _purchModalItems
    );
    toast('Compra registrada. Stock actualizado y gasto generado automáticamente ✓', 'success');
    closeModal();
    _purchases = await fetchPurchases();
    _renderComprasUI();
  } catch (err) {
    errEl.textContent = 'Error: ' + err.message;
    errEl.classList.remove('hidden');
    console.error('[Compras] savePurchase error:', err);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = 'Registrar Compra';
  }
}
