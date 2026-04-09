/* ============================================================
   INVENTORY.JS
   ============================================================ */

let _products = [];

async function renderInventory() {
  _products = await fetchProducts();
  _renderInventoryUI();
}

function _renderInventoryUI() {
  const products = _products;
  const categories = [...new Set(products.map(p => p.category))].sort();
  const lowStock = products.filter(p => p.stock <= p.min_stock);

  const totalCost  = products.reduce((a, p) => a + p.stock * Number(p.buy_price), 0);
  const totalSell  = products.reduce((a, p) => a + p.stock * Number(p.sell_price), 0);

  el('mod-inventory').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Inventario</h2>
      ${isAdmin() ? `<button class="btn btn-primary" onclick="openNewProductModal()">+ Nuevo Producto</button>` : ''}
    </div>

    ${lowStock.length > 0 ? `
    <div class="alert alert-warning mb-16">
      <span>⚠</span>
      <span><strong>${lowStock.length} producto(s) con stock bajo:</strong>
        ${lowStock.map(p => `<strong>${escHtml(p.name)}</strong> (${p.stock})`).join(', ')}
      </span>
    </div>` : ''}

    <div class="stats-row mb-20" style="grid-template-columns:repeat(${isAdmin() ? 4 : 3},1fr)">
      <div class="kpi-card">
        <div class="kpi-label">Total SKUs</div>
        <div class="kpi-value">${products.length}</div>
      </div>
      ${isAdmin() ? `
      <div class="kpi-card">
        <div class="kpi-label">Valor inventario (costo)</div>
        <div class="kpi-value" style="font-size:18px">${fmt(totalCost)}</div>
      </div>` : ''}
      <div class="kpi-card">
        <div class="kpi-label">Valor inventario (venta)</div>
        <div class="kpi-value" style="font-size:18px">${fmt(totalSell)}</div>
      </div>
      <div class="kpi-card ${lowStock.length > 0 ? 'danger' : ''}">
        <div class="kpi-label">Stock bajo / Agotados</div>
        <div class="kpi-value ${lowStock.length > 0 ? 'text-danger' : ''}">${lowStock.length}</div>
      </div>
    </div>

    <div class="filter-row">
      <div class="search-bar">
        <span class="search-bar-icon">&#128269;</span>
        <input type="text" id="invSearch" placeholder="Buscar por nombre o SKU…" oninput="filterInventory()">
      </div>
      <select id="invCatFilter" onchange="filterInventory()">
        <option value="">Todas las categorías</option>
        ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select id="invStockFilter" onchange="filterInventory()">
        <option value="">Todo el stock</option>
        <option value="low">Stock bajo</option>
        <option value="ok">Stock OK</option>
      </select>
    </div>

    <div class="table-wrapper">
      <table id="invTable">
        <thead><tr>
          <th>SKU</th>
          <th>Producto</th>
          <th>Categoría</th>
          ${isAdmin() ? '<th class="td-right">Precio Compra</th>' : ''}
          <th class="td-right">Precio Venta</th>
          <th class="td-right">P. Mayoreo</th>
          <th class="td-center">Stock</th>
          <th class="td-center">Mínimo</th>
          <th class="td-center">Estado</th>
          ${isAdmin() ? '<th class="td-center">Acciones</th>' : ''}
        </tr></thead>
        <tbody id="invTableBody">${renderInventoryRows(products)}</tbody>
      </table>
    </div>
  `;
}

function renderInventoryRows(products) {
  if (products.length === 0) return `<tr><td colspan="10">
    <div class="empty-state">
      <div class="empty-state-icon">📦</div>
      <div class="empty-state-title">Sin productos</div>
      <div class="empty-state-desc">Agrega tu primer producto</div>
    </div>
  </td></tr>`;

  return products.map(p => {
    const isLow = p.stock <= p.min_stock;
    const isOut = p.stock === 0;
    const stockBadge = isOut
      ? '<span class="badge badge-danger">Agotado</span>'
      : isLow ? '<span class="badge badge-warning">Stock Bajo</span>'
               : '<span class="badge badge-success">OK</span>';
    return `<tr>
      <td class="td-muted" style="font-size:11px;font-family:monospace">${escHtml(p.sku)}</td>
      <td><strong>${escHtml(p.name)}</strong><br><span style="font-size:11px;color:var(--text3)">${escHtml(p.brand || '')}</span></td>
      <td>${catBadge(p.category)}</td>
      ${isAdmin() ? `<td class="td-right">${fmt(p.buy_price)}</td>` : ''}
      <td class="td-right fw-bold">${fmt(p.sell_price)}</td>
      <td class="td-right text-muted">${fmt(p.sell_price_wholesale)}</td>
      <td class="td-center" style="${isLow ? 'color:var(--warning);font-weight:700' : ''}">${p.stock} ${escHtml(p.unit || '')}</td>
      <td class="td-center td-muted">${p.min_stock}</td>
      <td class="td-center">${stockBadge}</td>
      ${isAdmin() ? `<td class="td-center">
        <div style="display:flex;gap:4px;justify-content:center">
          <button class="btn btn-xs btn-ghost" onclick="openEditProductModal('${p.id}')" title="Editar">✏</button>
          <button class="btn btn-xs btn-ghost" onclick="openAdjustStockModal('${p.id}')" title="Ajustar">±</button>
          <button class="btn btn-xs btn-danger" onclick="deleteProduct('${p.id}')" title="Eliminar">✕</button>
        </div>
      </td>` : ''}
    </tr>`;
  }).join('');
}

function filterInventory() {
  const search  = (el('invSearch')?.value || '').toLowerCase();
  const cat     = el('invCatFilter')?.value || '';
  const stockF  = el('invStockFilter')?.value || '';
  let products  = [..._products];
  if (search)          products = products.filter(p => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search) || (p.brand || '').toLowerCase().includes(search));
  if (cat)             products = products.filter(p => p.category === cat);
  if (stockF === 'low') products = products.filter(p => p.stock <= p.min_stock);
  if (stockF === 'ok')  products = products.filter(p => p.stock > p.min_stock);
  el('invTableBody').innerHTML = renderInventoryRows(products);
}

function openNewProductModal() {
  openModal('Nuevo Producto', productForm(), 'modal-lg');
}

function openEditProductModal(id) {
  const p = _products.find(x => x.id === id);
  if (!p) return;
  openModal('Editar Producto', productForm(p), 'modal-lg');
}

function productForm(p = {}) {
  const cats = ['Proteínas', 'Creatina', 'Pre-Entreno', 'Aminoácidos', 'Vitaminas', 'Quemadores', 'Otros'];
  return `
    <div class="form-grid-2">
      <div class="form-group">
        <label>SKU *</label>
        <input id="f_sku" type="text" value="${escHtml(p.sku || '')}" placeholder="WP-CHOC-1K">
      </div>
      <div class="form-group">
        <label>Categoría *</label>
        <select id="f_cat">${cats.map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group">
      <label>Nombre del producto *</label>
      <input id="f_name" type="text" value="${escHtml(p.name || '')}" placeholder="Whey Protein Chocolate 1kg">
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Marca</label>
        <input id="f_brand" type="text" value="${escHtml(p.brand || '')}">
      </div>
      <div class="form-group">
        <label>Unidad</label>
        <input id="f_unit" type="text" value="${escHtml(p.unit || '')}" placeholder="bolsa / bote / frasco">
      </div>
    </div>
    <div class="form-grid-3">
      <div class="form-group">
        <label>Precio Compra (MXN) *</label>
        <input id="f_buyPrice" type="number" min="0" step="0.01" value="${p.buy_price || ''}">
      </div>
      <div class="form-group">
        <label>Precio Venta Menudeo *</label>
        <input id="f_sellPrice" type="number" min="0" step="0.01" value="${p.sell_price || ''}">
      </div>
      <div class="form-group">
        <label>Precio Mayoreo</label>
        <input id="f_sellPriceWholesale" type="number" min="0" step="0.01" value="${p.sell_price_wholesale || ''}">
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Stock Actual *</label>
        <input id="f_stock" type="number" min="0" value="${p.stock ?? 0}">
      </div>
      <div class="form-group">
        <label>Stock Mínimo *</label>
        <input id="f_minStock" type="number" min="0" value="${p.min_stock ?? 5}">
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveProduct('${p.id || ''}')">Guardar</button>
    </div>
  `;
}

async function saveProduct(id) {
  const sku       = el('f_sku').value.trim();
  const name      = el('f_name').value.trim();
  const buyPrice  = parseFloat(el('f_buyPrice').value);
  const sellPrice = parseFloat(el('f_sellPrice').value);
  if (!sku || !name || isNaN(buyPrice) || isNaN(sellPrice)) {
    toast('Completa los campos obligatorios', 'error'); return;
  }
  const data = {
    sku, name,
    category:             el('f_cat').value,
    brand:                el('f_brand').value.trim(),
    unit:                 el('f_unit').value.trim(),
    buy_price:            buyPrice,
    sell_price:           sellPrice,
    sell_price_wholesale: parseFloat(el('f_sellPriceWholesale').value) || sellPrice,
    stock:                parseInt(el('f_stock').value) || 0,
    min_stock:            parseInt(el('f_minStock').value) || 5,
  };
  try {
    if (id) { await dbUpdateRow('products', id, data); toast('Producto actualizado'); }
    else    { await dbInsert('products', data);         toast('Producto creado'); }
    closeModal();
    await renderInventory();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function openAdjustStockModal(id) {
  const p = _products.find(x => x.id === id);
  if (!p) return;
  openModal('Ajustar Stock', `
    <div style="margin-bottom:16px">
      <p><strong>${escHtml(p.name)}</strong></p>
      <p class="text-muted" style="font-size:13px;margin-top:4px">Stock actual: <strong>${p.stock} ${escHtml(p.unit || '')}</strong></p>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Tipo de ajuste</label>
        <select id="f_adjType">
          <option value="add">Entrada (sumar)</option>
          <option value="sub">Salida (restar)</option>
          <option value="set">Establecer exacto</option>
        </select>
      </div>
      <div class="form-group">
        <label>Cantidad</label>
        <input id="f_adjQty" type="number" min="0" value="0">
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="applyStockAdjust('${id}', ${p.stock})">Aplicar</button>
    </div>
  `);
}

async function applyStockAdjust(id, currentStock) {
  const type = el('f_adjType').value;
  const qty  = parseInt(el('f_adjQty').value) || 0;
  const newStock = type === 'add' ? currentStock + qty
                 : type === 'sub' ? Math.max(0, currentStock - qty)
                 : qty;
  try {
    await dbUpdateRow('products', id, { stock: newStock });
    toast('Stock actualizado');
    closeModal();
    await renderInventory();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function deleteProduct(id) {
  const p = _products.find(x => x.id === id);
  if (!p) return;
  confirmAction(`¿Eliminar el producto <strong>${escHtml(p.name)}</strong>?`,
    asyncHandler(async () => {
      await dbDeleteRow('products', id);
      toast('Producto eliminado', 'warning');
      await renderInventory();
    })
  );
}
