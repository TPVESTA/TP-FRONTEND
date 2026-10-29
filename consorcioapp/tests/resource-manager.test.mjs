import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { loadComponent, render, fireEvent, within, cleanup } from './helpers/components.mjs';

// Se renderiza el componente real con React y DOM. Solo se reemplaza el contexto
// de sesión de Next; la API, los formularios y los permisos son los del proyecto.
function resourceManager(permissions) {
  const shell = { useCurrentUser: () => ({ id: 1 }), usePermissions: () => permissions };
  return loadComponent('components/resource-manager.tsx', { './backoffice-shell': shell });
}

const superadmin = [{ rolId: 1, rolCodigo: 'SUPERADMIN', ambito: 'GLOBAL', edificioIds: [], permisos: [] }];
const oldLocality = { id: 1, nombre: 'Nombre del listado', provincia: 'Santa Fe' };
const freshLocality = { id: 1, nombre: 'Nombre actualizado', provincia: 'Buenos Aires' };
const success = data => Response.json({ success: true, data });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function setup({ rows = [oldLocality], permissions = superadmin, resource = 'localidades', personal = false, handler } = {}) {
  const requests = [];
  window.sessionStorage.setItem('consorcio.token', 'test-token');
  mock.method(globalThis, 'fetch', async (url, options) => {
    const request = { url, ...options, method: options.method ?? 'GET' };
    requests.push(request);
    if (url === `/api/${resource}` && request.method === 'GET') return success(rows);
    return handler(request);
  });
  const Component = resourceManager(permissions);
  const view = render(React.createElement(Component, { resource, personal }));
  await view.findByRole('button', { name: 'Actualizar' });
  await view.findAllByRole('button', { name: /^Ver/ });
  return { view, requests, Component };
}
afterEach(() => { cleanup(); mock.restoreAll(); window.sessionStorage.clear(); });

test('Ver / editar hace GET por ID, espera el detalle y guarda los valores actualizados', async () => {
  const pending = deferred();
  const { view, requests } = await setup({ handler: request => {
    assert.equal(request.url, '/api/localidades/1');
    return request.method === 'PUT' ? success(request.body) : pending.promise;
  } });
  fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
  const dialog = within(view.getByRole('dialog'));
  assert.match(dialog.getByRole('status').textContent, /Consultando detalle/);
  assert.equal(dialog.queryByLabelText('Nombre'), null);
  assert.equal(dialog.queryByRole('button', { name: 'Guardar cambios' }), null);
  const detail = requests.find(request => request.url.endsWith('/1'));
  assert.equal(detail.method, 'GET');
  assert.equal(detail.cache, 'no-store');
  assert.equal(detail.headers.get('Authorization'), 'Bearer test-token');
  await act(async () => { pending.resolve(success(freshLocality)); });
  assert.equal(dialog.getByLabelText('Nombre').value, freshLocality.nombre);
  assert.equal(dialog.getByLabelText('Provincia').value, freshLocality.provincia);
  await act(async () => { fireEvent.submit(dialog.getByRole('button', { name: 'Guardar cambios' }).closest('form')); });
  const saved = requests.find(request => request.method === 'PUT');
  assert.deepEqual(JSON.parse(saved.body), { nombre: freshLocality.nombre, provincia: freshLocality.provincia });
});

for (const status of [403, 404, 500]) {
  test(`error ${status}: no muestra el objeto viejo y permite reintentar la consulta`, async () => {
    let attempts = 0;
    const { view, requests } = await setup({ handler: () => ++attempts === 1
      ? Response.json({ success: false }, { status }) : success(freshLocality) });
    fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
    const dialog = within(view.getByRole('dialog'));
    const error = await dialog.findByRole('alert');
    assert.match(error.textContent, status === 403 ? /permiso/ : status === 404 ? /disponible/ : /servidor/);
    assert.equal(dialog.queryByLabelText('Nombre'), null);
    assert.equal(dialog.queryByRole('button', { name: 'Guardar cambios' }), null);
    fireEvent.click(dialog.getByRole('button', { name: 'Reintentar consulta' }));
    assert.equal((await dialog.findByLabelText('Nombre')).value, freshLocality.nombre);
    assert.equal(requests.filter(request => request.url === '/api/localidades/1').length, 2);
  });
}

test('cerrar durante la carga cancela la petición y una respuesta tardía no reabre el modal', async () => {
  const pending = deferred();
  const { view, requests } = await setup({ handler: () => pending.promise });
  fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
  const request = requests.find(request => request.url.endsWith('/1'));
  fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));
  assert.equal(request.signal.aborted, true);
  await act(async () => { pending.resolve(success(freshLocality)); });
  assert.equal(view.queryByRole('dialog'), null);
  assert.equal(view.queryByText(freshLocality.nombre), null);
});

test('reabrir consulta otra vez y descarta respuestas de la apertura anterior', async () => {
  const first = deferred(), second = deferred();
  let attempts = 0;
  const { view } = await setup({ handler: () => ++attempts === 1 ? first.promise : second.promise });
  fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
  fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: 'Volver' }));
  fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
  await act(async () => { second.resolve(success(freshLocality)); });
  await act(async () => { first.resolve(success({ ...oldLocality, nombre: 'Respuesta vieja tardía' })); });
  assert.equal(within(view.getByRole('dialog')).getByLabelText('Nombre').value, freshLocality.nombre);
  assert.equal(attempts, 2);
});

test('salir de la pantalla cancela la consulta de detalle pendiente', async () => {
  const pending = deferred();
  const { view, requests } = await setup({ handler: () => pending.promise });
  fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
  const request = requests.find(request => request.url.endsWith('/1'));
  view.unmount();
  assert.equal(request.signal.aborted, true);
  await act(async () => { pending.resolve(success(freshLocality)); });
});

test('Ver obtiene el detalle actualizado para un perfil de solo lectura', async () => {
  const permissions = [{ ...superadmin[0], rolCodigo: null, permisos: [{
    seccion: 'CATALOGOS', crear: false, leer: true, editar: false, borrar: false, acciones: [],
  }] }];
  const { view } = await setup({ permissions, handler: () => success(freshLocality) });
  fireEvent.click(view.getByRole('button', { name: 'Ver' }));
  const dialog = within(view.getByRole('dialog'));
  assert.equal((await dialog.findByLabelText('Nombre')).value, freshLocality.nombre);
  assert.equal(dialog.getByLabelText('Nombre').closest('fieldset').disabled, true);
  assert.equal(dialog.queryByRole('button', { name: 'Guardar cambios' }), null);
});

test('Agregar abre un formulario nuevo y no consulta un detalle', async () => {
  const { view, requests } = await setup({ handler: () => assert.fail('No debe consultar detalles al crear') });
  fireEvent.click(view.getByRole('button', { name: '+ Agregar localidad' }));
  assert.equal(within(view.getByRole('dialog')).getByLabelText('Nombre').value, '');
  assert.deepEqual(requests.map(request => request.url), ['/api/localidades']);
});

test('una respuesta de detalle inválida no habilita un formulario con datos del listado', async () => {
  for (const data of [null, [], { ...freshLocality, id: 99 }]) {
    const { view } = await setup({ handler: () => success(data) });
    fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
    const dialog = within(view.getByRole('dialog'));
    assert.match((await dialog.findByRole('alert')).textContent, /detalle válido/);
    assert.equal(dialog.queryByLabelText('Nombre'), null);
    view.unmount();
  }
});

for (const state of ['Reservado', 'Cancelado']) {
test(`reservas usa fecha, área y estado del detalle (${state}) y recalcula la edición`, async () => {
  const area = id => ({ id, descripcion: `SUM ${id}`, edificio: { id: 10 } });
  const listed = { id: 10, descripcion: 'Descripción vieja', fechaReservacion: '2099-10-06T15:00:00Z',
    estado: 'Reservado', usuario: { id: 1 }, propiedadOrigen: null, areaComun: area(200) };
  const fresh = { ...listed, descripcion: 'Descripción actualizada', fechaReservacion: '2099-10-08T15:00:00Z',
    estado: state, areaComun: area(201) };
  const { view, requests } = await setup({ resource: 'reservaciones', rows: [listed], handler: request => {
    if (request.url === '/api/reservaciones/10') return success(fresh);
    if (request.url === '/api/areas-comunes') return success([area(200), area(201)]);
    if (request.url === '/api/propiedades' || request.url.startsWith('/api/reservaciones/disponibilidad?')) return success([]);
    assert.fail('Consulta inesperada: ' + request.url);
  } });
  fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
  const dialog = within(view.getByRole('dialog'));
  assert.equal((await dialog.findByLabelText('Descripción')).value, fresh.descripcion);
  assert.equal(dialog.getByLabelText('Día de la reserva').value, state === 'Reservado' ? '2099-10-08' : '08/10/2099');
  assert.equal(dialog.getByLabelText('Área común').value, state === 'Reservado' ? '201' : 'SUM 201');
  assert.equal(dialog.getByLabelText('Estado').value, state);
  assert.equal(!!dialog.queryByRole('button', { name: 'Guardar cambios' }), state === 'Reservado');
  assert.ok(requests.some(request => request.url === '/api/reservaciones/disponibilidad?areaComunId=201'));
});
}

const commonArea = { id: 200, descripcion: 'SUM del edificio', edificio: { id: 10 } };
const reservationRows = [
  { id: 21, fechaReservacion: '2099-11-01T02:59:59Z', descripcion: 'Reserva anterior' },
  { id: 22, fechaReservacion: '2099-11-01T03:00:00Z', descripcion: 'Cocina al inicio' },
  { id: 23, fechaReservacion: '2099-11-03T02:59:59Z', descripcion: 'Parrilla al final' },
  { id: 24, fechaReservacion: '2099-11-03T03:00:00Z', descripcion: 'Reserva posterior' },
].map(row => ({ ...row, estado: 'Reservado', usuario: { id: 1, nombre: 'Ana', apellido: 'Pérez' }, areaComun: commonArea }));
const incidence = (id, usuario, descripcion) => ({
  id, usuario, descripcion, estado: 'Reportado', unidad: commonArea, propiedadOrigen: { id: 100 },
});
async function setupBusiness(options) {
  return setup({ ...options, handler: request => {
    if (['/api/areas-comunes', '/api/unidades'].includes(request.url)) return success([commonArea]);
    if (request.url === '/api/propiedades') return success([]);
    if (request.url.startsWith('/api/reservaciones/disponibilidad?')) return success([]);
    if (options.handler) return options.handler(request);
    assert.fail('Consulta inesperada: ' + request.url);
  } });
}
function expectRows(view, included, excluded = []) {
  for (const description of included) assert.ok(view.queryByText(description), `Debe mostrar: ${description}`);
  for (const description of excluded) assert.equal(view.queryByText(description), null, `Debe ocultar: ${description}`);
}

test('reservas filtra por rango inclusivo usando el día de Buenos Aires en los límites UTC', async () => {
  const { view } = await setupBusiness({ resource: 'reservaciones', rows: reservationRows });
  fireEvent.change(view.getByLabelText('Desde'), { target: { value: '2099-11-01' } });
  fireEvent.change(view.getByLabelText('Hasta'), { target: { value: '2099-11-02' } });
  expectRows(view, ['Cocina al inicio', 'Parrilla al final'], ['Reserva anterior', 'Reserva posterior']);
  assert.ok(view.getByText('Mostrando 2 de 4 reservas.'));
  fireEvent.click(view.getByRole('button', { name: 'Limpiar filtros' }));
  expectRows(view, reservationRows.map(row => row.descripcion));
  assert.equal(view.getByLabelText('Desde').value, '');
  assert.equal(view.getByLabelText('Hasta').value, '');
});

for (const bound of ['Desde', 'Hasta']) {
  test(`reservas permite filtrar solamente por ${bound.toLowerCase()}`, async () => {
    const { view } = await setupBusiness({ resource: 'reservaciones', rows: reservationRows });
    fireEvent.change(view.getByLabelText(bound), { target: { value: '2099-11-02' } });
    expectRows(view, bound === 'Desde' ? ['Parrilla al final', 'Reserva posterior'] : ['Reserva anterior', 'Cocina al inicio', 'Parrilla al final'],
      bound === 'Desde' ? ['Reserva anterior', 'Cocina al inicio'] : ['Reserva posterior']);
  });
}

test('un rango invertido informa el error y permite corregirlo o limpiar los filtros', async () => {
  const { view } = await setupBusiness({ resource: 'reservaciones', rows: reservationRows });
  fireEvent.change(view.getByLabelText('Desde'), { target: { value: '2099-11-03' } });
  fireEvent.change(view.getByLabelText('Hasta'), { target: { value: '2099-11-01' } });
  assert.match(view.getByRole('alert').textContent, /no puede ser posterior/);
  assert.equal(view.getByLabelText('Desde').getAttribute('aria-invalid'), 'true');
  assert.equal(view.queryByRole('table'), null);
  fireEvent.change(view.getByLabelText('Hasta'), { target: { value: '2099-11-03' } });
  assert.equal(view.queryByRole('alert'), null);
  expectRows(view, ['Reserva posterior'], ['Cocina al inicio', 'Parrilla al final']);
  fireEvent.click(view.getByRole('button', { name: 'Limpiar filtros' }));
  expectRows(view, reservationRows.map(row => row.descripcion));
});

test('el rango y la búsqueda se combinan; seleccionar un resultado sigue consultando su detalle', async () => {
  const { view, requests } = await setupBusiness({ resource: 'reservaciones', rows: reservationRows,
    handler: request => {
      assert.equal(request.url, '/api/reservaciones/22');
      return success(reservationRows[1]);
    } });
  fireEvent.change(view.getByLabelText('Desde'), { target: { value: '2099-11-01' } });
  fireEvent.change(view.getByLabelText('Hasta'), { target: { value: '2099-11-02' } });
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'COCINA' } });
  expectRows(view, ['Cocina al inicio'], ['Reserva anterior', 'Parrilla al final', 'Reserva posterior']);
  fireEvent.click(view.getByRole('button', { name: 'Ver / editar' }));
  assert.equal((await within(view.getByRole('dialog')).findByLabelText('Descripción')).value, 'Cocina al inicio');
  assert.ok(requests.some(request => request.url === '/api/reservaciones/22' && request.method === 'GET'));
  fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: 'Volver' }));
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Sin coincidencia' } });
  assert.ok(view.getByText('No hay coincidencias.'));
  fireEvent.click(view.getByRole('button', { name: 'Limpiar filtros' }));
  assert.equal(view.getByRole('searchbox').value, '');
  expectRows(view, reservationRows.map(row => row.descripcion));
});

test('incidencias filtra por ID de usuario, diferencia homónimos y combina búsqueda y limpieza', async () => {
  const ana = { id: 1, nombre: 'Ana', apellido: 'Pérez' };
  const rows = [incidence(31, ana, 'Pérdida de agua'), incidence(32, { id: 2, nombre: 'Beto', apellido: 'Gómez' }, 'Luz rota'),
    incidence(33, ana, 'Puerta trabada'), incidence(34, { ...ana, id: 3 }, 'Ascensor detenido')];
  const { view, requests } = await setupBusiness({ resource: 'incidencias', rows });
  const select = view.getByLabelText('Usuario');
  assert.equal(select.options.length, 4, 'Una opción por autor más Todos, sin duplicar a Ana');
  assert.equal(select.querySelector('option[value="1"]').textContent, 'Ana Pérez (usuario 1)');
  assert.equal(select.querySelector('option[value="3"]').textContent, 'Ana Pérez (usuario 3)');
  fireEvent.change(select, { target: { value: '1' } });
  expectRows(view, ['Pérdida de agua', 'Puerta trabada'], ['Luz rota', 'Ascensor detenido']);
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Puerta' } });
  expectRows(view, ['Puerta trabada'], ['Pérdida de agua', 'Luz rota', 'Ascensor detenido']);
  fireEvent.click(view.getByRole('button', { name: 'Limpiar filtros' }));
  assert.equal(select.value, '');
  assert.equal(view.getByRole('searchbox').value, '');
  expectRows(view, rows.map(row => row.descripcion));
  assert.equal(requests.some(request => request.url === '/api/users'), false);
});

test('Mis incidencias no ofrece autores ajenos ni necesita permiso de gestión de usuarios', async () => {
  const permissions = [{ rolId: 1, rolCodigo: null, ambito: 'PROPIEDAD', propiedadId: 100, edificioIds: [10], permisos: [{
    seccion: 'INCIDENCIAS', crear: false, leer: true, editar: false, borrar: false, acciones: [],
  }] }];
  const rows = [incidence(31, { id: 1, nombre: 'Ana', apellido: 'Pérez' }, 'Incidencia propia'),
    incidence(32, { id: 2, nombre: 'Persona', apellido: 'Ajena' }, 'Incidencia ajena')];
  const { view, requests } = await setupBusiness({ resource: 'incidencias', personal: true, permissions, rows });
  const select = view.getByLabelText('Usuario');
  assert.deepEqual([...select.options].map(option => option.value), ['', '1']);
  expectRows(view, ['Incidencia propia'], ['Incidencia ajena']);
  assert.equal(view.queryByText('Persona Ajena'), null);
  assert.deepEqual(requests.map(request => request.url), ['/api/incidencias']);
});

test('el filtro de usuario admite relaciones como ID u objeto y reutiliza el nombre disponible', async () => {
  const rows = [incidence(31, 7, 'Referencia por ID'),
    incidence(32, { id: 7, nombre: 'Laura', apellido: 'López' }, 'Referencia por objeto'),
    incidence(33, { id: 8 }, 'Autor sin nombre')];
  const { view } = await setupBusiness({ resource: 'incidencias', rows });
  const select = view.getByLabelText('Usuario');
  assert.equal(select.querySelector('option[value="7"]').textContent, 'Laura López');
  assert.equal(select.querySelector('option[value="8"]').textContent, 'Usuario 8');
  fireEvent.change(select, { target: { value: '7' } });
  expectRows(view, ['Referencia por ID', 'Referencia por objeto'], ['Autor sin nombre']);
});

test('actualizar conserva el filtro de usuario y permite limpiarlo si ya no quedan incidencias de ese autor', async () => {
  const rows = [incidence(31, { id: 1, nombre: 'Ana' }, 'Incidencia de Ana'),
    incidence(32, { id: 2, nombre: 'Beto' }, 'Incidencia de Beto')];
  const { view } = await setupBusiness({ resource: 'incidencias', rows });
  fireEvent.change(view.getByLabelText('Usuario'), { target: { value: '2' } });
  rows.splice(1, 1);
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Actualizar' })); });
  assert.equal(view.getByLabelText('Usuario').value, '2');
  assert.ok(view.getByText('No hay coincidencias.'));
  fireEvent.click(view.getByRole('button', { name: 'Limpiar filtros' }));
  expectRows(view, ['Incidencia de Ana'], ['Incidencia de Beto']);
});
