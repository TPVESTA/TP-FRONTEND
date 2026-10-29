import type { RecordData } from "./resources";

function assignmentRelation(assignment: RecordData, key: "usuario" | "rol"): number | undefined {
  const link = assignment.usuarioRol;
  if (link && typeof link === "object") {
    const nested = relationId(link as RecordData, key);
    if (nested !== undefined) return nested;
  }
  return relationId(assignment, key);
}
function periodActive(record: RecordData, now: number): boolean {
  const begin = new Date(String(record.beginAt)).getTime();
  const end = record.endAt == null ? Infinity : new Date(String(record.endAt)).getTime();
  return begin <= now && now < end;
}
export function currentPropertyAssignments(userId: number, assignments: RecordData[], now = Date.now()): RecordData[] {
  return assignments.filter(assignment => {
    const link = assignment.usuarioRol;
    const linkActive = !link || typeof link !== "object" || periodActive(link as RecordData, now);
    return assignmentRelation(assignment, "usuario") === userId && periodActive(assignment, now) && linkActive && !!assignmentRelation(assignment, "rol") && !!relationId(assignment, "propiedad");
  });
}

export function relationId(row: RecordData, name: string): number | undefined {
  const value = row[name] ?? row[`${name}Id`];
  const id = Number(typeof value === "object" && value !== null && "id" in value ? value.id : value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function accessibleBuildingIds(userId: number, assignments: RecordData[], properties: RecordData[], now = Date.now()): Set<number> {
  const buildings = new Set<number>();
  for (const assignment of currentPropertyAssignments(userId, assignments, now)) {
    const property = properties.find(p => p.id === relationId(assignment, "propiedad"));
    const building = property && relationId(property, "edificio");
    if (building) buildings.add(building);
  }
  return buildings;
}

export function allowedSpaces(spaces: RecordData[], buildings: Set<number>): RecordData[] {
  return spaces.filter(space => {
    const building = relationId(space, "edificio");
    return building !== undefined && buildings.has(building);
  });
}

export function buildingRequests(rows: RecordData[], relation: "areaComun" | "unidad", units: RecordData[], buildingId?: number): RecordData[] {
  if (buildingId === undefined) return [];
  return rows.filter(row => {
    const embedded = row[relation];
    const unit = units.find(unit => unit.id === relationId(row, relation))
      ?? (typeof embedded === "object" && embedded !== null ? embedded as RecordData : undefined);
    return unit !== undefined && relationId(unit, "edificio") === buildingId;
  });
}
