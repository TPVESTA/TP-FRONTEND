import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { loadModule, render, cleanup } from './helpers/components.mjs';

// Shell real con React y DOM; solo se reemplazan el router y Link de Next.
const router = { replace: mock.fn() };
let pathname = '/backoffice';
const navigation = { useRouter: () => router, usePathname: () => pathname };
const link = { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) };
const user = { id: 1, nombre: 'Ana', apellido: 'Pérez', email: 'ana@example.test', telefono: '3415551234', fechaNacimiento: '1990-01-01', estado: true };
const superadmin = { rolId: 1, rolCodigo: 'SUPERADMIN', ambito: 'GLOBAL', edificioIds: [], permisos: [] };
const resident = { rolId: 2, rolCodigo: 'RESIDENTE', ambito: 'PROPIEDAD', propiedadId: 100, edificioIds: [10], permisos: [
  { seccion: 'RESERVAS', crear: true, leer: true, editar: true, borrar: false, acciones: ['DISPONIBILIDAD'] },
] };
const success = data => Response.json({ success: true, data });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
afterEach(() => { cleanup(); mock.restoreAll(); window.sessionStorage.clear(); pathname = '/backoffice'; });

function setup({ profileFailures = 0 } = {}) {
  let grants = [superadmin];
  const requests = [];
  window.sessionStorage.setItem('consorcio.token', 'test-token');
  mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    if (url === '/api/auth/profile' && profileFailures-- > 0) return Response.json({ success: false, error: 'Base no disponible' }, { status: 500 });
    if (url === '/api/auth/profile') return success(user);
    // Cada consulta devuelve objetos nuevos, como una respuesta real del servidor.
    if (url === '/api/auth/permisos') return success({ usuarioId: 1, contextos: structuredClone(grants) });
    assert.fail('Petición inesperada: ' + url);
  });
  const { default: Shell, usePermissions } = loadModule('components/backoffice-shell.tsx', { 'next/navigation': navigation, 'next/link': link });
  // Registra cada vez que el contenido recibe un array de permisos distinto, como lo hacen
  // los componentes que recargan sus datos cuando cambian los permisos.
  const received = [];
  function Page() {
    const permissions = usePermissions();
    React.useEffect(() => { received.push(permissions); }, [permissions]);
    return React.createElement('p', null, 'Contenido de la página');
  }
  const page = () => React.createElement(Shell, null, React.createElement(Page));
  const view = render(page());
  // Simula una navegación: Next cambia la ruta y vuelve a renderizar el layout con el mismo shell.
  const navigate = async next => { pathname = next; await act(async () => { view.rerender(page()); }); };
  return { view, requests, received, navigate, setGrants: next => { grants = next; } };
}
const focusWindow = () => act(async () => { window.dispatchEvent(new Event('focus')); });

test('volver a la pestaña con los mismos permisos no notifica a la página', async () => {
  const { view, requests, received } = setup();
  await view.findByText('Contenido de la página');
  assert.equal(received.length, 1);
  for (let i = 0; i < 3; i++) { await focusWindow(); await settle(); }
  assert.equal(requests.filter(url => url === '/api/auth/permisos').length, 4, 'se siguen verificando al volver');
  assert.equal(received.length, 1, 'el mismo contenido conserva el mismo array');
});

test('al navegar se verifican los permisos de la nueva ruta sin volver a pedir el perfil', async () => {
  const { view, requests, navigate } = setup();
  await view.findByText('Contenido de la página');
  const count = path => requests.filter(url => url === path).length;
  assert.deepEqual([count('/api/auth/profile'), count('/api/auth/permisos')], [1, 1], 'al entrar se piden ambos');
  for (const [i, next] of ['/backoffice/incidencias', '/backoffice/reservaciones', '/backoffice'].entries()) {
    await navigate(next);
    await view.findByText('Contenido de la página');
    assert.equal(count('/api/auth/permisos'), i + 2, next + ': se verifican los permisos');
    assert.equal(count('/api/auth/profile'), 1, next + ': el perfil no se vuelve a pedir');
  }
  assert.ok(view.getByText('Ana Pérez'), 'el encabezado conserva el usuario');
});

test('si falla el perfil se informa aunque los permisos lleguen bien, y reintentar recupera la sesión', async () => {
  const { view, requests } = setup({ profileFailures: 1 });
  assert.match((await view.findByRole('alert')).textContent, /servidor no pudo completar/);
  assert.equal(view.queryByText('Contenido de la página'), null);
  await act(async () => { view.getByRole('button', { name: 'Reintentar' }).click(); });
  await view.findByText('Contenido de la página');
  assert.equal(requests.filter(url => url === '/api/auth/profile').length, 2);
});

test('si los permisos cambiaron, la página recibe los nuevos al volver a la pestaña', async () => {
  const { view, received, setGrants } = setup();
  await view.findByText('Contenido de la página');
  setGrants([superadmin, resident]);
  await focusWindow(); await settle();
  assert.equal(received.length, 2);
  assert.deepEqual(received[1].map(context => context.rolCodigo), ['SUPERADMIN', 'RESIDENTE']);
  await focusWindow(); await settle();
  assert.equal(received.length, 2, 'después del cambio vuelve a conservarse mientras no cambien');
});

test('el botón para cambiar de vista está en el encabezado y no en el panel lateral', async () => {
  const { view } = setup();
  await view.findByText('Contenido de la página');
  const header = view.container.querySelector('.bo-header');
  const sidebar = view.container.querySelector('.bo-sidebar');
  const toResident = view.getByRole('link', { name: 'Ir a mi consorcio' });
  assert.ok(header.contains(toResident));
  assert.equal(toResident.getAttribute('href'), '/mi-consorcio');
  assert.equal(sidebar.textContent.includes('Ir a mi consorcio'), false);
  assert.equal(header.textContent.includes('Panel de administración'), false, 'ya no se muestra el texto informativo');
});
