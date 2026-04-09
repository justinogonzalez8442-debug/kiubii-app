/* ============================================================
   QUOTES.JS — Cotizaciones
   ============================================================ */

let _quotes     = [];
let _quoteCusts = [];
let _quoteProds = [];

async function renderQuotes() {
  [_quotes, _quoteCusts, _quoteProds] = await Promise.all([
    fetchQuotes(),
    fetchCustomers(),
    fetchProducts(),
  ]);
  _renderQuotesUI();
}

function _renderQuotesUI() {
  const quotes    = _quotes;
  const total     = quotes.reduce((a, q) => a + Number(q.total), 0);
  const accepted  = quotes.filter(q => q.status === 'aceptada');
  const pending   = quotes.filter(q => q.status === 'enviada');

  el('mod-quotes').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Cotizaciones</h2>
      <button class="btn btn-primary" onclick="openNewQuoteModal()">+ Nueva Cotización</button>
    </div>

    <div class="stats-row mb-20" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi-card">
        <div class="kpi-label">Total cotizado</div>
        <div class="kpi-value" style="font-size:18px">${fmt(total)}</div>
        <div class="kpi-sub">${quotes.length} cotizaciones</div>
      </div>
      <div class="kpi-card success">
        <div class="kpi-label">Aceptadas</div>
        <div class="kpi-value" style="font-size:18px">${fmt(accepted.reduce((a, q) => a + Number(q.total), 0))}</div>
        <div class="kpi-sub">${accepted.length} cotizaciones</div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-label">Pendientes</div>
        <div class="kpi-value" style="font-size:18px">${fmt(pending.reduce((a, q) => a + Number(q.total), 0))}</div>
        <div class="kpi-sub">${pending.length} cotizaciones</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Tasa aceptación</div>
        <div class="kpi-value" style="font-size:18px">${quotes.length > 0 ? Math.round(accepted.length / quotes.length * 100) : 0}%</div>
      </div>
    </div>

    <div class="filter-row">
      <div class="search-bar">
        <span class="search-bar-icon">&#128269;</span>
        <input type="text" id="quoteSearch" placeholder="Buscar cliente…" oninput="filterQuotes()">
      </div>
      <select id="quoteStatusFilter" onchange="filterQuotes()">
        <option value="">Todos los estados</option>
        <option value="borrador">Borrador</option>
        <option value="enviada">Enviada</option>
        <option value="aceptada">Aceptada</option>
        <option value="rechazada">Rechazada</option>
      </select>
    </div>

    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>#</th><th>Fecha</th><th>Cliente</th><th>Válida hasta</th>
          <th class="td-right">Total</th><th>Estado</th><th class="td-center">Acciones</th>
        </tr></thead>
        <tbody id="quoteTableBody">${renderQuoteRows(quotes)}</tbody>
      </table>
    </div>
  `;
}

function renderQuoteRows(quotes) {
  if (quotes.length === 0) return `<tr><td colspan="7">
    <div class="empty-state"><div class="empty-state-icon">📄</div>
    <div class="empty-state-title">Sin cotizaciones</div></div>
  </td></tr>`;

  return quotes.map((q, i) => `<tr>
    <td class="td-muted" style="font-size:11px;font-family:monospace">COT-${String(quotes.length - i).padStart(3, '0')}</td>
    <td class="td-muted">${fmtDate(q.date)}</td>
    <td><strong>${escHtml(q.customer_name)}</strong></td>
    <td class="td-muted">${fmtDate(q.valid_until)}</td>
    <td class="td-right fw-bold">${fmt(q.total)}</td>
    <td>${statusBadge(q.status)}</td>
    <td class="td-center">
      <div style="display:flex;gap:4px;justify-content:center">
        <button class="btn btn-xs btn-ghost" onclick="viewQuoteDetail('${q.id}')">👁</button>
        <button class="btn btn-xs btn-ghost" onclick="openEditQuoteModal('${q.id}')">✏</button>
        ${q.status !== 'aceptada'
          ? `<button class="btn btn-xs btn-primary" onclick="convertQuoteToSale('${q.id}')">→ Venta</button>`
          : ''}
        <button class="btn btn-xs btn-danger" onclick="deleteQuote('${q.id}')">✕</button>
      </div>
    </td>
  </tr>`).join('');
}

function filterQuotes() {
  const search = (el('quoteSearch')?.value || '').toLowerCase();
  const status = el('quoteStatusFilter')?.value || '';
  let quotes = [..._quotes];
  if (search) quotes = quotes.filter(q => q.customer_name.toLowerCase().includes(search));
  if (status) quotes = quotes.filter(q => q.status === status);
  el('quoteTableBody').innerHTML = renderQuoteRows(quotes);
}

function openNewQuoteModal() {
  openModal('Nueva Cotización', quoteForm(), 'modal-xl');
  addQuoteLineItem();
}

function openEditQuoteModal(id) {
  const q = _quotes.find(x => x.id === id);
  if (!q) return;
  openModal('Editar Cotización', quoteForm(q), 'modal-xl');
  el('quoteLineItemsBody').innerHTML = '';
  (q.items || []).forEach(item => addQuoteLineItem(item));
  calcQuoteTotals();
}

function quoteForm(q = {}) {
  const validDefault = new Date(); validDefault.setDate(validDefault.getDate() + 15);
  return `
    <div class="form-grid-3">
      <div class="form-group">
        <label>Fecha *</label>
        <input id="f_qDate" type="date" value="${q.date || todayStr()}">
      </div>
      <div class="form-group">
        <label>Cliente *</label>
        <select id="f_qCust">
          <option value="">— Seleccionar —</option>
          ${_quoteCusts.map(c => `<option value="${c.id}" data-name="${escHtml(c.name)}" data-type="${c.type}" ${q.customer_id === c.id ? 'selected' : ''}>${escHtml(c.name)} (${c.type})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Válida hasta</label>
        <input id="f_qValid" type="date" value="${q.valid_until || validDefault.toISOString().split('T')[0]}">
      </div>
    </div>
    <div class="form-group" style="width:fit-content">
      <label>Estado</label>
      <select id="f_qStatus">
        <option value="borrador" ${q.status === 'borrador' ? 'selected' : ''}>Borrador</option>
        <option value="enviada" ${q.status === 'enviada' ? 'selected' : ''}>Enviada</option>
        <option value="aceptada" ${q.status === 'aceptada' ? 'selected' : ''}>Aceptada</option>
        <option value="rechazada" ${q.status === 'rechazada' ? 'selected' : ''}>Rechazada</option>
      </select>
    </div>

    <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
      <label style="text-transform:uppercase;letter-spacing:1px;font-size:12px;color:var(--text2)">Productos</label>
      <button class="btn btn-ghost btn-sm" type="button" onclick="addQuoteLineItem()">+ Agregar línea</button>
    </div>
    <div class="line-items">
      <div class="line-item-header" style="grid-template-columns:2fr 60px 110px 80px 90px 36px">
        <span>Producto</span><span>Cant.</span><span>Precio Unit.</span><span>Desc.%</span><span>Subtotal</span><span></span>
      </div>
      <div id="quoteLineItemsBody"></div>
    </div>

    <div class="totals-block">
      <div class="total-row"><span class="total-label">Subtotal bruto:</span><span class="total-value" id="qSubtotal">$0.00</span></div>
      <div class="total-row"><span class="total-label">Desc. total:</span><span class="total-value text-danger" id="qDiscount">$0.00</span></div>
      <div class="total-row total-final"><span class="total-label">TOTAL:</span><span class="total-value text-accent" id="qTotal">$0.00</span></div>
    </div>

    <div class="form-group mt-12">
      <label>Notas / Condiciones</label>
      <textarea id="f_qNotes" rows="2">${escHtml(q.notes || '')}</textarea>
    </div>

    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveQuote('${q.id || ''}')">Guardar Cotización</button>
    </div>
  `;
}

function addQuoteLineItem(item = {}) {
  const container = el('quoteLineItemsBody');
  const rowId = 'qrow_' + genId();
  const div = document.createElement('div');
  div.className = 'line-item-row';
  div.id = rowId;
  div.style.gridTemplateColumns = '2fr 60px 110px 80px 90px 36px';
  div.innerHTML = `
    <select class="qli-product" onchange="onQuoteProductSelect(this,'${rowId}')">
      <option value="">— Producto —</option>
      ${_quoteProds.map(p => `<option value="${p.id}"
        data-price="${p.sell_price}"
        data-wholesale="${p.sell_price_wholesale || p.sell_price}"
        data-name="${escHtml(p.name)}"
        ${item.product_id === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')}
    </select>
    <input class="qli-qty"      type="number" min="1" value="${item.qty || 1}" oninput="calcQuoteRow('${rowId}');calcQuoteTotals()">
    <input class="qli-price"    type="number" min="0" step="0.01" value="${item.unit_price || 0}" oninput="calcQuoteRow('${rowId}');calcQuoteTotals()">
    <input class="qli-disc"     type="number" min="0" max="100" step="0.1" value="${item.discount || 0}" oninput="calcQuoteRow('${rowId}');calcQuoteTotals()">
    <input class="qli-subtotal" type="number" readonly value="${item.subtotal || 0}" style="background:var(--bg4);color:var(--accent)">
    <button class="btn-icon" onclick="removeQuoteLine('${rowId}')" style="color:var(--danger)">✕</button>
  `;
  container.appendChild(div);
  if (item.unit_price) calcQuoteRow(rowId);
  calcQuoteTotals();
}

function onQuoteProductSelect(sel, rowId) {
  const opt = sel.options[sel.selectedIndex];
  if (!opt.value) return;
  const custSel  = el('f_qCust');
  const custType = custSel?.options[custSel.selectedIndex]?.dataset?.type || 'menudeo';
  let price = parseFloat(opt.dataset.price);
  if (custType === 'mayoreo' || custType === 'distribuidor') {
    price = parseFloat(opt.dataset.wholesale) || price;
  }
  el(rowId).querySelector('.qli-price').value = price;
  calcQuoteRow(rowId);
  calcQuoteTotals();
}

function calcQuoteRow(rowId) {
  const row = el(rowId); if (!row) return;
  const qty  = parseFloat(row.querySelector('.qli-qty').value) || 0;
  const price = parseFloat(row.querySelector('.qli-price').value) || 0;
  const disc  = parseFloat(row.querySelector('.qli-disc').value) || 0;
  row.querySelector('.qli-subtotal').value = (qty * price * (1 - disc / 100)).toFixed(2);
}

function calcQuoteTotals() {
  let grossSub = 0, netSub = 0;
  document.querySelectorAll('#quoteLineItemsBody .line-item-row').forEach(row => {
    const qty   = parseFloat(row.querySelector('.qli-qty').value) || 0;
    const price = parseFloat(row.querySelector('.qli-price').value) || 0;
    const disc  = parseFloat(row.querySelector('.qli-disc').value) || 0;
    grossSub += qty * price;
    netSub   += qty * price * (1 - disc / 100);
  });
  if (el('qSubtotal')) el('qSubtotal').textContent = fmt(grossSub);
  if (el('qDiscount')) el('qDiscount').textContent = fmt(grossSub - netSub);
  if (el('qTotal'))    el('qTotal').textContent    = fmt(netSub);
}

function removeQuoteLine(rowId) {
  const row = el(rowId); if (row) row.remove();
  calcQuoteTotals();
}

async function saveQuote(id) {
  const date       = el('f_qDate').value;
  const custSel    = el('f_qCust');
  const customerId = custSel.value;
  const customerName = custSel.options[custSel.selectedIndex]?.dataset?.name || '';
  if (!date || !customerId) { toast('Completa fecha y cliente', 'error'); return; }

  const items = [];
  document.querySelectorAll('#quoteLineItemsBody .line-item-row').forEach(row => {
    const prodSel = row.querySelector('.qli-product');
    if (!prodSel.value) return;
    const qty      = parseFloat(row.querySelector('.qli-qty').value) || 0;
    const unitPrice = parseFloat(row.querySelector('.qli-price').value) || 0;
    const discount = parseFloat(row.querySelector('.qli-disc').value) || 0;
    const subtotal = parseFloat(row.querySelector('.qli-subtotal').value) || 0;
    items.push({
      product_id: prodSel.value,
      product_name: prodSel.options[prodSel.selectedIndex].dataset.name || prodSel.options[prodSel.selectedIndex].text,
      qty, unit_price: unitPrice, discount, subtotal,
    });
  });
  if (items.length === 0) { toast('Agrega al menos un producto', 'error'); return; }

  const grossSub    = items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const netTotal    = items.reduce((a, i) => a + i.subtotal, 0);
  const totalDisc   = grossSub - netTotal;

  const quoteData = {
    date, customer_id: customerId, customer_name: customerName,
    subtotal: grossSub, total_discount: totalDisc, total: netTotal,
    status:      el('f_qStatus').value,
    valid_until: el('f_qValid').value,
    notes:       el('f_qNotes').value.trim(),
    user_id:     currentUser.id,
  };

  try {
    if (id) {
      await updateQuoteWithItems(id, quoteData, items);
      toast('Cotización actualizada');
    } else {
      await insertQuoteWithItems(quoteData, items);
      toast('Cotización creada');
    }
    closeModal();
    await renderQuotes();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function viewQuoteDetail(id) {
  const q = _quotes.find(x => x.id === id);
  if (!q) return;
  openModal(`Cotización — ${escHtml(q.customer_name)}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><span class="text-muted" style="font-size:11px">CLIENTE</span><br><strong>${escHtml(q.customer_name)}</strong></div>
      <div><span class="text-muted" style="font-size:11px">ESTADO</span><br>${statusBadge(q.status)}</div>
      <div><span class="text-muted" style="font-size:11px">FECHA</span><br><strong>${fmtDate(q.date)}</strong></div>
      <div><span class="text-muted" style="font-size:11px">VÁLIDA HASTA</span><br><strong>${fmtDate(q.valid_until)}</strong></div>
    </div>
    <div class="table-wrapper mb-12">
      <table>
        <thead><tr><th>Producto</th><th class="td-right">Cant.</th><th class="td-right">Precio Unit.</th><th class="td-right">Desc.</th><th class="td-right">Subtotal</th></tr></thead>
        <tbody>${(q.items || []).map(i => `<tr>
          <td>${escHtml(i.product_name)}</td>
          <td class="td-right">${i.qty}</td>
          <td class="td-right">${fmt(i.unit_price)}</td>
          <td class="td-right ${Number(i.discount) > 0 ? 'text-danger' : ''}">${Number(i.discount) > 0 ? i.discount + '%' : '—'}</td>
          <td class="td-right fw-bold">${fmt(i.subtotal)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="totals-block">
      <div class="total-row"><span class="total-label">Subtotal bruto:</span><span class="total-value">${fmt(q.subtotal)}</span></div>
      ${Number(q.total_discount) > 0 ? `<div class="total-row"><span class="total-label">Descuento:</span><span class="total-value text-danger">- ${fmt(q.total_discount)}</span></div>` : ''}
      <div class="total-row total-final"><span class="total-label">TOTAL:</span><span class="total-value text-accent">${fmt(q.total)}</span></div>
    </div>
    ${q.notes ? `<div class="mt-12 text-muted" style="font-size:12px"><strong>Notas:</strong> ${escHtml(q.notes)}</div>` : ''}
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      <div style="display:flex;gap:8px">
        <select id="qStatusChange" style="width:auto">
          <option value="">Cambiar estado…</option>
          <option value="borrador">Borrador</option>
          <option value="enviada">Enviada</option>
          <option value="aceptada">Aceptada</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="changeQuoteStatus('${q.id}')">Aplicar</button>
        ${q.status !== 'aceptada' ? `<button class="btn btn-primary btn-sm" onclick="closeModal();convertQuoteToSale('${q.id}')">→ Convertir a Venta</button>` : ''}
      </div>
    </div>
  `);
}

async function changeQuoteStatus(id) {
  const newStatus = el('qStatusChange')?.value;
  if (!newStatus) return;
  try {
    await dbUpdateRow('quotes', id, { status: newStatus });
    toast('Estado actualizado');
    closeModal();
    await renderQuotes();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function convertQuoteToSale(id) {
  const q = _quotes.find(x => x.id === id);
  if (!q) return;
  try {
    const saleId = await rpcConvertQuoteToSale(id);
    toast('Cotización convertida a venta ✓');
    await navigate('sales');
  } catch (err) {
    toast('Error al convertir: ' + err.message, 'error');
  }
}

function deleteQuote(id) {
  const q = _quotes.find(x => x.id === id);
  if (!q) return;
  confirmAction(`¿Eliminar la cotización de <strong>${escHtml(q.customer_name)}</strong>?`,
    asyncHandler(async () => {
      await dbDeleteRow('quotes', id);
      toast('Cotización eliminada', 'warning');
      await renderQuotes();
    })
  );
}
