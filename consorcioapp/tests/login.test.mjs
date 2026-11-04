import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { loadComponent, render, fireEvent, cleanup } from './helpers/components.mjs';

// Pantalla de ingreso real; solo se reemplaza el router de Next.
const user = { id: 1, nombre: 'Ana', apellido: 'Pérez', email: 'ana@example.test', telefono: '3415551234', fechaNacimiento: '1990-01-01', estado: true };
const superadmin = { rolId: 1, rolCodigo: 'SUPERADMIN', ambito: 'GLOBAL', edificioIds: [], permisos: [] };
const resident = { rolId: 2, rolCodigo: 'RESIDENTE', ambito: 'PROPIEDAD', propiedadId: 100, edificioIds: [10], permisos: [
  { seccion: 'RESERVAS', crear: true, leer: true, editar: true, borrar: false, acciones: ['DISPONIBILIDAD'] },
] };
const success = data => Response.json({ success: true, data });
afterEach(() => { cleanup(); mock.restoreAll(); window.sessionStorage.clear(); });

async function signIn(permissions) {
  const router = { replace: mock.fn() };
  mock.method(globalThis, 'fetch', async url => {
    if (url === '/api/auth/login') return success({ token: 'test-token', user });
    if (url === '/api/auth/permisos') return permissions ? success({ usuarioId: 1, contextos: permissions }) : Response.json({ success: false }, { status: 500 });
    assert.fail('Petición inesperada: ' + url);
  });
  const Home = loadComponent('app/page.tsx', { 'next/navigation': { useRouter: () => router } });
  const view = render(React.createElement(Home));
  await view.findByRole('button', { name: 'Ingresar' });
  fireEvent.change(view.container.querySelector('[name="email"]'), { target: { value: 'ana@example.test' } });
  fireEvent.change(view.container.querySelector('[name="password"]'), { target: { value: 'ROOT123' } });
  await act(async () => { fireEvent.submit(view.container.querySelector('form')); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return { view, router };
}

const administrative = { rolId: 3, rolCodigo: 'ADMINISTRATIVO', ambito: 'ADMINISTRACION', administracionId: 20, edificioIds: [10], permisos: [] };
for (const [name, permissions, destination] of [
  ['el sysadmin entra al backoffice', [superadmin], '/backoffice'],
  ['un empleado de administración entra al backoffice', [administrative], '/backoffice'],
  ['un empleado que además es residente entra al backoffice', [resident, administrative], '/backoffice'],
  ['un residente entra a Mi consorcio aunque pueda ver parte del backoffice', [resident], '/mi-consorcio'],
  ['sin roles de negocio entra a Mi consorcio', [], '/mi-consorcio'],
  ['si no se pueden consultar los permisos, entra a Mi consorcio', null, '/mi-consorcio'],
]) {
  test(name, async () => {
    const { view, router } = await signIn(permissions);
    assert.deepEqual(router.replace.mock.calls.map(call => call.arguments[0]), [destination]);
    assert.equal(window.sessionStorage.getItem('consorcio.token'), 'test-token');
    // Sin el estado intermedio "Hola, …": solo se informa que está ingresando.
    assert.ok(view.getByRole('status').textContent.includes('Ingresando'));
    assert.equal(view.queryByText(/Hola,/), null);
  });
}
