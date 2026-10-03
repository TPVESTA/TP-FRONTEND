import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/resources.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Date });
const { resources, resourceFields, fieldValue, resourcePayload, reservationDay, reservationDate, canModifyReservation } = exports;

test('áreas comunes admite capacidad nula y conserva cero al crear y editar', () => {
  const fields = resourceFields('areas-comunes');
  const capacity = fields.find(f => f.name === 'capacidad');
  assert.equal(capacity.optional, true);
  assert.equal(capacity.min, 0);
  for (const row of [undefined, { id: 1, capacidad: 12 }]) {
    const form = new FormData();
    form.set('capacidad', '');
    assert.equal(resourcePayload(form, fields, row).capacidad, null);
    for (const value of ['0', '12']) {
      form.set('capacidad', value);
      assert.equal(resourcePayload(form, fields, row).capacidad, Number(value));
    }
  }
  assert.equal(fieldValue({ id: 1, capacidad: null }, capacity), '');
  assert.equal(fieldValue({ id: 1, capacidad: 0 }, capacity), '0');
});

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


test('incidencias deja el estado inicial y el cierre a cargo del backend', () => {
  const form = new FormData();
  form.set('estado', 'Finalizado');
  form.set('closedAt', '2026-10-03T12:00');
  const body = resourcePayload(form, resourceFields('incidencias'));
  assert.equal(Object.hasOwn(body, 'estado'), false);
  assert.equal(Object.hasOwn(body, 'closedAt'), false);
});

test('incidencias permite solo avanzar y omite el estado sin cambios', () => {
  const form = new FormData();
  for (const [current, next] of [['Reportado', 'En revisión'], ['En revisión', 'Finalizado']]) {
    const row = { id: 1, estado: current };
    const fields = resourceFields('incidencias', row);
    form.set('estado', current);
    assert.equal(Object.hasOwn(resourcePayload(form, fields, row), 'estado'), false);
    form.set('estado', next);
    assert.equal(resourcePayload(form, fields, row).estado, next);
    form.set('estado', current === 'Reportado' ? 'Finalizado' : 'Reportado');
    assert.throws(() => resourcePayload(form, fields, row), /opción válida/);
  }
  const row = { id: 1, estado: 'Finalizado' };
  assert.equal(resourceFields('incidencias', row).find(f => f.name === 'estado').readOnly, true);
  assert.equal(Object.hasOwn(resourcePayload(form, resourceFields('incidencias', row), row), 'estado'), false);
});

test('reservas crea sin estado y edita sin cambiar el dueño', () => {
  const form = new FormData();
  form.set('fechaReservacion', '2099-10-03');
  form.set('descripcion', ' Reunión ');
  form.set('usuarioId', '5');
  form.set('areaComunId', '7');
  form.set('estado', 'Finalizado');
  const body = resourcePayload(form, resourceFields('reservaciones'));
  assert.equal(JSON.stringify(body), JSON.stringify({ fechaReservacion: '2099-10-03T00:00:00-03:00', descripcion: 'Reunión', usuarioId: 5, areaComunId: 7 }));
  const row = { id: 1, estado: 'Reservado', usuario: { id: 5 } };
  const fields = resourceFields('reservaciones', row);
  assert.equal(fields.find(f => f.name === 'usuarioId').readOnly, true);
  assert.equal(fields.find(f => f.name === 'estado').readOnly, true);
  form.set('usuarioId', '99');
  const update = resourcePayload(form, fields, row);
  assert.equal(Object.hasOwn(update, 'usuarioId'), false);
  assert.equal(Object.hasOwn(update, 'estado'), false);
});

test('reservas usa el día de Buenos Aires en los límites UTC y admite hoy completo', () => {
  const now = new Date('2026-10-04T02:59:59Z');
  assert.equal(reservationDay(now), '2026-10-03');
  assert.equal(reservationDate('2026-10-03', now), '2026-10-03T00:00:00-03:00');
  assert.throws(() => reservationDate('2026-10-02', now), /ya terminó/);
  assert.throws(() => reservationDate('2026-10-03', new Date('2026-10-04T03:00:00Z')), /ya terminó/);
  assert.throws(() => reservationDate('2026-02-30', now), /día válido/);
  const field = resources.reservaciones.fields.find(f => f.name === 'fechaReservacion');
  assert.equal(fieldValue({ id: 1, fechaReservacion: '2026-10-04T02:59:59Z' }, field), '2026-10-03');
  assert.equal(new Date(reservationDate('2099-10-03', now)).toISOString().slice(0, 10), '2099-10-03');
});

test('reservas solo permite modificar al dueño con estado Reservado devuelto por API', () => {
  for (const usuario of [5, { id: 5 }]) {
    const row = { id: 1, usuario, estado: 'Reservado', fechaReservacion: '2020-01-01T03:00:00Z' };
    assert.equal(canModifyReservation(row, 5), true);
    assert.equal(canModifyReservation(row, 6), false);
    assert.equal(canModifyReservation(row), false);
  }
  assert.equal(canModifyReservation({ id: 1, usuarioId: 5, estado: 'Reservado' }, 5), true);
  for (const estado of ['Finalizado', 'Cancelado']) {
    const row = { id: 1, usuario: 5, estado };
    assert.equal(canModifyReservation(row, 5), false);
    const fields = resourceFields('reservaciones', row);
    assert.equal(fields.every(f => f.readOnly), true);
    assert.throws(() => resourcePayload(new FormData(), fields, row), /estado Reservado/);
  }
});
