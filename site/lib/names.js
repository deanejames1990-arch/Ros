// One key per player name, whatever the fadas, case, spacing or apostrophe:
// "Oisín O’Neill" and "oisin o'neill" are the same player.
export const nameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

// Of two spellings, the one with the fadas (then the one already held).
const fadas = (s) => (String(s || '').normalize('NFD').match(/[̀-ͯ]/g) || []).length;
export const betterName = (held, other) => (fadas(other) > fadas(held) ? other : held);
