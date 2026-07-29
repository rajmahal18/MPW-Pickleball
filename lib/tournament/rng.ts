function xmur3(value: string) {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRandom(seed: string | number) {
  return mulberry32(xmur3(String(seed))());
}

export function randomInteger(random: () => number, minimum: number, maximum: number) {
  return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

export function pickOne<T>(random: () => number, items: readonly T[]): T {
  if (!items.length) throw new Error("Cannot choose from an empty collection.");
  return items[Math.floor(random() * items.length)]!;
}
