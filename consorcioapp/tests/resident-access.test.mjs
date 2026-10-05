import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/resident-access.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Date, Set });
const { accessibleBuildingIds, allowedSpaces, relationId, buildingRequests } = exports;
const now = Date.parse('2026-10-05T12:00:00Z');
const properties = [{ id: 10, edificio: { id: 1 } }, { id: 20, edificioId: 2 }];
const active = { id: 1, usuario: { id: 5 }, rol: { id: 3 }, propiedad: 10, beginAt: '2026-10-01T00:00:00Z', endAt: null };
test('un rol vigente habilita solamente espacios del mismo edificio', () => {
 const ids = accessibleBuildingIds(5, [active], properties, now);
 assert.equal(ids.has(1), true); assert.equal(ids.has(2), false);
 const spaces = allowedSpaces([{ id: 1, edificio: 1 }, { id: 2, edificio: 2 }, { id: 3 }], ids);
 assert.equal(spaces.length, 1); assert.equal(spaces[0].id, 1);
 assert.equal(accessibleBuildingIds(6, [active], properties, now).size, 0);
});
test('rechaza roles futuros, vencidos, fechas inválidas y relaciones ausentes', () => {
 for (const change of [{ beginAt: '2026-10-06T00:00:00Z' }, { endAt: new Date(now).toISOString() }, { beginAt: 'invalid' }, { endAt: 'invalid' }, { propiedad: 99 }, { rol: null }]) {
  assert.equal(accessibleBuildingIds(5, [{ ...active, ...change }], properties, now).size, 0);
 }
 assert.equal(accessibleBuildingIds(5, [{ ...active, beginAt: new Date(now).toISOString() }], properties, now).size, 1);
});
test('admite IDs y objetos sin autorizar referencias inválidas', () => {
 const assignment = { ...active, usuario: 5, propiedad: { id: 20 }, rol: 3 };
 assert.equal(accessibleBuildingIds(5, [assignment], properties, now).has(2), true);
 assert.equal(relationId({ id: 1, edificioId: 2 }, 'edificio'), 2);
 assert.equal(relationId({ id: 1, edificio: null }, 'edificio'), undefined);
});

test('el resumen cambia de edificio e incluye reservas de otros residentes', () => {
 const spaces = [{ id: 11, edificioId: 1 }, { id: 22, edificio: { id: 2 } }];
 const rows = [
  { id: 1, usuarioId: 5, areaComunId: 11 },
  { id: 2, usuarioId: 6, areaComun: { id: 11 } },
  { id: 3, usuarioId: 5, areaComunId: 22 },
  { id: 4, areaComunId: 99 },
 ];
 assert.equal(buildingRequests(rows, 'areaComun', spaces, 1).map(row => row.id).join(','), '1,2');
 assert.equal(buildingRequests(rows, 'areaComun', spaces, 2).map(row => row.id).join(','), '3');
 assert.equal(buildingRequests(rows, 'areaComun', spaces).length, 0);
});

test('las incidencias se filtran por la unidad privada o común del edificio', () => {
 const units = [{ id: 10, edificioId: 1 }, { id: 20, edificio: 2 }];
 const rows = [
  { id: 1, unidadId: 10 },
  { id: 2, unidad: { id: 20 } },
  { id: 3, unidad: { id: 30, edificio: { id: 1 } } },
  { id: 4, unidad: { id: 40 } },
 ];
 assert.equal(buildingRequests(rows, 'unidad', units, 1).map(row => row.id).join(','), '1,3');
 assert.equal(buildingRequests(rows, 'unidad', units, 2).map(row => row.id).join(','), '2');
});
