/* ============================================================
   SALES.JS
   ============================================================ */

let _sales     = [];
let _saleCusts = [];
let _saleProds = [];

async function renderSales() {
  [_sales, _saleCusts, _saleProds] = await Promise.all([
    fetchSales(),
    fetchCustomers(),
    fetchProducts(),
  ]);
  _renderSalesUI();
}

function _renderSalesUI() {
  const total      = _sales.reduce((a, s) => a + Number(s.total), 0);
  const totalPaid  = _sales.filter(s => s.status === 'pagado').reduce((a, s) => a + Number(s.total), 0);
  const totalCred  = _sales.filter(s => s.status === 'credito').reduce((a, s) => a + Number(s.total), 0);

  el('mod-sales').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Ventas</h2>
      <button class="btn btn-primary" onclick="openNewSaleModal()">+ Nueva Venta</button>
    </div>
    <div class="stats-row mb-20" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-card">
        <div class="kpi-label">Total ventas</div>
        <div class="kpi-value" style="font-size:20px">${fmt(total)}</div>
        <div class="kpi-sub">${_sales.length} registros</div>
      </div>
      <div class="kpi-card success">
        <div class="kpi-label">Cobrado</div>
        <div class="kpi-value" style="font-size:20px">${fmt(totalPaid)}</div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-label">En crédito</div>
        <div class="kpi-value" style="font-size:20px">${fmt(totalCred)}</div>
      </div>
    </div>
    <div class="filter-row">
      <div class="search-bar">
        <span class="search-bar-icon">&#128269;</span>
        <input type="text" id="salesSearch" placeholder="Buscar cliente…" oninput="filterSales()">
      </div>
      <select id="salesStatusFilter" onchange="filterSales()">
        <option value="">Todos los estados</option>
        <option value="pagado">Pagado</option>
        <option value="credito">Crédito</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <select id="salesPayFilter" onchange="filterSales()">
        <option value="">Todos los métodos</option>
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
        <option value="tarjeta">Tarjeta</option>
      </select>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Fecha</th><th>Cliente</th><th>Productos</th>
          <th class="td-right">Subtotal</th><th class="td-right">Descuento</th>
          <th class="td-right">Total</th><th>Método</th><th>Estado</th><th class="td-center">Acciones</th>
        </tr></thead>
        <tbody id="salesTableBody">${renderSalesRows(_sales)}</tbody>
      </table>
    </div>
  `;
}

function renderSalesRows(sales) {
  if (sales.length === 0) return `<tr><td colspan="9">
    <div class="empty-state"><div class="empty-state-icon">🛒</div>
    <div class="empty-state-title">Sin ventas</div></div>
  </td></tr>`;

  return sales.map(s => {
    const itemNames = (s.items || []).map(i => escHtml(i.product_name)).join(', ');
    return `<tr>
      <td class="td-muted">${fmtDate(s.date)}</td>
      <td><strong>${escHtml(s.customer_name)}</strong></td>
      <td class="td-muted" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${itemNames || '—'}</td>
      <td class="td-right">${fmt(s.subtotal)}</td>
      <td class="td-right text-muted">${Number(s.discount) > 0 ? fmt(s.discount) : '—'}</td>
      <td class="td-right fw-bold">${fmt(s.total)}</td>
      <td class="td-muted" style="font-size:12px;text-transform:capitalize">${escHtml(s.payment_method)}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="td-center">
        <div style="display:flex;gap:4px;justify-content:center">
          <button class="btn btn-xs btn-ghost" onclick="viewSaleDetail('${s.id}')">👁</button>
          <button class="btn btn-xs btn-ghost" onclick="openEditSaleModal('${s.id}')">✏</button>
          <button class="btn btn-xs btn-danger" onclick="deleteSale('${s.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterSales() {
  const search = (el('salesSearch')?.value || '').toLowerCase();
  const status = el('salesStatusFilter')?.value || '';
  const pay    = el('salesPayFilter')?.value || '';
  let sales    = [..._sales];
  if (search) sales = sales.filter(s => s.customer_name.toLowerCase().includes(search));
  if (status) sales = sales.filter(s => s.status === status);
  if (pay)    sales = sales.filter(s => s.payment_method === pay);
  el('salesTableBody').innerHTML = renderSalesRows(sales);
}

function openNewSaleModal() {
  openModal('Nueva Venta', saleForm(), 'modal-xl');
  addSaleLineItem();
}

function openEditSaleModal(id) {
  const s = _sales.find(x => x.id === id);
  if (!s) return;
  openModal('Editar Venta', saleForm(s), 'modal-xl');
  el('lineItemsBody').innerHTML = '';
  (s.items || []).forEach(item => addSaleLineItem(item));
  calcSaleTotals();
}

function saleForm(s = {}) {
  return `
    <div class="form-grid-3">
      <div class="form-group">
        <label>Fecha *</label>
        <input id="f_saleDate" type="date" value="${s.date || todayStr()}">
      </div>
      <div class="form-group">
        <label>Cliente *</label>
        <select id="f_saleCust">
          <option value="">— Seleccionar —</option>
          ${_saleCusts.map(c => `<option value="${c.id}" data-name="${escHtml(c.name)}" data-type="${c.type}" ${s.customer_id === c.id ? 'selected' : ''}>${escHtml(c.name)} (${c.type})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Método de Pago *</label>
        <select id="f_salePay">
          <option value="efectivo" ${s.payment_method === 'efectivo' ? 'selected' : ''}>Efectivo</option>
          <option value="transferencia" ${s.payment_method === 'transferencia' ? 'selected' : ''}>Transferencia</option>
          <option value="tarjeta" ${s.payment_method === 'tarjeta' ? 'selected' : ''}>Tarjeta</option>
          <option value="otro" ${s.payment_method === 'otro' ? 'selected' : ''}>Otro</option>
        </select>
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Estado</label>
        <select id="f_saleStatus">
          <option value="pagado" ${s.status === 'pagado' ? 'selected' : ''}>Pagado</option>
          <option value="credito" ${s.status === 'credito' ? 'selected' : ''}>Crédito (genera CxC)</option>
          <option value="cancelado" ${s.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>
      <div class="form-group">
        <label>Descuento Global (MXN)</label>
        <input id="f_saleDiscount" type="number" min="0" step="0.01" value="${s.discount || 0}" oninput="calcSaleTotals()">
      </div>
    </div>
    <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
      <label style="text-transform:uppercase;letter-spacing:1px;font-size:12px;color:var(--text2)">Productos</label>
      <button class="btn btn-ghost btn-sm" type="button" onclick="addSaleLineItem()">+ Agregar línea</button>
    </div>
    <div class="line-items">
      <div class="line-item-header">
        <span>Producto</span><span>Cant.</span><span>Precio Unit.</span><span>Subtotal</span><span></span>
      </div>
      <div id="lineItemsBody"></div>
    </div>
    <div class="totals-block">
      <div class="total-row"><span class="total-label">Subtotal:</span><span class="total-value" id="saleSubtotal">$0.00</span></div>
      <div class="total-row"><span class="total-label">Descuento:</span><span class="total-value" id="saleDiscountDisplay">$0.00</span></div>
      <div class="total-row total-final"><span class="total-label">TOTAL:</span><span class="total-value text-accent" id="saleTotal">$0.00</span></div>
    </div>
    <div class="form-group mt-12">
      <label>Notas</label>
      <textarea id="f_saleNotes" rows="2">${escHtml(s.notes || '')}</textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveSale('${s.id || ''}')">Guardar Venta</button>
    </div>
  `;
}

function addSaleLineItem(item = {}) {
  const container = el('lineItemsBody');
  const rowId = 'row_' + genId();
  const div = document.createElement('div');
  div.className = 'line-item-row';
  div.id = rowId;
  div.innerHTML = `
    <select class="li-product" onchange="onSaleProductSelect(this,'${rowId}')">
      <option value="">— Producto —</option>
      ${_saleProds.map(p => `<option value="${p.id}"
        data-price="${p.sell_price}"
        data-wholesale="${p.sell_price_wholesale || p.sell_price}"
        data-name="${escHtml(p.name)}"
        ${item.product_id === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')}
    </select>
    <input class="li-qty" type="number" min="1" value="${item.qty || 1}" oninput="calcSaleRow('${rowId}');calcSaleTotals()">
    <input class="li-price" type="number" min="0" step="0.01" value="${item.unit_price || 0}" oninput="calcSaleRow('${rowId}');calcSaleTotals()">
    <input class="li-subtotal" type="number" readonly value="${item.subtotal || 0}" style="background:var(--bg4);color:var(--accent)">
    <button class="btn-icon" onclick="removeSaleLine('${rowId}')" style="color:var(--danger)">✕</button>
  `;
  container.appendChild(div);
  if (item.unit_price) calcSaleRow(rowId);
  calcSaleTotals();
}

function onSaleProductSelect(sel, rowId) {
  const opt = sel.options[sel.selectedIndex];
  if (!opt.value) return;
  const custSel = el('f_saleCust');
  const custType = custSel?.options[custSel.selectedIndex]?.dataset?.type || 'menudeo';
  let price = parseFloat(opt.dataset.price);
  if (custType === 'mayoreo' || custType === 'distribuidor') {
    price = parseFloat(opt.dataset.wholesale) || price;
  }
  el(rowId).querySelector('.li-price').value = price;
  calcSaleRow(rowId);
  calcSaleTotals();
}

function calcSaleRow(rowId) {
  const row = el(rowId);
  if (!row) return;
  const qty   = parseFloat(row.querySelector('.li-qty').value) || 0;
  const price = parseFloat(row.querySelector('.li-price').value) || 0;
  row.querySelector('.li-subtotal').value = (qty * price).toFixed(2);
}

function calcSaleTotals() {
  let subtotal = 0;
  document.querySelectorAll('.li-subtotal').forEach(inp => { subtotal += parseFloat(inp.value) || 0; });
  const discount = parseFloat(el('f_saleDiscount')?.value) || 0;
  if (el('saleSubtotal'))       el('saleSubtotal').textContent       = fmt(subtotal);
  if (el('saleDiscountDisplay')) el('saleDiscountDisplay').textContent = fmt(discount);
  if (el('saleTotal'))          el('saleTotal').textContent          = fmt(subtotal - discount);
}

function removeSaleLine(rowId) {
  const row = el(rowId); if (row) row.remove();
  calcSaleTotals();
}

async function saveSale(id) {
  const date       = el('f_saleDate').value;
  const custSel    = el('f_saleCust');
  const customerId = custSel.value;
  const customerName = custSel.options[custSel.selectedIndex]?.dataset?.name || '';
  if (!date || !customerId) { toast('Completa fecha y cliente', 'error'); return; }

  const items = [];
  el('lineItemsBody').querySelectorAll('.line-item-row').forEach(row => {
    const prodSel = row.querySelector('.li-product');
    if (!prodSel.value) return;
    const qty       = parseFloat(row.querySelector('.li-qty').value) || 0;
    const unitPrice = parseFloat(row.querySelector('.li-price').value) || 0;
    const subtotal  = parseFloat(row.querySelector('.li-subtotal').value) || 0;
    items.push({
      product_id:   prodSel.value,
      product_name: prodSel.options[prodSel.selectedIndex].dataset.name || prodSel.options[prodSel.selectedIndex].text,
      qty, unit_price: unitPrice, subtotal,
    });
  });
  if (items.length === 0) { toast('Agrega al menos un producto', 'error'); return; }

  const discount    = parseFloat(el('f_saleDiscount').value) || 0;
  const subtotalSum = items.reduce((a, i) => a + i.subtotal, 0);
  const total       = subtotalSum - discount;
  const status      = el('f_saleStatus').value;

  const saleData = {
    date, customer_id: customerId, customer_name: customerName,
    subtotal: subtotalSum, discount, total,
    payment_method: el('f_salePay').value,
    status,
    notes: el('f_saleNotes').value.trim(),
    user_id: currentUser.id,
  };

  try {
    let savedSale;
    if (id) {
      savedSale = await updateSaleWithItems(id, saleData, items);
      toast('Venta actualizada');
    } else {
      savedSale = await insertSaleWithItems(saleData, items);
      toast('Venta registrada');
      // Auto-create receivable for credit sales
      if (status === 'credito') {
        const dueDate = new Date(date + 'T12:00:00');
        dueDate.setDate(dueDate.getDate() + 15);
        await dbInsert('receivables', {
          owner_id:        currentUser.id,
          customer_id:     customerId,
          customer_name:   customerName,
          sale_id:         savedSale.id,
          original_amount: total,
          paid_amount:     0,
          balance:         total,
          due_date:        dueDate.toISOString().split('T')[0],
          status:          'pendiente',
          notes:           '',
          seller_name:     getUserName(),
          sale_date:       date,
        });
        toast('Cuenta por cobrar creada automáticamente', 'warning');
      }
    }
    closeModal();
    await renderSales();
  } catch (err) {
    toast('Error al guardar: ' + err.message, 'error');
  }
}

function viewSaleDetail(id) {
  const s = _sales.find(x => x.id === id);
  if (!s) return;
  openModal(`Venta — ${escHtml(s.customer_name)}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><span class="text-muted" style="font-size:11px">FECHA</span><br><strong>${fmtDate(s.date)}</strong></div>
      <div><span class="text-muted" style="font-size:11px">ESTADO</span><br>${statusBadge(s.status)}</div>
      <div><span class="text-muted" style="font-size:11px">CLIENTE</span><br><strong>${escHtml(s.customer_name)}</strong></div>
      <div><span class="text-muted" style="font-size:11px">MÉTODO PAGO</span><br><strong style="text-transform:capitalize">${escHtml(s.payment_method)}</strong></div>
    </div>
    <div class="table-wrapper mb-12">
      <table>
        <thead><tr><th>Producto</th><th class="td-right">Cant.</th><th class="td-right">Precio Unit.</th><th class="td-right">Subtotal</th></tr></thead>
        <tbody>${(s.items || []).map(i => `<tr>
          <td>${escHtml(i.product_name)}</td>
          <td class="td-right">${i.qty}</td>
          <td class="td-right">${fmt(i.unit_price)}</td>
          <td class="td-right fw-bold">${fmt(i.subtotal)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="totals-block">
      <div class="total-row"><span class="total-label">Subtotal:</span><span class="total-value">${fmt(s.subtotal)}</span></div>
      ${Number(s.discount) > 0 ? `<div class="total-row"><span class="total-label">Descuento:</span><span class="total-value text-danger">- ${fmt(s.discount)}</span></div>` : ''}
      <div class="total-row total-final"><span class="total-label">TOTAL:</span><span class="total-value text-accent">${fmt(s.total)}</span></div>
    </div>
    ${s.notes ? `<div class="mt-12 text-muted" style="font-size:12px"><strong>Notas:</strong> ${escHtml(s.notes)}</div>` : ''}
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal();openEditSaleModal('${s.id}')">Editar</button>
    </div>
  `);
}

function deleteSale(id) {
  const s = _sales.find(x => x.id === id);
  if (!s) return;
  confirmAction(`¿Eliminar la venta de <strong>${escHtml(s.customer_name)}</strong> por ${fmt(s.total)}?`,
    asyncHandler(async () => {
      await dbDeleteRow('sales', id);
      toast('Venta eliminada', 'warning');
      await renderSales();
    })
  );
}
