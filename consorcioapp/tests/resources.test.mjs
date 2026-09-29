import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/resources.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Date });
const { resources, fieldValue, resourcePayload } = exports;

test('tipos de unidad exige un ámbito y envía el enum al backend', () => {
  const data = new FormData();
  data.set('nombre', 'Departamento');
  const fields = resources['tipos-unidad'].fields;
  assert.throws(() => resourcePayload(data, fields), /opción válida/);
  for (const scope of ['PRIVADO', 'COMUN']) {
    data.set('ambito', scope);
    assert.equal(resourcePayload(data, fields).ambito, scope);
  }
  data.set('ambito', 'PUBLICO');
  assert.throws(() => resourcePayload(data, fields), /opción válida/);
  assert.equal(resources.propiedades.fields.find(f => f.name === 'tipoUnidadId').scope, 'PRIVADO');
  assert.equal(resources['areas-comunes'].fields.find(f => f.name === 'tipoUnidadId').scope, 'COMUN');
});

test('convierte IDs, enteros y decimales sin convertir CUIT en número', () => {
  const data = new FormData();
  data.set('nombre', ' Ejemplo '); data.set('cuit', '00123456789');
  data.set('direccion', 'Dirección'); data.set('localidadId', '3');
  const body = resourcePayload(data, resources.edificios.fields);
  assert.equal(body.cuit, '00123456789'); assert.equal(body.localidadId, 3); assert.equal(body.nombre, 'Ejemplo');
  data.set('mtCuadrados', '34.25'); data.set('habitaciones', '2');
  const property = resourcePayload(data, resources.propiedades.fields);
  assert.equal(property.mtCuadrados, 34.25); assert.equal(property.habitaciones, 2);
});

test('acepta relaciones serializadas como ID o como objeto', () => {
  const field = resources.edificios.fields.find(f => f.name === 'localidadId');
  assert.equal(fieldValue({ id: 1, localidad: 2 }, field), '2');
  assert.equal(fieldValue({ id: 1, localidad: { id: 2, nombre: 'Rosario' } }, field), '2');
});

test('permite quitar fecha de fin y conserva inicio por defecto', () => {
  const data = new FormData();
  const body = resourcePayload(data, resources['admin-edificios'].fields);
  assert.equal(body.endAt, null);
  assert.equal(Object.hasOwn(body, 'beginAt'), false);
});

test('rechaza un período invertido antes de enviarlo', () => {
  const data = new FormData();
  data.set('beginAt', '2026-09-20T12:00'); data.set('endAt', '2026-09-19T12:00');
  assert.throws(() => resourcePayload(data, resources['admin-edificios'].fields), /fecha de fin/);
});
