/* ============================================================
   CUSTOMERS.JS
   ============================================================ */

let _customers    = [];
let _custSales    = [];

async function renderCustomers() {
  [_customers, _custSales] = await Promise.all([
    fetchCustomers(),
    fetchSales(),
  ]);
  _renderCustomersUI();
}

function _renderCustomersUI() {
  const customers = _customers;
  const byType = { menudeo: 0, mayoreo: 0, distribuidor: 0 };
  customers.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });

  // Calculate total purchases per customer from sales
  const custTotals = {};
  _custSales.forEach(s => { custTotals[s.customer_id] = (custTotals[s.customer_id] || 0) + Number(s.total); });

  el('mod-customers').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Clientes</h2>
      <button class="btn btn-primary" onclick="openNewCustomerModal()">+ Nuevo Cliente</button>
    </div>

    <div class="stats-row mb-20" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi-card">
        <div class="kpi-label">Total clientes</div>
        <div class="kpi-value">${customers.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Menudeo</div>
        <div class="kpi-value">${byType.menudeo}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Mayoreo</div>
        <div class="kpi-value">${byType.mayoreo}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Distribuidores</div>
        <div class="kpi-value">${byType.distribuidor}</div>
      </div>
    </div>

    <div class="filter-row">
      <div class="search-bar">
        <span class="search-bar-icon">&#128269;</span>
        <input type="text" id="custSearch" placeholder="Buscar por nombre, email o teléfono…" oninput="filterCustomers()">
      </div>
      <select id="custTypeFilter" onchange="filterCustomers()">
        <option value="">Todos los tipos</option>
        <option value="menudeo">Menudeo</option>
        <option value="mayoreo">Mayoreo</option>
        <option value="distribuidor">Distribuidor</option>
      </select>
    </div>

    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Cliente</th><th>Tipo</th><th>Email</th><th>Teléfono</th>
          <th>Dirección</th><th class="td-right">Total Compras</th>
          <th class="td-center">Pedidos</th><th class="td-center">Acciones</th>
        </tr></thead>
        <tbody id="custTableBody">${renderCustomerRows(customers, custTotals)}</tbody>
      </table>
    </div>
  `;
}

function renderCustomerRows(customers, custTotals) {
  if (customers.length === 0) return `<tr><td colspan="8">
    <div class="empty-state"><div class="empty-state-icon">👥</div>
    <div class="empty-state-title">Sin clientes</div>
    <div class="empty-state-desc">Agrega tu primer cliente</div></div>
  </td></tr>`;

  return customers.map(c => {
    const total      = custTotals[c.id] || 0;
    const custSales  = _custSales.filter(s => s.customer_id === c.id);
    return `<tr>
      <td>
        <button class="btn btn-ghost" style="padding:0;font-weight:600;text-align:left;color:var(--text1)"
          onclick="viewCustomerDetail('${c.id}')">${escHtml(c.name)}</button>
      </td>
      <td>${typeBadge(c.type)}</td>
      <td class="td-muted" style="font-size:12px">${escHtml(c.email || '—')}</td>
      <td class="td-muted" style="font-size:12px">${escHtml(c.phone || '—')}</td>
      <td class="td-muted" style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(c.address || '')}">${escHtml(c.address || '—')}</td>
      <td class="td-right fw-bold">${fmt(total)}</td>
      <td class="td-center">${custSales.length}</td>
      <td class="td-center">
        <div style="display:flex;gap:4px;justify-content:center">
          <button class="btn btn-xs btn-ghost" onclick="viewCustomerDetail('${c.id}')">👁</button>
          <button class="btn btn-xs btn-ghost" onclick="openEditCustomerModal('${c.id}')">✏</button>
          <button class="btn btn-xs btn-danger" onclick="deleteCustomer('${c.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterCustomers() {
  const search = (el('custSearch')?.value || '').toLowerCase();
  const type   = el('custTypeFilter')?.value || '';
  let customers = [..._customers];
  const custTotals = {};
  _custSales.forEach(s => { custTotals[s.customer_id] = (custTotals[s.customer_id] || 0) + Number(s.total); });
  if (search) customers = customers.filter(c =>
    c.name.toLowerCase().includes(search) ||
    (c.email || '').toLowerCase().includes(search) ||
    (c.phone || '').includes(search));
  if (type) customers = customers.filter(c => c.type === type);
  el('custTableBody').innerHTML = renderCustomerRows(customers, custTotals);
}

function openNewCustomerModal() {
  openModal('Nuevo Cliente', customerForm());
}

function openEditCustomerModal(id) {
  const c = _customers.find(x => x.id === id);
  if (!c) return;
  openModal('Editar Cliente', customerForm(c));
}

function customerForm(c = {}) {
  return `
    <div class="form-group">
      <label>Nombre / Razón Social *</label>
      <input id="f_cName" type="text" value="${escHtml(c.name || '')}" placeholder="Nombre completo o empresa">
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Tipo de Cliente *</label>
        <select id="f_cType">
          <option value="menudeo" ${c.type === 'menudeo' ? 'selected' : ''}>Menudeo (Retail)</option>
          <option value="mayoreo" ${c.type === 'mayoreo' ? 'selected' : ''}>Mayoreo</option>
          <option value="distribuidor" ${c.type === 'distribuidor' ? 'selected' : ''}>Distribuidor</option>
        </select>
      </div>
      <div class="form-group">
        <label>Teléfono</label>
        <input id="f_cPhone" type="tel" value="${escHtml(c.phone || '')}" placeholder="5512345678">
      </div>
    </div>
    <div class="form-group">
      <label>Email</label>
      <input id="f_cEmail" type="email" value="${escHtml(c.email || '')}" placeholder="contacto@empresa.com">
    </div>
    <div class="form-group">
      <label>Dirección</label>
      <input id="f_cAddress" type="text" value="${escHtml(c.address || '')}" placeholder="Calle, colonia, ciudad">
    </div>
    <div class="form-group">
      <label>Notas</label>
      <textarea id="f_cNotes" rows="2">${escHtml(c.notes || '')}</textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCustomer('${c.id || ''}')">Guardar</button>
    </div>
  `;
}

async function saveCustomer(id) {
  const name = el('f_cName').value.trim();
  if (!name) { toast('Ingresa el nombre del cliente', 'error'); return; }
  const data = {
    name,
    type:     el('f_cType').value,
    phone:    el('f_cPhone').value.trim(),
    email:    el('f_cEmail').value.trim(),
    address:  el('f_cAddress').value.trim(),
    notes:    el('f_cNotes').value.trim(),
    owner_id: currentUser.id,
  };
  try {
    if (id) { await dbUpdateRow('customers', id, data); toast('Cliente actualizado'); }
    else    { await dbInsert('customers', data);         toast('Cliente registrado'); }
    closeModal();
    await renderCustomers();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function viewCustomerDetail(id) {
  const c = _customers.find(x => x.id === id);
  if (!c) return;
  const custSales = _custSales
    .filter(s => s.customer_id === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalPurchases = custSales.reduce((a, s) => a + Number(s.total), 0);

  const salesHTML = custSales.length === 0
    ? '<p class="text-muted" style="font-size:13px;padding:8px 0">Sin ventas registradas</p>'
    : custSales.map(s => {
        const items = s.items || [];
        return `
          <div style="border:1px solid var(--border1);border-radius:8px;margin-bottom:10px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:8px 12px;background:var(--bg3);gap:12px;flex-wrap:wrap">
              <div style="display:flex;gap:16px;align-items:center">
                <span style="font-size:13px;font-weight:600">${fmtDate(s.date)}</span>
                ${statusBadge(s.status)}
                <span class="td-muted" style="font-size:12px;text-transform:capitalize">
                  ${escHtml(s.payment_method)}
                </span>
              </div>
              <span style="font-size:15px;font-weight:700;color:var(--accent)">${fmt(s.total)}</span>
            </div>
            ${items.length > 0 ? `
              <table style="width:100%;font-size:12px">
                <thead><tr style="background:var(--bg4)">
                  <th style="padding:5px 12px;text-align:left;color:var(--text3);font-weight:500">Producto</th>
                  <th style="padding:5px 8px;text-align:center;color:var(--text3);font-weight:500">Cant.</th>
                  <th style="padding:5px 8px;text-align:right;color:var(--text3);font-weight:500">Precio</th>
                  <th style="padding:5px 12px;text-align:right;color:var(--text3);font-weight:500">Subtotal</th>
                </tr></thead>
                <tbody>
                  ${items.map(i => `<tr style="border-top:1px solid var(--border1)">
                    <td style="padding:5px 12px">${escHtml(i.product_name || '—')}</td>
                    <td style="padding:5px 8px;text-align:center">${fmtNum(i.qty)}</td>
                    <td style="padding:5px 8px;text-align:right">${fmt(i.unit_price)}</td>
                    <td style="padding:5px 12px;text-align:right;font-weight:600">
                      ${fmt(i.subtotal || Number(i.unit_price) * Number(i.qty))}
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>` : `<div style="padding:8px 12px;font-size:12px;color:var(--text3)">Sin detalle de productos</div>`
            }
          </div>`;
      }).join('');

  openModal(`Cliente — ${escHtml(c.name)}`, `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px">
      <div><div class="text-muted" style="font-size:11px">TIPO</div>${typeBadge(c.type)}</div>
      <div><div class="text-muted" style="font-size:11px">TELÉFONO</div><strong>${escHtml(c.phone || '—')}</strong></div>
      <div><div class="text-muted" style="font-size:11px">EMAIL</div>
        <strong style="font-size:12px">${escHtml(c.email || '—')}</strong></div>
      <div><div class="text-muted" style="font-size:11px">TOTAL ACUMULADO</div>
        <strong class="text-accent" style="font-size:18px">${fmt(totalPurchases)}</strong>
        <span class="text-muted" style="font-size:11px;margin-left:4px">(${custSales.length} ventas)</span>
      </div>
    </div>
    ${c.address ? `<div class="mb-8 text-muted" style="font-size:12px"><strong>Dirección:</strong> ${escHtml(c.address)}</div>` : ''}
    ${c.notes   ? `<div class="mb-12 text-muted" style="font-size:12px"><strong>Notas:</strong> ${escHtml(c.notes)}</div>` : ''}

    <div class="card-title mb-10" style="border-top:1px solid var(--border1);padding-top:14px">
      Historial de Ventas
    </div>
    <div style="max-height:420px;overflow-y:auto;padding-right:2px">
      ${salesHTML}
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-ghost btn-sm"
        onclick="closeModal();openEditCustomerModal('${c.id}')">Editar</button>
      <button class="btn btn-primary btn-sm"
        onclick="closeModal();navigate('sales').then(()=>openNewSaleModal())">Nueva Venta</button>
    </div>
  `, 'modal-lg');
}

function deleteCustomer(id) {
  const c = _customers.find(x => x.id === id);
  if (!c) return;
  confirmAction(`¿Eliminar al cliente <strong>${escHtml(c.name)}</strong>?`,
    asyncHandler(async () => {
      await dbDeleteRow('customers', id);
      toast('Cliente eliminado', 'warning');
      await renderCustomers();
    })
  );
}
