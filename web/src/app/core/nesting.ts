export interface StayUnit {
  id: string;
  name: string;
  beds: number;
  contains: readonly string[];
}

/** Same contains graph the API enforces. The home page replaces this with live listings. */
export const houseUnits: readonly StayUnit[] = [
  { id: 'studio', name: 'Studio', beds: 1, contains: [] },
  { id: 'two-bed', name: '2-bed', beds: 2, contains: [] },
  { id: 'three-bed', name: '3-bed', beds: 3, contains: ['two-bed'] },
  { id: 'four-bed', name: '4-bed', beds: 4, contains: ['three-bed', 'two-bed', 'studio'] },
  { id: 'cottage', name: 'Cottage', beds: 1, contains: [] },
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

export function blockLine(bookedId: string | null, units: readonly StayUnit[] = houseUnits): string {
  if (!bookedId) {
    return 'Choose a stay. The rooms that booking blocks light up.';
  }
  const unit = units.find((item) => item.id === bookedId);
  if (!unit) {
    return 'Choose a stay. The rooms that booking blocks light up.';
  }
  const names = blockedBy(bookedId, units)
    .filter((id) => id !== bookedId)
    .map((id) => units.find((item) => item.id === id)?.name ?? id);
  if (!names.length) {
    return `The ${unit.name} links to nothing.`;
  }
  return `A ${unit.name} booking blocks ${joinNames(names)}.`;
}

function joinNames(names: string[]): string {
  const labeled = names.map((name) => `the ${name}`);
  if (labeled.length === 1) {
    return labeled[0];
  }
  if (labeled.length === 2) {
    return `${labeled[0]} and ${labeled[1]}`;
  }
  return `${labeled.slice(0, -1).join(', ')}, and ${labeled[labeled.length - 1]}`;
}
