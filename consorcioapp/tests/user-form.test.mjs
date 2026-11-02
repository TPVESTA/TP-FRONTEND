import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { loadComponent, render, fireEvent, cleanup } from './helpers/components.mjs';

const globalPermissions = [{ rolId: 1, rolCodigo: 'SUPERADMIN', ambito: 'GLOBAL', edificioIds: [], permisos: [] }];
const roles = [
  { id: 11, nombre: 'Propietario', descripcion: 'Propietario', codigo: 'PROPIETARIO', ambito: 'PROPIEDAD', permisos: [] },
  { id: 12, nombre: 'Residente', descripcion: 'Residente', codigo: 'RESIDENTE', ambito: 'PROPIEDAD', permisos: [] },
  { id: 13, nombre: 'Administrativo', descripcion: 'Administrativo', codigo: 'ADMINISTRATIVO', ambito: 'ADMINISTRACION', permisos: [] },
  { id: 14, nombre: 'Global', descripcion: 'Global', codigo: null, ambito: 'GLOBAL', permisos: [] },
];
const buildings = [{ id: 10, nombre: 'Edificio Centro' }, { id: 20, nombre: 'Edificio Parque' }, { id: 30, nombre: 'Sin propiedades' }];
const properties = [
  { id: 101, nroUnidad: '1A', edificio: 10 },
  { id: 102, nroUnidad: '2B', edificio: { id: 10 } },
  { id: 201, nroUnidad: '1A', edificio: { id: 20 } },
  { id: 999, nroUnidad: 'Referencia incompleta', edificio: 999 },
];
const success = data => Response.json({ success: true, data });
async function setup({ permissions = globalPermissions, handler, user } = {}) {
  const requests = [], saved = mock.fn();
  window.sessionStorage.setItem('consorcio.token', 'test-token');
  mock.method(globalThis, 'fetch', async (url, options) => {
    const request = { url, ...options, method: options.method ?? 'GET' };
    requests.push(request);
    if (handler) {
      const response = handler(request);
      if (response) return response;
    }
    if (url === '/api/roles') return success(roles);
    if (url === '/api/propiedades') return success(properties);
    if (url === '/api/edificios') return success(buildings);
    if (url === '/api/administraciones') return success([{ id: 50, nombre: 'Administración Centro' }]);
    if (url === '/api/users' && request.method === 'POST') return success({ id: 77 });
    assert.fail('Petición inesperada: ' + request.method + ' ' + url);
  });
  const Component = loadComponent('components/user-form.tsx', { './backoffice-shell': { usePermissions: () => permissions } });
  const view = render(React.createElement(Component, { user, currentUserId: 1, onClose: () => {}, onSaved: saved }));
  if (!user) await act(async () => {});
  return { view, requests, saved };
}
function choose(view, label, value) { fireEvent.change(view.getByLabelText(label), { target: { value } }); }
function fillPerson(view) {
  const values = { nombre: 'Nueva', apellido: 'Persona', email: 'nuevo@example.test', telefono: '3415551234', cuil: '20123456789',
    fechaNacimiento: '2000-01-01', password: 'ROOT123', confirmPassword: 'ROOT123' };
  for (const [name, value] of Object.entries(values)) fireEvent.change(view.container.querySelector(`[name="${name}"]`), { target: { value } });
}
async function submit(view) { await act(async () => { fireEvent.submit(view.container.querySelector('form')); }); }
const optionIds = select => [...select.options].map(option => option.value);
afterEach(() => { cleanup(); mock.restoreAll(); window.sessionStorage.clear(); });

test('el alta selecciona primero edificio y muestra solamente sus propiedades, con relaciones por ID u objeto', async () => {
  const { view, requests } = await setup();
  choose(view, 'Rol', '11');
  const building = view.getByLabelText('Edificio');
  const property = view.getByLabelText('Propiedad');
  assert.deepEqual(optionIds(building), ['', '10', '20']);
  assert.equal(building.options[1].textContent, 'Edificio Centro');
  assert.equal(property.disabled, true);
  assert.deepEqual(optionIds(property), ['']);
  choose(view, 'Edificio', '10');
  assert.equal(property.disabled, false);
  assert.deepEqual(optionIds(property), ['', '101', '102']);
  assert.equal(property.options[1].textContent, 'Unidad 1A');
  assert.equal(requests.filter(request => request.url === '/api/edificios').length, 1);
});

test('cambiar de edificio limpia la propiedad y no conserva una unidad del edificio anterior', async () => {
  const { view } = await setup();
  choose(view, 'Rol', '11'); choose(view, 'Edificio', '10'); choose(view, 'Propiedad', '101');
  choose(view, 'Edificio', '20');
  const property = view.getByLabelText('Propiedad');
  assert.equal(property.value, '');
  assert.deepEqual(optionIds(property), ['', '201']);
  choose(view, 'Edificio', '');
  assert.equal(property.disabled, true);
  assert.deepEqual(optionIds(property), ['']);
});

test('cambiar de rol reinicia edificio y propiedad, y conserva los flujos global y de administración', async () => {
  const { view } = await setup();
  choose(view, 'Rol', '11'); choose(view, 'Edificio', '10'); choose(view, 'Propiedad', '101');
  choose(view, 'Rol', '12');
  assert.equal(view.getByLabelText('Edificio').value, '');
  assert.equal(view.getByLabelText('Propiedad').value, '');
  assert.equal(view.getByLabelText('Propiedad').disabled, true);
  choose(view, 'Rol', '13');
  assert.equal(view.queryByLabelText('Edificio'), null);
  assert.equal(view.queryByLabelText('Propiedad'), null);
  assert.equal(view.getByLabelText('Administración').value, '50');
  choose(view, 'Rol', '14');
  assert.equal(view.queryByLabelText('Administración'), null);
  assert.equal(view.queryByLabelText('Edificio'), null);
});

test('un administrativo solo puede elegir edificios y propiedades dentro de su ámbito de asignación', async () => {
  const permissions = [{ rolId: 2, rolCodigo: 'ADMINISTRATIVO', ambito: 'ADMINISTRACION', administracionId: 50,
    edificioIds: [10], permisos: [
      { seccion: 'ASIGNACIONES', crear: false, leer: true, editar: false, borrar: false, acciones: ['ASIGNAR'] },
      { seccion: 'USUARIOS', crear: true, leer: true, editar: true, borrar: false, acciones: [] },
    ] }];
  const { view } = await setup({ permissions });
  choose(view, 'Rol', '11');
  assert.deepEqual(optionIds(view.getByLabelText('Edificio')), ['', '10']);
  // Con un único edificio disponible queda elegido y la propiedad ya se puede seleccionar.
  assert.equal(view.getByLabelText('Edificio').value, '10');
  assert.equal(view.getByLabelText('Propiedad').disabled, false);
  assert.deepEqual(optionIds(view.getByLabelText('Propiedad')), ['', '101', '102']);
});

test('guardar envía rol y propiedad del edificio elegido, sin agregar edificioId al contrato de alta', async () => {
  const { view, requests, saved } = await setup();
  fillPerson(view);
  choose(view, 'Rol', '12'); choose(view, 'Edificio', '20'); choose(view, 'Propiedad', '201');
  await submit(view);
  assert.equal(view.queryByRole('alert'), null);
  const request = requests.find(request => request.method === 'POST');
  assert.ok(request);
  const body = JSON.parse(request.body);
  assert.equal(body.rolId, 12);
  assert.equal(body.propiedadId, 201);
  assert.equal(Object.hasOwn(body, 'edificioId'), false);
  assert.equal(saved.mock.calls.length, 1);
});

test('no guarda sin edificio o propiedad, ni una propiedad de otro edificio agregada al HTML', async () => {
  const { view, requests } = await setup();
  fillPerson(view);
  choose(view, 'Rol', '11');
  await submit(view);
  assert.match(view.getByRole('alert').textContent, /edificio disponible/);
  choose(view, 'Edificio', '10');
  await submit(view);
  assert.match(view.getByRole('alert').textContent, /propiedad del edificio/);
  const property = view.getByLabelText('Propiedad');
  const injected = document.createElement('option');
  injected.value = '201'; injected.textContent = 'Otra propiedad'; property.append(injected);
  choose(view, 'Propiedad', '201');
  await submit(view);
  assert.match(view.getByRole('alert').textContent, /propiedad del edificio/);
  assert.equal(requests.some(request => request.method === 'POST'), false);
});

test('un error al cargar edificios se informa y permite reintentar sin perder los datos personales', async () => {
  let attempts = 0;
  const { view } = await setup({ handler: request => request.url === '/api/edificios' && ++attempts === 1
    ? Response.json({ success: false }, { status: 500 }) : null });
  assert.match(view.getByRole('alert').textContent, /Edificios/);
  fillPerson(view);
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Actualizar opciones' })); });
  assert.equal(view.queryByRole('alert'), null);
  assert.equal(view.getByLabelText('Nombre').value, 'Nueva');
  choose(view, 'Rol', '11');
  assert.deepEqual(optionIds(view.getByLabelText('Edificio')), ['', '10', '20']);
});

test('editar un usuario existente no carga catálogos ni muestra el selector de edificio y propiedad', async () => {
  const user = { id: 3, nombre: 'Ana', apellido: 'Pérez', email: 'ana@example.test', cuil: '20123456789',
    fechaNacimiento: '1990-01-01', estado: true };
  const { view, requests } = await setup({ user });
  assert.equal(view.getByLabelText('Nombre').value, 'Ana');
  assert.equal(view.queryByLabelText('Rol'), null);
  assert.equal(view.queryByLabelText('Edificio'), null);
  assert.equal(view.queryByLabelText('Propiedad'), null);
  assert.equal(requests.length, 0);
});
