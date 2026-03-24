export function createSeededRng(seed = Date.now()) {
  let state = normalizeSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (Math.trunc(seed) >>> 0) || 1;
  }

  const text = String(seed ?? '1');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) || 1;
}

export function randomChoice(items, rng = Math.random) {
  if (!items.length) return null;
  const index = Math.floor(rng() * items.length);
  return items[Math.min(index, items.length - 1)];
}

export function sampleWeightedIndex(weights, rng = Math.random) {
  if (!weights.length) return -1;

  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return Math.floor(rng() * weights.length);
  }

  let threshold = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    threshold -= Math.max(0, weights[i]);
    if (threshold <= 0) return i;
  }

  return weights.length - 1;
}
