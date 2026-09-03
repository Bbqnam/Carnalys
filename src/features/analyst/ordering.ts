export function orderByRequestedIds<T>(ids: readonly string[], values: readonly T[], id: (value: T) => string) {
  const position = new Map(ids.map((value, index) => [value, index]));
  return [...values].sort((left, right) => (position.get(id(left)) ?? Number.MAX_SAFE_INTEGER) - (position.get(id(right)) ?? Number.MAX_SAFE_INTEGER));
}

