/* ============================================================
   AUTH.JS — Login screen + session management
   ============================================================ */

function renderLoginScreen() {
  el('loginOverlay').classList.remove('hidden');
  el('appShell').classList.add('hidden');
}

function renderAppShell() {
  el('loginOverlay').classList.add('hidden');
  el('appShell').classList.remove('hidden');

  // Update topbar user info
  el('topbarUserName').textContent = getUserName();
  el('topbarUserAvatar').textContent = getUserName().charAt(0).toUpperCase();

  const roleBadge = el('topbarRoleBadge');
  if (roleBadge) {
    roleBadge.textContent = isAdmin() ? 'Admin' : 'Vendedor';
    roleBadge.className = 'role-badge ' + (isAdmin() ? 'role-admin' : 'role-vendedor');
  }

  // Hide admin-only nav items for vendedores
  const gastosNav = document.querySelector('.nav-item[data-module="expenses"]');
  if (gastosNav) gastosNav.style.display = isAdmin() ? '' : 'none';

  const comprasNav = document.querySelector('.nav-item[data-module="compras"]');
  if (comprasNav) comprasNav.style.display = isAdmin() ? '' : 'none';

  const usersNav = document.querySelector('.nav-item[data-module="users"]');
  if (usersNav) usersNav.style.display = isAdmin() ? '' : 'none';

  // Hide admin-only bottom nav items for vendedores
  const bnavExpenses = el('bnavExpenses');
  if (bnavExpenses) bnavExpenses.style.display = isAdmin() ? '' : 'none';

  const bnavCompras = el('bnavCompras');
  if (bnavCompras) bnavCompras.style.display = isAdmin() ? '' : 'none';

  const bnavUsers = el('bnavUsers');
  if (bnavUsers) bnavUsers.style.display = isAdmin() ? '' : 'none';
}

async function handleLogin(e) {
  if (e) e.preventDefault();

  const email    = el('loginEmail').value.trim();
  const password = el('loginPassword').value;
  const errEl    = el('loginError');
  const btnEl    = el('loginBtn');

  if (!email || !password) {
    errEl.textContent = 'Ingresa tu email y contraseña.';
    errEl.classList.remove('hidden');
    return;
  }

  errEl.classList.add('hidden');
  btnEl.disabled = true;
  btnEl.textContent = 'Ingresando…';

  try {
    await signIn(email, password);
    renderAppShell();
    await navigate('dashboard');
  } catch (err) {
    // Mostrar el mensaje exacto de Supabase sin transformarlo
    const msg    = err.message || String(err);
    const status = err.status  || '';

    let userMsg;
    if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
      userMsg = `⚠ Email sin confirmar. Ve a Supabase → Authentication → Users, abre el usuario y haz clic en "Send confirmation email" o activa "Auto Confirm" en Email settings.`;
    } else if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
      userMsg = `Credenciales incorrectas (HTTP ${status}). Verifica email y contraseña. Si el usuario fue creado manualmente puede que necesite confirmación de email.`;
    } else if (msg.includes('User not found')) {
      userMsg = `No existe un usuario con ese email.`;
    } else {
      // Mostrar el mensaje crudo de Supabase para diagnosticar
      userMsg = `Error Supabase (${status}): ${msg}`;
    }

    errEl.innerHTML = userMsg;
    errEl.classList.remove('hidden');

    // También imprimir en consola para ver el objeto completo
    console.error('[Kiubii] Login failed:', err);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = 'Ingresar';
  }
}

async function handleLogout() {
  try {
    await signOut();
  } catch (_) {}
  renderLoginScreen();
  // Clear password field for security
  if (el('loginPassword')) el('loginPassword').value = '';
  toast('Sesión cerrada', 'success');
}

// ---- Toggle password visibility ----
function togglePasswordVisibility() {
  const inp = el('loginPassword');
  const btn = el('togglePassBtn');
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    btn.textContent = '👁';
  }
}

// ---- Seed sample data (admin only, callable once) ----
async function runSeed() {
  if (!isAdmin()) { toast('Solo el admin puede hacer esto', 'error'); return; }
  try {
    const { data, error } = await sb.rpc('seed_sample_data');
    if (error) throw error;
    toast(data, 'success');
    await navigate(currentModule || 'dashboard');
  } catch (err) {
    toast('Error al sembrar datos: ' + err.message, 'error');
  }
}
