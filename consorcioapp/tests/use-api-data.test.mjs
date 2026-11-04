import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { loadModule, render, cleanup } from './helpers/components.mjs';

const { useApiData } = loadModule('lib/use-api-data.ts');
afterEach(() => cleanup());
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

// Componente mínimo que muestra el estado del hook y expone reload.
function setup(loader, refreshKey) {
  const api = {};
  function Probe({ refresh }) {
    Object.assign(api, useApiData(loader, [], refresh));
    return React.createElement('p', null, api.loading ? 'cargando' : api.error || api.data.join(','));
  }
  const view = render(React.createElement(Probe, { refresh: refreshKey }));
  return { view, api, rerender: refresh => view.rerender(React.createElement(Probe, { refresh })) };
}

test('carga los datos, reintenta con reload y vuelve al valor inicial ante un error', async () => {
  let calls = 0;
  const loader = async () => { calls++; if (calls === 2) throw new Error('Sin conexión'); return ['a', String(calls)]; };
  const { view, api } = setup(loader);
  assert.ok(view.getByText('cargando'));
  await settle();
  assert.ok(view.getByText('a,1'));
  await act(async () => { api.reload(); });
  await settle();
  assert.ok(view.getByText('Sin conexión'));
  assert.deepEqual(api.data, []);
  await act(async () => { api.reload(); });
  await settle();
  assert.ok(view.getByText('a,3'));
  assert.equal(api.error, '');
});

test('cancela al desmontar y no actualiza un componente que ya no está', async () => {
  let signal;
  const loader = received => { signal = received; return new Promise(() => {}); };
  const { view } = setup(loader);
  assert.equal(signal.aborted, false);
  view.unmount();
  assert.equal(signal.aborted, true);
});

test('vuelve a pedir cuando cambia la clave de recarga, cancelando la anterior', async () => {
  const signals = [];
  const loader = async received => { signals.push(received); return ['x']; };
  const { rerender } = setup(loader, 'permisos-1');
  await settle();
  await act(async () => { rerender('permisos-1'); });
  assert.equal(signals.length, 1, 'misma clave: no vuelve a pedir');
  await act(async () => { rerender('permisos-2'); });
  await settle();
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
});
