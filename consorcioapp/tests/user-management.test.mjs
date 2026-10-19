import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  const exports = cache[name] = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: path => load(path.replace('./', '')) });
  return exports;
}
const { userPayload } = load('user-management');
const admin = [{ rolId: 1, rolCodigo: 'ADMINISTRATIVO', ambito: 'ADMINISTRACION', administracionId: 20, edificioIds: [10], permisos: [{ seccion: 'USUARIOS', crear: true, leer: true, editar: true, borrar: true, acciones: [] }] }];
const global = [{ rolId: 2, rolCodigo: 'SUPERADMIN', ambito: 'GLOBAL', edificioIds: [], permisos: [] }];
const user = { id: 5, nombre: 'Ana', apellido: 'Pérez', email: 'ana@example.test', cuil: '20123456789', fechaNacimiento: '1990-01-01', estado: true };
function form() { const f = new FormData(); for (const [key, value] of Object.entries(user)) f.set(key, String(value)); f.set('estado', 'on'); return f; }

test('Administrativo crea en administración autorizada y no deshabilita cuentas', () => {
  const f = form();
  assert.throws(() => userPayload(f, admin), /administración/);
  f.set('administracionId', '21');
  assert.throws(() => userPayload(f, admin), /administración/);
  f.set('administracionId', '20'); f.set('password', 'test-only'); f.delete('estado');
  const { body } = userPayload(f, admin);
  assert.equal(body.administracionId, 20);
  assert.equal(body.estado, true);
  assert.equal(body.password, 'test-only');
});

test('edición administrativa omite identidad y estado aunque se altere el formulario', () => {
  const f = form(); f.set('email', 'otro@example.test'); f.set('password', 'no-enviar'); f.delete('estado'); f.set('nombre', ' Nuevo nombre ');
  const { body, ownProfile } = userPayload(f, admin, user, 99);
  assert.equal(ownProfile, false);
  assert.equal(body.nombre, 'Nuevo nombre');
  for (const key of ['email', 'password', 'estado', 'administracionId']) assert.equal(Object.hasOwn(body, key), false);
});

test('edición propia usa perfil personal y nunca envía estado', () => {
  const f = form(); f.set('email', 'nuevo@example.test'); f.set('password', 'test-only');
  const { body, ownProfile } = userPayload(f, admin, user, 5);
  assert.equal(ownProfile, true);
  assert.equal(body.email, 'nuevo@example.test'); assert.equal(body.password, 'test-only');
  assert.equal(Object.hasOwn(body, 'estado'), false);
});

test('gestión global omite campos sensibles sin cambios y permite cambios explícitos autorizados', () => {
  const f = form();
  const unchanged = userPayload(f, global, user, 99).body;
  assert.equal(Object.hasOwn(unchanged, 'estado'), false);
  assert.equal(Object.hasOwn(unchanged, 'email'), false);
  f.set('email', 'nuevo@example.test'); f.delete('estado');
  const changed = userPayload(f, global, user, 99).body;
  assert.equal(changed.email, 'nuevo@example.test'); assert.equal(changed.estado, false);
  assert.equal(Object.hasOwn(userPayload(f, global, user, 5).body, 'estado'), false);
});
