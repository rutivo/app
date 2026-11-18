// Interfaz de Gestor Transfer. Todo el texto del usuario se inserta con
// textContent (nunca innerHTML) para evitar inyección de HTML.

const STATUS_LABELS = {
  pending: 'Pendiente',
  assigned: 'Asignado',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const state = { drivers: [], vehicles: [] };
const $ = (sel) => document.querySelector(sel);

// ---------- utilidades ----------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error ?? {};
    const details = Array.isArray(err.details)
      ? ': ' + err.details.map((d) => `${d.field} ${d.message}`).join('; ')
      : '';
    throw new Error((err.message ?? `Error ${res.status}`) + details);
  }
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = isError ? 'error' : '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 6000 : 3000);
}

/** Ejecuta una acción mostrando su error, si lo hay, en el aviso. */
async function run(action, successMessage) {
  try {
    await action();
    if (successMessage) toast(successMessage);
  } catch (error) {
    toast(error.message, true);
  }
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const dateFmt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ---------- pestañas ----------

for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('[role="tab"]')) {
      t.setAttribute('aria-selected', String(t === tab));
      $(`#${t.dataset.tab}`).hidden = t !== tab;
    }
  });
}

// ---------- conductores y vehículos ----------

function activeToggle(path, item, reload) {
  return el(
    'button',
    { onclick: () => run(async () => { await api(path, { method: 'PATCH', body: { active: !item.active } }); await reload(); }) },
    item.active ? 'Desactivar' : 'Activar',
  );
}

function deleteButton(path, label, reload) {
  return el(
    'button',
    {
      className: 'danger',
      onclick: () => {
        if (!confirm(`¿Borrar ${label}?`)) return;
        run(async () => { await api(path, { method: 'DELETE' }); await reload(); }, 'Borrado');
      },
    },
    'Borrar',
  );
}

async function loadDrivers() {
  state.drivers = await api('/drivers');
  $('#driver-rows').replaceChildren(
    ...state.drivers.map((d) =>
      el('tr', {},
        el('td', {}, d.name), el('td', {}, d.phone), el('td', {}, d.license),
        el('td', {}, d.active ? 'Sí' : 'No'),
        el('td', {}, el('div', { className: 'row-actions' },
          activeToggle(`/drivers/${d.id}`, d, loadDrivers),
          deleteButton(`/drivers/${d.id}`, d.name, loadDrivers))),
      ),
    ),
  );
}

async function loadVehicles() {
  state.vehicles = await api('/vehicles');
  $('#vehicle-rows').replaceChildren(
    ...state.vehicles.map((v) =>
      el('tr', {},
        el('td', {}, v.plate), el('td', {}, v.model), el('td', { className: 'num' }, v.seats),
        el('td', {}, v.active ? 'Sí' : 'No'),
        el('td', {}, el('div', { className: 'row-actions' },
          activeToggle(`/vehicles/${v.id}`, v, loadVehicles),
          deleteButton(`/vehicles/${v.id}`, v.plate, loadVehicles))),
      ),
    ),
  );
}

$('#driver-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    await api('/drivers', { method: 'POST', body: formData(e.target) });
    e.target.reset();
    await loadDrivers();
  }, 'Conductor añadido');
});

$('#vehicle-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = formData(e.target);
  run(async () => {
    await api('/vehicles', { method: 'POST', body: { ...data, seats: Number(data.seats) } });
    e.target.reset();
    await loadVehicles();
  }, 'Vehículo añadido');
});

// ---------- traslados ----------

function transferQuery() {
  const params = new URLSearchParams();
  const status = $('#status-filter').value;
  const day = $('#date-filter').value;
  if (status) params.set('status', status);
  if (day) {
    // Día local completo convertido a UTC.
    const from = new Date(`${day}T00:00`);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    params.set('from', from.toISOString());
    params.set('to', to.toISOString());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function assignmentText(t) {
  if (!t.driverId) return el('span', { className: 'muted' }, '—');
  const driver = state.drivers.find((d) => d.id === t.driverId);
  const vehicle = state.vehicles.find((v) => v.id === t.vehicleId);
  return `${driver?.name ?? `#${t.driverId}`} · ${vehicle?.plate ?? `#${t.vehicleId}`}`;
}

function transferActions(t) {
  const setStatus = (status, label, message) =>
    el('button', {
      onclick: () => run(async () => {
        await api(`/transfers/${t.id}/status`, { method: 'POST', body: { status } });
        await loadTransfers();
      }, message),
    }, label);

  const buttons = [];
  if (t.status === 'pending' || t.status === 'assigned') {
    buttons.push(el('button', { onclick: () => openAssign(t) }, t.status === 'pending' ? 'Asignar' : 'Reasignar'));
  }
  if (t.status === 'assigned') {
    buttons.push(setStatus('in_progress', 'Iniciar', 'Traslado iniciado'));
    buttons.push(setStatus('pending', 'Desasignar', 'Traslado desasignado'));
  }
  if (t.status === 'in_progress') buttons.push(setStatus('completed', 'Completar', 'Traslado completado'));
  if (t.status === 'pending' || t.status === 'assigned') {
    buttons.push(el('button', {
      className: 'danger',
      onclick: () => {
        if (!confirm(`¿Cancelar el traslado #${t.id}?`)) return;
        run(async () => {
          await api(`/transfers/${t.id}/status`, { method: 'POST', body: { status: 'cancelled' } });
          await loadTransfers();
        }, 'Traslado cancelado');
      },
    }, 'Cancelar'));
  }
  if (t.status === 'cancelled') buttons.push(deleteButton(`/transfers/${t.id}`, `el traslado #${t.id}`, loadTransfers));
  return el('div', { className: 'row-actions' }, buttons);
}

async function loadTransfers() {
  const transfers = await api(`/transfers${transferQuery()}`);
  const rows = transfers.map((t) =>
    el('tr', {},
      el('td', { className: 'num' }, t.id),
      el('td', { className: 'num' }, dateFmt.format(new Date(t.pickupAt)), el('div', { className: 'muted' }, `${t.durationMinutes} min`)),
      el('td', {}, t.customerName, el('div', { className: 'muted' }, t.customerPhone)),
      el('td', {}, `${t.pickupLocation} → ${t.dropoffLocation}`, t.notes && el('div', { className: 'muted' }, t.notes)),
      el('td', { className: 'num' }, t.passengers),
      el('td', { className: 'num' }, money.format(t.priceCents / 100)),
      el('td', {}, el('span', { className: `badge ${t.status}` }, STATUS_LABELS[t.status])),
      el('td', {}, assignmentText(t)),
      el('td', {}, transferActions(t)),
    ),
  );
  $('#transfer-rows').replaceChildren(
    ...(rows.length ? rows : [el('tr', {}, el('td', { colspan: '9', className: 'muted' }, 'No hay traslados'))]),
  );
}

$('#transfer-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const body = {
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    customerEmail: d.customerEmail || null,
    pickupLocation: d.pickupLocation,
    dropoffLocation: d.dropoffLocation,
    pickupAt: new Date(d.pickupAt).toISOString(),
    durationMinutes: Number(d.durationMinutes),
    passengers: Number(d.passengers),
    priceCents: Math.round(Number(d.price) * 100),
    notes: d.notes || null,
  };
  run(async () => {
    await api('/transfers', { method: 'POST', body });
    e.target.reset();
    await loadTransfers();
  }, 'Traslado creado');
});

$('#status-filter').addEventListener('change', () => run(loadTransfers));
$('#date-filter').addEventListener('change', () => run(loadTransfers));

// ---------- diálogo de asignación ----------

let assigning = null;

function openAssign(t) {
  assigning = t;
  $('#assign-id').textContent = `#${t.id}`;
  const form = $('#assign-form');
  const options = (items, label, selected) =>
    items.filter((i) => i.active).map((i) => {
      const opt = el('option', { value: String(i.id) }, label(i));
      if (i.id === selected) opt.selected = true;
      return opt;
    });
  form.driverId.replaceChildren(...options(state.drivers, (d) => d.name, t.driverId));
  form.vehicleId.replaceChildren(
    ...options(state.vehicles.filter((v) => v.seats >= t.passengers), (v) => `${v.plate} · ${v.model} (${v.seats} plazas)`, t.vehicleId),
  );
  $('#assign-dialog').showModal();
}

$('#assign-dialog').addEventListener('close', () => {
  const dialog = $('#assign-dialog');
  if (dialog.returnValue !== 'confirm' || !assigning) return;
  const form = $('#assign-form');
  const body = { driverId: Number(form.driverId.value), vehicleId: Number(form.vehicleId.value) };
  const id = assigning.id;
  assigning = null;
  run(async () => {
    await api(`/transfers/${id}/assign`, { method: 'POST', body });
    await loadTransfers();
  }, 'Traslado asignado');
});

// ---------- arranque ----------

run(async () => {
  await Promise.all([loadDrivers(), loadVehicles()]);
  await loadTransfers();
});
