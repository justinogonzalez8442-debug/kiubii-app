/* ============================================================
   APP.JS — Router + app controller
   ============================================================ */

const MODULE_TITLES = {
  dashboard:   'Dashboard',
  inventory:   'Inventario',
  sales:       'Ventas',
  expenses:    'Gastos',
  receivables: 'Cuentas por Cobrar',
  customers:   'Clientes',
  compras:     'Compras',
  users:       'Usuarios',
};

const MODULE_RENDERERS = {
  dashboard:   renderDashboard,
  inventory:   renderInventory,
  sales:       renderSales,
  expenses:    renderExpenses,
  receivables: renderReceivables,
  customers:   renderCustomers,
  compras:     renderCompras,
  users:       renderUsers,
};

let currentModule = 'dashboard';

async function navigate(module) {
  if (!MODULE_RENDERERS[module]) return;

  // Block admin-only modules for vendedores
  if ((module === 'expenses' || module === 'users' || module === 'compras') && !isAdmin()) {
    toast('Solo los administradores pueden acceder a este módulo', 'error');
    return;
  }

  // Update sidebar nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === module);
  });

  // Update bottom nav
  document.querySelectorAll('.bnav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === module);
  });

  // Show target module container
  document.querySelectorAll('.module-container').forEach(c => c.classList.add('hidden'));
  const target = document.getElementById('mod-' + module);
  if (target) target.classList.remove('hidden');

  el('pageTitle').textContent = MODULE_TITLES[module] || module;
  currentModule = module;

  // Show loading before async render
  showLoading('mod-' + module);

  try {
    await MODULE_RENDERERS[module]();
  } catch (err) {
    console.error('Module render error:', err);
    showModuleError('mod-' + module, err.message);
  }
}

function toggleSidebar() {
  el('sidebar').classList.toggle('collapsed');
  el('main').classList.toggle('sidebar-collapsed');
}

// ---- Initialize app ----
async function initApp() {
  // Set date in topbar
  el('dateDisplay').textContent = new Date().toLocaleDateString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  // Modal overlay: close on backdrop click
  el('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  // ESC key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Login form submit
  const loginForm = el('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  // Check existing session
  const session = await getSession();

  if (session) {
    renderAppShell();
    await navigate('dashboard');
  } else {
    renderLoginScreen();
  }
}

document.addEventListener('DOMContentLoaded', initApp);
