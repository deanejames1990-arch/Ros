// One key per player name, whatever the fadas, case, spacing or apostrophe:
// "Oisín O’Neill", "oisin o'neill" and "Oisin O Neill" are the same player.
const MARKS = /[̀-ͯ]/g;
export const nameKey = (s) => String(s || '').normalize('NFD').replace(MARKS, '')
  .replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
  .replace(/\bo(?:'\s*|\s+)(?=[a-z])/g, 'o'); // O'Donohoe = O Donohoe = ODonohoe

// Of two spellings, the one with the fadas, then the one with the apostrophe
// (O'Donohoe), then the one already held.
const fadas = (s) => (String(s || '').normalize('NFD').match(MARKS) || []).length;
const apos = (s) => (/\bO['’]/.test(String(s || '')) ? 1 : 0);
export const betterName = (held, other) => ((fadas(other) - fadas(held) || apos(other) - apos(held)) > 0 ? other : held);
