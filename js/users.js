/* ============================================================
   USERS.JS — Módulo de gestión de usuarios (solo admin)
   ============================================================
   Estrategia de creación:
   - Se usa un cliente Supabase temporal con persistSession: false
     para llamar a signUp() sin afectar la sesión del admin activo.
   - El trigger handle_new_user() crea el profile automáticamente.
   - Luego hacemos upsert del profile para asegurar nombre, email y rol.
   ============================================================ */

let _users = []; // perfiles cargados

async function renderUsers() {
  if (!isAdmin()) {
    el('mod-users').innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🔒</div>
      <div class="empty-state-title">Acceso restringido</div>
    </div>`;
    return;
  }
  _users = await fetchProfiles();
  _renderUsersUI();
}

function _renderUsersUI() {
  const total     = _users.length;
  const admins    = _users.filter(u => u.role === 'admin').length;
  const sellers   = _users.filter(u => u.role === 'vendedor').length;
  const disabled  = _users.filter(u => u.disabled).length;

  el('mod-users').innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Usuarios</h2>
      <button class="btn btn-primary" onclick="openNewUserModal()">+ Nuevo Usuario</button>
    </div>

    <div class="stats-row mb-20" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi-card">
        <div class="kpi-label">Total usuarios</div>
        <div class="kpi-value">${total}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Admins</div>
        <div class="kpi-value">${admins}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Vendedores</div>
        <div class="kpi-value">${sellers}</div>
      </div>
      <div class="kpi-card ${disabled > 0 ? 'danger' : ''}">
        <div class="kpi-label">Desactivados</div>
        <div class="kpi-value ${disabled > 0 ? 'text-danger' : ''}">${disabled}</div>
      </div>
    </div>

    <div class="filter-row mb-16">
      <div class="search-bar">
        <span class="search-bar-icon">&#128269;</span>
        <input type="text" id="userSearch" placeholder="Buscar por nombre o email…" oninput="filterUsers()">
      </div>
      <select id="userRoleFilter" onchange="filterUsers()">
        <option value="">Todos los roles</option>
        <option value="admin">Admin</option>
        <option value="vendedor">Vendedor</option>
      </select>
      <select id="userStatusFilter" onchange="filterUsers()">
        <option value="">Todos los estados</option>
        <option value="active">Activo</option>
        <option value="disabled">Desactivado</option>
      </select>
    </div>

    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Usuario</th>
          <th>Email</th>
          <th>Rol</th>
          <th>Estado</th>
          <th class="td-center">Acciones</th>
        </tr></thead>
        <tbody id="usersTableBody">${renderUserRows(_users)}</tbody>
      </table>
    </div>

    <div class="card mt-20" style="border-color:var(--border2)">
      <div class="card-title">Notas sobre gestión de usuarios</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.8">
        <p>• <strong>Crear usuario:</strong> Se registra en Supabase Auth y en la tabla profiles usando <code>signUp()</code> con un cliente temporal (no afecta tu sesión).</p>
        <p>• <strong>Confirmación de email:</strong> Si está activada en Supabase, el usuario recibirá un correo de confirmación antes de poder ingresar. Para desactivarla: <em>Authentication → Providers → Email → Confirm email → OFF</em>.</p>
        <p>• <strong>Desactivar:</strong> Impide el acceso a la app (validación en el login). No elimina el usuario de Supabase Auth.</p>
        <p>• <strong>Contraseña:</strong> Para restablecerla ve a <em>Supabase → Authentication → Users</em> y usa "Send password reset".</p>
      </div>
    </div>
  `;
}

function renderUserRows(users) {
  if (users.length === 0) return `<tr><td colspan="5">
    <div class="empty-state">
      <div class="empty-state-icon">👤</div>
      <div class="empty-state-title">Sin usuarios</div>
    </div>
  </td></tr>`;

  return users.map(u => {
    const isMe      = u.id === currentUser?.id;
    const initial   = (u.name || u.email || '?').charAt(0).toUpperCase();
    const roleCls   = u.role === 'admin' ? 'role-admin' : 'role-vendedor';
    const roleLabel = u.role === 'admin' ? 'Admin' : 'Vendedor';
    const statusBadgeHTML = u.disabled
      ? '<span class="badge badge-danger">Desactivado</span>'
      : '<span class="badge badge-success">Activo</span>';

    return `<tr style="${u.disabled ? 'opacity:0.6' : ''}">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="sidebar-avatar" style="width:34px;height:34px;font-size:14px;flex-shrink:0;
            background:${u.role === 'admin' ? 'var(--accent)' : 'var(--info)'};
            color:${u.role === 'admin' ? '#000' : '#fff'}">${initial}</div>
          <div>
            <div style="font-weight:600">${escHtml(u.name || '—')}${isMe ? ' <span style="font-size:10px;color:var(--text3)">(tú)</span>' : ''}</div>
          </div>
        </div>
      </td>
      <td class="td-muted" style="font-size:12px">${escHtml(u.email || '—')}</td>
      <td><span class="role-badge ${roleCls}">${roleLabel}</span></td>
      <td>${statusBadgeHTML}</td>
      <td class="td-center">
        <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-xs btn-ghost" onclick="openEditUserModal('${u.id}')">✏ Editar</button>
          ${!isMe
            ? `<button class="btn btn-xs ${u.disabled ? 'btn-secondary' : 'btn-danger'}"
                onclick="toggleUserStatus('${u.id}', ${u.disabled})">
                ${u.disabled ? '✓ Activar' : '⊘ Desactivar'}
              </button>`
            : `<span class="text-muted" style="font-size:11px">cuenta activa</span>`
          }
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterUsers() {
  const search = (el('userSearch')?.value || '').toLowerCase();
  const role   = el('userRoleFilter')?.value || '';
  const status = el('userStatusFilter')?.value || '';
  let users    = [..._users];
  if (search) users = users.filter(u =>
    (u.name  || '').toLowerCase().includes(search) ||
    (u.email || '').toLowerCase().includes(search));
  if (role)              users = users.filter(u => u.role === role);
  if (status === 'active')   users = users.filter(u => !u.disabled);
  if (status === 'disabled') users = users.filter(u => u.disabled);
  el('usersTableBody').innerHTML = renderUserRows(users);
}

// ============================================================
//  CREAR NUEVO USUARIO
// ============================================================
function openNewUserModal() {
  openModal('Nuevo Usuario', `
    <div class="alert alert-warning mb-16" style="font-size:12px">
      <span>ℹ</span>
      <span>Si la confirmación de email está activa en Supabase, el usuario recibirá
      un correo antes de poder ingresar. Para omitirlo: <em>Authentication → Providers → Email → Confirm email → OFF</em>.</span>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label>Nombre completo *</label>
        <input id="f_uName" type="text" placeholder="Laura García">
      </div>
      <div class="form-group">
        <label>Rol *</label>
        <select id="f_uRole">
          <option value="vendedor">Vendedor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Email *</label>
      <input id="f_uEmail" type="email" placeholder="usuario@kiubii.mx">
    </div>
    <div class="form-group" style="position:relative">
      <label>Contraseña temporal *</label>
      <input id="f_uPass" type="password" placeholder="Mínimo 6 caracteres">
      <button type="button" onclick="toggleFieldType('f_uPass')"
        style="position:absolute;right:10px;bottom:8px;background:none;border:none;cursor:pointer;font-size:15px;color:var(--text3)">👁</button>
    </div>
    <div id="createUserError" class="login-error hidden" style="margin-bottom:4px"></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="createUserBtn" onclick="createUser()">Crear Usuario</button>
    </div>
  `);
}

async function createUser() {
  const name     = el('f_uName').value.trim();
  const email    = el('f_uEmail').value.trim().toLowerCase();
  const password = el('f_uPass').value;
  const role     = el('f_uRole').value;
  const errEl    = el('createUserError');
  const btnEl    = el('createUserBtn');

  errEl.classList.add('hidden');

  if (!name || !email || !password) {
    errEl.textContent = 'Todos los campos son obligatorios.';
    errEl.classList.remove('hidden'); return;
  }
  if (password.length < 6) {
    errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    errEl.classList.remove('hidden'); return;
  }

  btnEl.disabled = true;
  btnEl.textContent = 'Creando…';

  try {
    // --- Paso 1: Registrar en Supabase Auth con cliente temporal ---
    // persistSession: false → no afecta la sesión del admin activo
    const sbTemp = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession:       false,
        autoRefreshToken:     false,
        detectSessionInUrl:   false,
      }
    });

    const { data: authData, error: authError } = await sbTemp.auth.signUp({
      email,
      password,
      options: {
        data: { name, role },           // leído por el trigger handle_new_user()
        emailRedirectTo: window.location.origin,
      }
    });

    if (authError) {
      console.error('[Users] signUp error:', authError);
      throw authError;
    }

    const userId = authData?.user?.id;
    if (!userId) {
      throw new Error('Supabase no devolvió el ID del usuario. ¿El email ya existe?');
    }

    // --- Paso 2: Upsert del profile con datos correctos ---
    // El trigger puede haber creado el perfil; upsert garantiza nombre, email y rol.
    const { error: profileError } = await sb.from('profiles').upsert({
      id:       userId,
      name,
      email,
      role,
      disabled: false,
    }, { onConflict: 'id' });

    if (profileError) {
      console.error('[Users] Profile upsert error:', profileError);
      // No fatal si ya existe; reportamos pero no abortamos
      console.warn('[Users] Profile may have been created by trigger, continuing…');
    }

    const needsConfirm = !authData.user?.email_confirmed_at && !authData.session;
    toast(
      needsConfirm
        ? `Usuario creado. Debe confirmar su email antes de ingresar.`
        : `Usuario "${name}" creado correctamente ✓`,
      needsConfirm ? 'warning' : 'success'
    );

    closeModal();
    _users = await fetchProfiles();
    _renderUsersUI();

  } catch (err) {
    const msg = err.message || String(err);
    let userMsg = `Error Supabase: ${msg}`;
    if (msg.includes('User already registered') || msg.includes('already been registered')) {
      userMsg = 'Ya existe un usuario con ese email.';
    } else if (msg.includes('Password should be')) {
      userMsg = 'La contraseña no cumple los requisitos mínimos de Supabase.';
    } else if (msg.includes('Unable to validate email')) {
      userMsg = 'El formato del email no es válido.';
    }
    errEl.textContent = userMsg;
    errEl.classList.remove('hidden');
    console.error('[Users] createUser error:', err);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = 'Crear Usuario';
  }
}

// ============================================================
//  EDITAR USUARIO (nombre y rol)
// ============================================================
function openEditUserModal(id) {
  const u = _users.find(x => x.id === id);
  if (!u) return;
  const isMe = u.id === currentUser?.id;

  openModal(`Editar — ${escHtml(u.name || u.email)}`, `
    <div class="form-group">
      <label>Nombre completo *</label>
      <input id="f_euName" type="text" value="${escHtml(u.name || '')}">
    </div>
    <div class="form-group">
      <label>Rol *</label>
      <select id="f_euRole" ${isMe ? 'disabled title="No puedes cambiar tu propio rol"' : ''}>
        <option value="vendedor" ${u.role === 'vendedor' ? 'selected' : ''}>Vendedor</option>
        <option value="admin"    ${u.role === 'admin'    ? 'selected' : ''}>Admin</option>
      </select>
      ${isMe ? '<p style="font-size:11px;color:var(--text3);margin-top:4px">No puedes cambiar tu propio rol.</p>' : ''}
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="text" value="${escHtml(u.email || '')}" readonly style="background:var(--bg4);cursor:not-allowed"
        title="El email no se puede cambiar desde aquí. Usa Supabase Dashboard.">
      <span style="font-size:11px;color:var(--text3)">Para cambiar el email usa Supabase → Authentication → Users.</span>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveUserEdit('${id}', ${isMe})">Guardar</button>
    </div>
  `);
}

async function saveUserEdit(id, isMe) {
  const name = el('f_euName').value.trim();
  const role = isMe ? _users.find(x => x.id === id)?.role : el('f_euRole').value;
  if (!name) { toast('El nombre no puede estar vacío', 'error'); return; }

  try {
    await dbUpdateRow('profiles', id, { name, role });
    toast('Usuario actualizado ✓');

    // Si el admin editó su propio nombre, actualizar topbar
    if (isMe) {
      currentProfile = { ...currentProfile, name };
      el('topbarUserName').textContent = name;
      el('topbarUserAvatar').textContent = name.charAt(0).toUpperCase();
    }

    closeModal();
    _users = await fetchProfiles();
    _renderUsersUI();
  } catch (err) {
    toast('Error al guardar: ' + err.message, 'error');
  }
}

// ============================================================
//  ACTIVAR / DESACTIVAR
// ============================================================
async function toggleUserStatus(id, currentlyDisabled) {
  const u       = _users.find(x => x.id === id);
  const action  = currentlyDisabled ? 'activar' : 'desactivar';
  const newVal  = !currentlyDisabled;

  confirmAction(
    `¿${action.charAt(0).toUpperCase() + action.slice(1)} a <strong>${escHtml(u?.name || id)}</strong>?
    ${newVal ? '<br><span style="font-size:12px;color:var(--text3)">El usuario no podrá acceder a la aplicación.</span>' : ''}`,
    asyncHandler(async () => {
      await dbUpdateRow('profiles', id, { disabled: newVal });
      toast(`Usuario ${newVal ? 'desactivado' : 'activado'} ✓`, newVal ? 'warning' : 'success');
      _users = await fetchProfiles();
      _renderUsersUI();
    })
  );
}

// ---- Helper: toggle password visibility en cualquier campo ----
function toggleFieldType(fieldId) {
  const inp = el(fieldId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
