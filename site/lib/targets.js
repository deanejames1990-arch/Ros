// Quarter objectives: possessions – shots – scores per quarter.
// Senior: 12-8-6. Other grades have none set yet.
export const QUARTER_TARGETS = { Senior: { poss: 12, shots: 8, scores: 6 } };
export const targetFor = (grade) => QUARTER_TARGETS[grade] || null;
export const targetText = (t) => (t ? `${t.poss}-${t.shots}-${t.scores}` : '');

// Which parts of the target a quarter ({ poss, shots, scores }) met.
export function hit(q, t) {
  if (!t || !q) return null;
  const r = { poss: q.poss >= t.poss, shots: q.shots >= t.shots, scores: q.scores >= t.scores };
  return { ...r, all: r.poss && r.shots && r.scores };
}

// Across many quarters: how often each part was met.
export function hitRates(quarters, t) {
  const qs = quarters.filter(Boolean);
  if (!t || !qs.length) return null;
  const n = qs.length;
  const c = (k) => qs.filter((q) => hit(q, t)[k]).length;
  return { n, poss: c('poss'), shots: c('shots'), scores: c('scores'), all: c('all') };
}
