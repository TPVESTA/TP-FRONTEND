import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/permissions.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { hasPermission, canBusiness, canResource, canVisit, canDelegate, originPropertyIds, originPayload, validContexts, permissionPayload } = exports;
const p = (seccion, flags = {}) => ({ seccion, crear: false, leer: false, editar: false, borrar: false, acciones: [], ...flags });
const grant = (ambito, permisos, rest = {}) => ({ rolId: 1, rolCodigo: null, ambito, edificioIds: [10], permisos, ...(ambito === 'PROPIEDAD' ? { propiedadId: 100 } : ambito === 'ADMINISTRACION' ? { administracionId: 20 } : {}), ...rest });
// Initial matrix from TP-BACKEND/AUTORIZACION.md. Permissions returned by the API remain authoritative.
const resident = () => grant('PROPIEDAD', [p('RESERVAS', { crear: true, leer: true, editar: true, acciones: ['DISPONIBILIDAD'] }), p('INCIDENCIAS', { crear: true, leer: true, editar: true }), p('PROPIEDADES', { leer: true }), p('ESTRUCTURA', { leer: true }), p('CATALOGOS', { leer: true })], { rolCodigo: 'RESIDENTE' });
const owner = () => grant('PROPIEDAD', [p('INCIDENCIAS', { crear: true, leer: true }), p('PROPIEDADES', { leer: true }), p('ESTRUCTURA', { leer: true })], { rolCodigo: 'PROPIETARIO' });
const maintenance = () => grant('ADMINISTRACION', [p('RESERVAS', { leer: true }), p('INCIDENCIAS', { crear: true, leer: true, editar: true, acciones: ['CAMBIAR_ESTADO'] }), p('ESTRUCTURA', { leer: true }), p('ADMINISTRACIONES', { leer: true })], { rolCodigo: 'MANTENIMIENTO' });
const administrative = () => grant('ADMINISTRACION', [p('RESERVAS', { leer: true, editar: true }), p('INCIDENCIAS', { crear: true, leer: true, editar: true, acciones: ['CAMBIAR_ESTADO'] }), p('USUARIOS', { crear: true, leer: true, editar: true, borrar: true }), p('ASIGNACIONES', { leer: true, acciones: ['ASIGNAR', 'REVOCAR'] }), p('ESTRUCTURA', { leer: true }), p('PROPIEDADES', { leer: true }), p('ADMINISTRACIONES', { leer: true })], { rolCodigo: 'ADMINISTRATIVO' });
const admin = () => grant('GLOBAL', [], { rolCodigo: 'SUPERADMIN' });
const reservation = (rest = {}) => ({ id: 1, usuario: { id: 5 }, estado: 'Reservado', propiedadOrigen: 100, areaComun: { id: 8, edificio: 10 }, ...rest });
const incidence = (rest = {}) => ({ id: 2, usuario: 5, estado: 'Reportado', propiedadOrigen: 100, unidad: { id: 8, edificio: 10 }, ...rest });

test('sin roles, permisos ausentes y roles globales ordinarios deniegan por defecto', () => {
  for (const contexts of [[], [grant('GLOBAL', [])], [grant('PROPIEDAD', [], { rolCodigo: 'RESIDENTE' })]]) {
    assert.equal(hasPermission(contexts, 'RESERVAS', 'CREAR'), false);
    assert.equal(canVisit(contexts, '/backoffice/usuarios'), false);
    assert.equal(canVisit(contexts, '/mi-consorcio/reservas'), false);
  }
  assert.equal(canVisit([], '/mi-consorcio'), true);
  assert.equal(canVisit([admin()], '/backoffice/desconocido'), false);
});

test('la matriz diferencia Residente, Propietario, Mantenimiento y Administrativo', () => {
  assert.equal(canVisit([resident()], '/mi-consorcio/reservas'), true);
  assert.equal(canVisit([owner()], '/mi-consorcio/reservas'), false);
  assert.equal(hasPermission([owner()], 'INCIDENCIAS', 'EDITAR'), false);
  assert.equal(canResource([maintenance()], 'propiedades', 'LEER'), false);
  assert.equal(canResource([maintenance()], 'users', 'LEER'), false);
  assert.equal(canResource([administrative()], 'users', 'CREAR'), true);
  assert.equal(hasPermission([administrative()], 'USUARIOS', 'DESHABILITAR', undefined, 'GLOBAL'), false);
  for (const contexts of [[resident()], [owner()], [maintenance()], [administrative()]]) {
    for (const resource of ['edificios', 'propiedades', 'areas-comunes', 'administraciones', 'admin-edificios', 'localidades', 'tipos-unidad']) assert.equal(canResource(contexts, resource, 'CREAR'), false);
  }
});

test('los permisos se combinan dentro del contexto sin trasladarse a otra propiedad o administración', () => {
  const contexts = [resident(), grant('PROPIEDAD', [p('RESERVAS', { leer: true })], { propiedadId: 101 }), grant('ADMINISTRACION', [p('RESERVAS', { editar: true })], { edificioIds: [11], administracionId: 21 })];
  assert.equal(hasPermission(contexts, 'RESERVAS', 'EDITAR', { propiedadId: 100, edificioId: 10 }), true);
  assert.equal(hasPermission(contexts, 'RESERVAS', 'EDITAR', { propiedadId: 101, edificioId: 10 }), false);
  assert.equal(hasPermission(contexts, 'RESERVAS', 'EDITAR', { propiedadId: 100, edificioId: 11 }), true); // administrative grant in building 11
  assert.equal(hasPermission(contexts, 'RESERVAS', 'EDITAR', { propiedadId: 100, edificioId: 11 }, 'PROPIEDAD'), false);
  assert.equal(hasPermission(contexts, 'RESERVAS', 'EDITAR', { administracionId: 20, edificioId: 11 }), false);
  assert.equal(hasPermission(contexts, 'RESERVAS', 'EDITAR', {}), false);
  assert.equal(hasPermission([admin()], 'RESERVAS', 'EDITAR', { edificioId: -1 }), false);
});

test('las filas de reservas usan autor, propiedad de origen, edificio y estado actuales', () => {
  assert.equal(canBusiness([resident()], 'RESERVAS', 'EDITAR', reservation(), 5), true);
  assert.equal(canBusiness([resident()], 'RESERVAS', 'EDITAR', reservation(), 6), false);
  for (const row of [reservation({ propiedadOrigen: 101 }), reservation({ propiedadOrigen: null }), reservation({ areaComun: { id: 8, edificio: 11 } }), reservation({ estado: 'Cancelado' }), reservation({ estado: 'Finalizado' }), reservation({ areaComun: 8 })]) assert.equal(canBusiness([resident()], 'RESERVAS', 'EDITAR', row, 5), false);
  assert.equal(canBusiness([resident()], 'RESERVAS', 'EDITAR', reservation({ areaComun: 8 }), 5, { 'areas-comunes': [{ id: 8, edificio: 10 }] }), true);
  assert.equal(canBusiness([administrative()], 'RESERVAS', 'EDITAR', reservation(), 99), true);
  assert.equal(canBusiness([administrative()], 'RESERVAS', 'EDITAR', reservation({ areaComun: { id: 8, edificio: 11 } }), 99), false);
  assert.equal(canBusiness([maintenance()], 'RESERVAS', 'EDITAR', reservation(), 5), false);
  assert.equal(canBusiness([admin()], 'RESERVAS', 'EDITAR', reservation(), 99), true);
});

test('incidencias propias se editan en Reportado y cambiar estado exige permiso de gestión independiente', () => {
  assert.equal(canBusiness([resident()], 'INCIDENCIAS', 'EDITAR', incidence(), 5), true);
  assert.equal(canBusiness([owner()], 'INCIDENCIAS', 'EDITAR', incidence(), 5), false);
  assert.equal(canBusiness([resident()], 'INCIDENCIAS', 'EDITAR', incidence({ estado: 'En revisión' }), 5), false);
  assert.equal(canBusiness([resident()], 'INCIDENCIAS', 'CAMBIAR_ESTADO', incidence(), 5), false);
  assert.equal(canBusiness([maintenance()], 'INCIDENCIAS', 'CAMBIAR_ESTADO', incidence(), 99), true);
  assert.equal(canBusiness([maintenance()], 'INCIDENCIAS', 'EDITAR', incidence({ estado: 'En revisión' }), 99), true);
  assert.equal(canBusiness([resident()], 'INCIDENCIAS', 'EDITAR', incidence({ propiedadOrigen: null, unidad: { id: 100, edificio: 10 } }), 5, { propiedades: [{ id: 100 }] }), true);
});

test('configuración modificada y revocación no dependen del código ni del nombre del rol', () => {
  const modified = resident(); modified.permisos = [];
  assert.equal(canVisit([modified], '/mi-consorcio/reservas'), false);
  const custom = grant('PROPIEDAD', resident().permisos);
  assert.equal(canBusiness([custom], 'RESERVAS', 'EDITAR', reservation(), 5), true);
  assert.equal(canBusiness([], 'RESERVAS', 'EDITAR', reservation(), 5), false);
  assert.equal(canResource([grant('PROPIEDAD', [p('ESTRUCTURA', { crear: true })])], 'areas-comunes', 'CREAR'), false);
  assert.equal(canResource([grant('ADMINISTRACION', [p('ESTRUCTURA', { crear: true })])], 'edificios', 'CREAR'), false);
});

test('roles y asignaciones globales no se consultan desde gestión administrativa', () => {
  assert.equal(canResource([administrative()], 'roles', 'LEER'), true);
  assert.equal(canResource([administrative()], 'roles', 'EDITAR'), false);
  assert.equal(canResource([administrative()], 'usuarios-roles', 'LEER'), false);
  assert.equal(canResource([resident()], 'usuarios-roles-propiedad', 'LEER'), false);
  assert.equal(canResource([administrative()], 'empleados', 'CREAR', { administracionId: 20 }), true);
  assert.equal(canResource([administrative()], 'empleados', 'CREAR', { administracionId: 21 }), false);
});

test('delegación respeta ámbito, roles iniciales de propiedad y techo de permisos', () => {
  const r = { ambito: 'PROPIEDAD', codigo: 'RESIDENTE', permisos: resident().permisos };
  assert.equal(canDelegate([administrative()], r, { propiedadId: 100, edificioId: 10 }), true);
  assert.equal(canDelegate([administrative()], r, { propiedadId: 200, edificioId: 11 }), false);
  assert.equal(canDelegate([administrative()], { ...r, codigo: null }, { propiedadId: 100, edificioId: 10 }), false);
  assert.equal(canDelegate([administrative()], { ...r, permisos: [p('ROLES', { editar: true })] }, { propiedadId: 100, edificioId: 10 }), false);
  assert.equal(canDelegate([administrative()], { ambito: 'GLOBAL', permisos: [] }, { administracionId: 20 }), false);
  assert.equal(canDelegate([administrative()], { ambito: 'ADMINISTRACION', permisos: maintenance().permisos }, { administracionId: 20 }), true);
  assert.equal(canDelegate([administrative()], { ambito: 'ADMINISTRACION', permisos: [p('USUARIOS', { acciones: ['DESHABILITAR'] })] }, { administracionId: 20 }), false);
  assert.equal(canDelegate([admin()], r, { propiedadId: 100, edificioId: 10 }), true);
});

test('seleccionar origen exige una propiedad con CREAR en el mismo edificio y respeta unidad privada', () => {
  const contexts = [resident(), { ...resident(), propiedadId: 101 }, owner()];
  assert.equal(originPropertyIds(contexts, 'RESERVAS', 10).join(','), '100,101');
  assert.equal(originPayload(contexts, 'RESERVAS', 10, 101).propiedadId, 101);
  assert.throws(() => originPayload(contexts, 'RESERVAS', 10), /propiedad/);
  assert.throws(() => originPayload(contexts, 'RESERVAS', 11, 100), /propiedad/);
  assert.throws(() => originPayload(contexts, 'INCIDENCIAS', 10, 101, 100), /propiedad/);
  assert.equal(JSON.stringify(originPayload([admin()], 'RESERVAS', 10)), '{}');
});

test('valida la respuesta de permisos y elimina metadatos ORM al guardar la matriz', () => {
  assert.equal(validContexts([resident(), administrative(), admin()]), true);
  for (const malformed of [null, {}, [{}], [{ ...resident(), propiedadId: undefined }], [{ ...administrative(), administracionId: 0 }], [{ ...resident(), edificioIds: ['10'] }], [{ ...resident(), permisos: [{ seccion: 'RESERVAS', crear: 'true' }] }]]) assert.equal(validContexts(malformed), false);
  const body = permissionPayload([{ ...p('RESERVAS', { leer: true }), id: 4, rol: 6 }]);
  assert.equal(Object.hasOwn(body[0], 'id'), false);
  assert.equal(Object.hasOwn(body[0], 'rol'), false);
  assert.equal(body[0].leer, true);
});
