/* ============================================================
   DASHBOARD.JS
   ============================================================ */

async function renderDashboard() {
  const container = el('mod-dashboard');

  // Fetch all data in parallel
  const [sales, expenses, receivables, products] = await Promise.all([
    fetchSales(),
    isAdmin() ? fetchExpenses() : Promise.resolve([]),
    fetchReceivables(),
    fetchProducts(),
  ]);

  const now      = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthlySales = sales.filter(s => s.date && s.date.startsWith(monthStr));
  const totalMonth   = monthlySales.reduce((a, s) => a + Number(s.total), 0);

  const monthlyExp  = expenses.filter(e => e.date && e.date.startsWith(monthStr));
  const totalExp    = monthlyExp.reduce((a, e) => a + Number(e.amount), 0);

  const profit      = totalMonth - totalExp;
  const profitPct   = totalMonth > 0 ? ((profit / totalMonth) * 100).toFixed(1) : '0.0';

  const activeRec   = receivables.filter(r => r.status !== 'pagado');
  const totalRec    = activeRec.reduce((a, r) => a + Number(r.balance), 0);
  const overdueRec  = activeRec.filter(r => r.due_date && r.due_date < todayStr());
  const overdueAmt  = overdueRec.reduce((a, r) => a + Number(r.balance), 0);

  const lowStock    = products.filter(p => p.stock <= p.min_stock);

  // Recent sales (last 6)
  const recentSales = sales.slice(0, 6);

  // Expense by category (this month, admin only)
  const expByCat = {};
  monthlyExp.forEach(e => { expByCat[e.category] = (expByCat[e.category] || 0) + Number(e.amount); });

  // Top products by revenue this month
  const prodRevenue = {};
  monthlySales.forEach(s => {
    (s.items || []).forEach(item => {
      prodRevenue[item.product_name] = (prodRevenue[item.product_name] || 0) + Number(item.subtotal);
    });
  });
  const topProducts = Object.entries(prodRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const monthName = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  container.innerHTML = `
    <div class="stats-row">
      <div class="kpi-card ${profit < 0 ? 'danger' : 'success'}">
        <div class="kpi-icon">💰</div>
        <div class="kpi-label">Ventas del mes</div>
        <div class="kpi-value">${fmt(totalMonth)}</div>
        <div class="kpi-sub">${monthlySales.length} transacciones · ${monthName}</div>
      </div>
      ${isAdmin() ? `
      <div class="kpi-card warning">
        <div class="kpi-icon">📤</div>
        <div class="kpi-label">Gastos del mes</div>
        <div class="kpi-value">${fmt(totalExp)}</div>
        <div class="kpi-sub">${monthlyExp.length} registros</div>
      </div>
      <div class="kpi-card ${profit < 0 ? 'danger' : ''}">
        <div class="kpi-icon">📊</div>
        <div class="kpi-label">Utilidad neta</div>
        <div class="kpi-value ${profit < 0 ? 'text-danger' : 'text-accent'}">${fmt(profit)}</div>
        <div class="kpi-sub">Margen: ${profitPct}%</div>
      </div>` : ''}
      <div class="kpi-card ${overdueAmt > 0 ? 'danger' : ''}">
        <div class="kpi-icon">📋</div>
        <div class="kpi-label">Cuentas x Cobrar</div>
        <div class="kpi-value">${fmt(totalRec)}</div>
        <div class="kpi-sub">${overdueRec.length > 0
          ? `<span class="text-danger">${overdueRec.length} vencidas (${fmt(overdueAmt)})</span>`
          : `${activeRec.length} pendientes`}</div>
      </div>
    </div>

    ${lowStock.length > 0 ? `
    <div class="alert alert-warning mb-20">
      <span>⚠</span>
      <div><strong>Stock bajo en ${lowStock.length} producto(s):</strong>
        ${lowStock.map(p => `<strong>${escHtml(p.name)}</strong> (${p.stock} uds)`).join(' · ')}
        <a href="#" onclick="navigate('inventory')" style="color:var(--accent);margin-left:8px;font-size:12px">Ver inventario →</a>
      </div>
    </div>` : ''}

    ${overdueAmt > 0 ? `
    <div class="alert alert-danger mb-20">
      <span>⚠</span>
      <div><strong>${overdueRec.length} cuenta(s) vencida(s)</strong> por ${fmt(overdueAmt)}.
        <a href="#" onclick="navigate('receivables')" style="color:var(--accent);margin-left:8px;font-size:12px">Ver cuentas →</a>
      </div>
    </div>` : ''}

    <div class="grid-2 mb-24">
      <div class="card">
        <div class="card-title">Ventas recientes</div>
        ${recentSales.length === 0
          ? '<div class="empty-state"><div class="empty-state-icon">🛒</div><div class="empty-state-title">Sin ventas</div></div>'
          : `<div class="table-wrapper">
              <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th></tr></thead>
              <tbody>${recentSales.map(s => `<tr>
                <td class="td-muted">${fmtDateShort(s.date)}</td>
                <td>${escHtml(s.customer_name)}</td>
                <td class="fw-bold">${fmt(s.total)}</td>
                <td>${statusBadge(s.status)}</td>
              </tr>`).join('')}</tbody></table>
            </div>
            <div class="mt-12 text-right">
              <a href="#" onclick="navigate('sales')" class="btn btn-ghost btn-sm">Ver todas →</a>
            </div>`}
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        ${isAdmin() ? `
        <div class="card">
          <div class="card-title">Gastos por categoría (mes)</div>
          ${Object.keys(expByCat).length === 0
            ? '<div class="text-muted" style="font-size:13px">Sin gastos este mes</div>'
            : Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                const pct = totalExp > 0 ? (amt / totalExp * 100) : 0;
                return `<div class="mb-8">
                  <div class="flex-between mb-4">
                    <span style="font-size:13px">${escHtml(cat)}</span>
                    <span style="font-size:13px;font-weight:600">${fmt(amt)}</span>
                  </div>
                  <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                </div>`;
              }).join('')
          }
        </div>` : ''}

        <div class="card">
          <div class="card-title">Top Productos del mes</div>
          ${topProducts.length === 0
            ? '<div class="text-muted" style="font-size:13px">Sin datos este mes</div>'
            : topProducts.map(([name, rev], i) => `
              <div class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="color:var(--accent);font-weight:700;width:16px">${i + 1}</span>
                  <span>${escHtml(name)}</span>
                </div>
                <span class="fw-bold">${fmt(rev)}</span>
              </div>`).join('')
          }
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Acciones rápidas</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="navigate('sales').then(()=>openNewSaleModal())">+ Nueva Venta</button>
        ${isAdmin() ? `<button class="btn btn-secondary" onclick="navigate('expenses').then(()=>openNewExpenseModal())">+ Nuevo Gasto</button>` : ''}
${isAdmin() ? `<button class="btn btn-secondary" onclick="navigate('inventory').then(()=>openNewProductModal())">+ Producto</button>` : ''}
        <button class="btn btn-secondary" onclick="navigate('customers').then(()=>openNewCustomerModal())">+ Cliente</button>
        ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="runSeed()" title="Cargar datos de ejemplo">Seed datos</button>` : ''}
      </div>
    </div>
  `;
}
