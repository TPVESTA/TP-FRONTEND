import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function client(fetch) {
  const storage = new Map();
  const events = [];
  const exports = {};
  const source = fs.readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, fetch, Headers, AbortSignal, Event,
    window: {
      sessionStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
      },
      dispatchEvent: event => events.push(event.type),
    },
  });
  return { ...exports, events };
}

test('envía JSON y Bearer y conserva data y total', async () => {
  const api = client(async (url, init) => {
    assert.equal(url, '/api/edificios');
    assert.equal(init.headers.get('Authorization'), 'Bearer token');
    assert.equal(init.headers.get('Content-Type'), 'application/json');
    assert.equal(init.body, '{"nombre":"Edificio"}');
    assert.equal(init.cache, 'no-store');
    return Response.json({ success: true, data: [{ id: 1 }], total: 1 });
  });
  api.session.setToken('token');
  const result = await api.apiRequest('/edificios', { method: 'POST', body: { nombre: 'Edificio' } });
  assert.equal(result.total, 1);
  assert.equal(result.data[0].id, 1);
});

test('401 autenticado borra sesión y notifica; login público no la borra', async () => {
  const api = client(async () => Response.json({ success: false, error: 'Credenciales inválidas' }, { status: 401 }));
  api.session.setToken('token');
  await assert.rejects(api.apiRequest('/auth/login', { authenticated: false }), { status: 401 });
  assert.equal(api.session.getToken(), 'token');
  await assert.rejects(api.apiRequest('/auth/profile'), { status: 401 });
  assert.equal(api.session.getToken(), null);
  assert.deepEqual(api.events, [api.SESSION_EXPIRED_EVENT]);
});

test('conserva los errores de validación del backend', async () => {
  const api = client(async () => Response.json({ success: false, error: 'Email inválido', errors: ['Email inválido'] }, { status: 400 }));
  await assert.rejects(api.apiRequest('/auth/login'), err => err.status === 400 && err.details[0] === 'Email inválido');
});

test('maneja backend caído y respuestas no JSON', async () => {
  const offline = client(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(offline.apiRequest('/auth/profile'), { status: 0 });
  const invalid = client(async () => new Response('Bad gateway', { status: 502 }));
  await assert.rejects(invalid.apiRequest('/auth/profile'), { status: 502 });
});
