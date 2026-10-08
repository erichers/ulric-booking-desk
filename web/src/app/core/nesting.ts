export interface StayUnit {
  id: string;
  name: string;
  beds: number;
  contains: readonly string[];
}

/**
 * Eugene house, four nested stays.
 * The catalog will have five listings. Add the fifth here when its
 * name and its place in the house are known. blockedBy leaves a unit
 * alone when it neither contains the booking nor sits inside it.
 */
export const houseUnits: readonly StayUnit[] = [
  { id: 'four', name: '4-bed', beds: 4, contains: ['three', 'two', 'studio'] },
  { id: 'three', name: '3-bed', beds: 3, contains: ['two'] },
  { id: 'two', name: '2-bed', beds: 2, contains: [] },
  { id: 'studio', name: 'Studio', beds: 0, contains: [] },
];

export function blockedBy(bookedId: string, units: readonly StayUnit[] = houseUnits): string[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  if (!byId.has(bookedId)) {
    return [];
  }
  const blocked = new Set<string>();
  const down = (id: string): void => {
    if (blocked.has(id)) {
      return;
    }
    blocked.add(id);
    for (const child of byId.get(id)?.contains ?? []) {
      down(child);
    }
  };
  down(bookedId);
  const holds = (id: string, target: string): boolean => {
    const children = byId.get(id)?.contains ?? [];
    return children.some((child) => child === target || holds(child, target));
  };
  for (const unit of units) {
    if (holds(unit.id, bookedId)) {
      blocked.add(unit.id);
    }
  }
  return units.map((unit) => unit.id).filter((id) => blocked.has(id));
}

export function blockLine(bookedId: string | null): string {
  switch (bookedId) {
    case 'four':
      return 'A 4-bed booking blocks the 3-bed, the 2-bed, and the studio.';
    case 'three':
      return 'A 3-bed booking blocks the 2-bed and the 4-bed. The studio stays open.';
    case 'two':
      return 'A 2-bed booking blocks the 3-bed and the 4-bed. The studio stays open.';
    case 'studio':
      return 'A studio booking blocks the 4-bed. The 3-bed and the 2-bed stay open.';
    default:
      return 'Choose a stay. The rooms that booking blocks light up.';
  }
}
