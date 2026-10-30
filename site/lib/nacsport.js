// Turns a Nacsport export (the JSON inside a .nac_to_import file) into rows for
// the events table, in the same shape the match dashboard reads.
//
// Two tagging templates are understood:
//   "TA/TB"      categories like "TA POSS", "TB SHOT (P)", "TA KICKOUT"
//                (TA is Roscommon in the county analysis files)
//   "HOME/AWAY"  categories like "HOME SHOT", "AWAY KICK OUT", "HOME TURNOVER LOST"
//   "OUR/OPP"    categories like "OUR POSSESSION", "OPP SHOT FROM PLAY", "WINBACK",
//                "TACKLE" (OUR is Roscommon; won/lost is always from our side;
//                names are always our players; HIGH/MIDDLE/LOW is our end-to-end)
// Anything else is kept in the event log with its original name.

const MISS = ['WIDE', 'SHORT', 'BLOCK', 'BLOCKED', 'SAVE', 'SAVED', 'POST', 'OFF POST', 'OUT FOR 45', 'SHORT_SAVE_BLOCK', 'MISS'];
const SOURCES = {
  'FROM KO OWN': 'Own Kickout',
  'FROM KO OPP': 'Opp Kickout',
  'FROM TURNOVER': 'Turnover',
  'FROM THROW IN': 'Throw Up',
  'FROM SHOT': 'Rebound',
  'FROM FREE': 'Free',
};
const AREAS = {
  'INSIDE 45': 'Inside 45', 'MID 45': 'Mid 45', 'DEF 45': 'Def 45',
  'OWN THIRD': 'Own Third', 'DEFENSIVE THIRD': 'Own Third', 'MIDDLE THIRD': 'Middle Third',
  'ATTACKING THIRD': 'Attacking Third', 'OPP THIRD': 'Attacking Third',
};
const TURNOVER_TYPES = {
  'LOST BALL IN TACKLE': 'Lost in tackle',
  'KICKPASS -': 'Kick pass',
  'HANDPASS -': 'Hand pass',
  'FROM SHOT': 'From shot',
  'HANDLING': 'Handling',
  'FOUL': 'Foul',
  'FOUL THE BALL': 'Foul',
  'WIDE': 'From shot',
};
const KNOWN = new Set([
  ...MISS, ...Object.keys(SOURCES), ...Object.keys(AREAS), ...Object.keys(TURNOVER_TYPES),
  'POINT', '2 POINT', 'GOAL', 'SCORE', 'GOAL CHANCE', '1ST HALF', '2ND HALF', 'TOTAL',
  'WON', 'LOST', 'LONG', 'SHORT', 'MEDIUM', 'LONG KO', 'SHORT KO', 'MEDIUM KO',
  'WON CLEAN', 'WON BREAK', 'LOST CLEAN', 'LOST BREAK', 'YELLOW', 'RED', 'BLACK',
  'TA CLEAN', 'TB CLEAN', 'TA BREAK', 'TB BREAK', 'TA SL', 'TB SL', 'TA FREE', 'TB FREE',
]);
const SKIP_CATS = /^CLIP\b/;
const title = (s) =>
  s.toLowerCase()
    .replace(/(^|[\s(\-'’])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Mc)([a-z])/g, (m, a, b) => a + b.toUpperCase());

// A player name: letters (and ' . -) with at least one space, not a known tag.
const isName = (t) =>
  !KNOWN.has(t) && /^[A-ZÁÉÍÓÚ'’.\- ]+$/i.test(t) && /\s/.test(t.trim()) &&
  !/\b(HALF|KO|BOX|POINT|GOAL|SHOT|FREE|CLEAN|BREAK|INSIDE|ENDS|STARTS|PERIOD|KICKOUT|PASS|POSS|ATT|SCORE|MISS|TURNOVER|WINBACK|UNFORCED|OPP|OUR|SCORABLE|UNSCORABLE|PHASE|PLACED|CHANCE|ATTEMPT|PSR|OPSR|TECHNICAL|THROW|THIRD)\b/i.test(t);
// The OUR/OPP template writes names as "J. CURRAN".
const isInitialName = (t) => /^[A-Z]{1,2}\.\s?[A-Z][A-Z'’ -]+$/.test(t);

const OUROPP = {
  'OUR POSSESSION': ['A', 'POSS'], 'OPP POSSESSION': ['B', 'POSS'],
  'ATTACK': ['A', 'ATTACK'], 'OUR ATTACK': ['A', 'ATTACK'], 'OPP ATTACK': ['B', 'ATTACK'],
  'SHOT FROM PLAY': ['A', 'SHOT (P)'], 'OUR SHOT FROM PLAY': ['A', 'SHOT (P)'], 'OPP SHOT FROM PLAY': ['B', 'SHOT (P)'],
  'SHOT FROM FREE': ['A', 'SHOT (F)'], 'OUR SHOT FROM FREE': ['A', 'SHOT (F)'], 'OPP SHOT FROM FREE': ['B', 'SHOT (F)'],
  'OUR KICKOUT': ['A', 'KICKOUT'], 'OPPONENT KICKOUT': ['B', 'KICKOUT'], 'OPP KICKOUT': ['B', 'KICKOUT'],
  'TURNOVER': ['A', 'TURNOVER'], 'UNFORCED TO': ['A', 'TURNOVER', 'Unforced'],
  'WINBACK': ['B', 'TURNOVER', null, true], 'UNFORCED WB': ['B', 'TURNOVER', 'Unforced', true],
  'FREE WON': ['A', 'FREE WON'], 'FREE CONCEDED': ['A', 'FOUL'],
  'OUR CARD': ['A', 'CARD'], 'OPP CARD': ['B', 'CARD'],
  'TACKLE': ['A', 'TACKLE'], 'ASSIST': ['A', 'ASSIST'],
  'SHOT FROM 45': ['A', '45'], 'OUR SHOT FROM 45': ['A', '45'], 'OPP SHOT FROM 45': ['B', '45'],
  'SHOT FROM MARK': ['A', 'SHOT (M)'], 'OUR SHOT FROM MARK': ['A', 'SHOT (M)'], 'OPP SHOT FROM MARK': ['B', 'SHOT (M)'],
  'THROW IN WON': ['A', 'THROW IN'], 'THROW IN LOST': ['B', 'THROW IN'],
};
const OUROPP_SKIP = /^(OUR|OPP) KO RESULT$/;

// "PS OUR KICKOUT", "OPS OPP TO", "WINBACK SO"... -> a possession source, from the side's view.
function ouroppSource(phrase, side) {
  const p = phrase.replace(/^(PS|OPS) /, '').replace(/ SO$/, '').trim();
  const ours = side === 'A';
  if (/\b(WINBACK|TURNOVER|TO|WB|UNFORCED)\b/.test(p)) return 'Turnover';
  if (p === 'OUR KICKOUT') return ours ? 'Own Kickout' : 'Opp Kickout';
  if (p === 'OPP KICKOUT') return ours ? 'Opp Kickout' : 'Own Kickout';
  if (p === 'OUR SHOT SHORT') return ours ? 'Rebound' : 'Opp shot dropped short';
  if (p === 'OPP SHOT SHORT') return ours ? 'Opp shot dropped short' : 'Rebound';
  if (p === 'THROW IN') return 'Throw Up';
  if (/TECHNICAL FREE/.test(p)) return 'Free';
  return null;
}

export function readTables(json) {
  const tabs = {};
  for (const v of Object.values(json || {})) {
    if (v && typeof v === 'object' && 'table' in v) tabs[v.table] = Object.values(v.fields || {});
  }
  if (!tabs.Mediciones) throw new Error('This file has no tagged events (no "Mediciones" table). Is it a Nacsport analysis export?');
  return tabs;
}

const COUNTIES = ['Antrim', 'Armagh', 'Carlow', 'Cavan', 'Clare', 'Cork', 'Derry', 'Donegal', 'Down', 'Dublin', 'Fermanagh', 'Galway',
  'Kerry', 'Kildare', 'Kilkenny', 'Laois', 'Leitrim', 'Limerick', 'Longford', 'Louth', 'Mayo', 'Meath', 'Monaghan', 'Offaly',
  'Roscommon', 'Sligo', 'Tipperary', 'Tyrone', 'Waterford', 'Westmeath', 'Wexford', 'Wicklow', 'London', 'New York'];

// Guess teams, date, competition and stage from the file name.
export function guessFromName(name = '', videoName = '') {
  const clean = (x) => x.replace(/\.(json|nac_to_import|mp4|mov)$/i, '').replace(/_/g, ' ').replace(/\(.*?\)/g, ' ').replace(/[.\s]+$/, '').trim();
  let base = clean(name);
  const vs = /^(.*?)\s+(?:v|vs|v\.|versus)\s+(.+)$/i;
  // No "A v B" in the file name? Use the video's name instead.
  if (!vs.test(base) && vs.test(clean(videoName))) base = clean(videoName);
  const m = base.match(vs);
  let home = '', away = '';
  if (m) {
    home = m[1].trim().split(/\s+/).pop();
    away = m[2].trim().split(/\s+/)[0];
  }
  let date = '';
  const both = `${videoName} ${base}`.replace(/_/g, ' ');
  const d8 = both.match(/(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?!\d)/);
  const d6 = both.match(/(?:^|[^\d])(\d{2})(\d{2})(\d{2})(?!\d)/);
  const ok = (m) => m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31;
  const dmy = `${clean(name)} ${clean(videoName)}`.match(/(?:^|\D)(\d{2})[ .-](\d{2})[ .-](\d{2}|\d{4})(?!\d)/);
  if (ok(d8)) date = `${d8[1]}-${d8[2]}-${d8[3]}`;
  else if (dmy && +dmy[2] >= 1 && +dmy[2] <= 12 && +dmy[1] >= 1 && +dmy[1] <= 31) {
    date = `${dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]}-${dmy[2]}-${dmy[1]}`;
  } else if (ok(d6)) date = `20${d6[1]}-${d6[2]}-${d6[3]}`;

  const u = base.toUpperCase();
  let competition = '';
  if (!home && !away) {
    // One county named on its own (e.g. "Mayo_Rd1_Total"): Roscommon v that county.
    const c = COUNTIES.find((x) => new RegExp(`\\b${x}\\b`, 'i').test(base) && !/roscommon/i.test(x));
    if (c) { home = 'Roscommon'; away = c; }
  }
  if (/\bNFL\d*|\bLEAGUE\b/.test(u)) competition = 'National Football League';
  else if (/\bAI[C]?\b|ALL[- ]IRELAND/.test(u)) competition = 'All-Ireland SFC';
  else if (/\bCSFC\b|CONNACHT/.test(u)) competition = 'Connacht SFC';
  else if (/\bFBD\b/.test(u)) competition = 'FBD League';

  let stage = '';
  const r = u.match(/\bNFL\s?(\d+)\b|\bRD?\s?(\d+[AB]?)\b|\bROUND\s?(\d+[AB]?)\b|\bCHAMP\s?(\d+)\b/);
  if (/\bFINAL\b/.test(u)) stage = /SEMI/.test(u) ? 'Semi-final' : /QUARTER/.test(u) ? 'Quarter-final' : 'Final';
  else if (/\bSF\b|SEMI/.test(u)) stage = 'Semi-final';
  else if (/\bQF\b|QUARTER/.test(u)) stage = 'Quarter-final';
  else if (r) stage = `Round ${r[1] || r[2] || r[3] || r[4]}`;

  return { home, away, date, competition, stage, code: base };
}

// Main entry: json = parsed export; names = { A, B } display names for each side.
export function parseNacsport(json, { names = { A: 'Team A', B: 'Team B' }, fileName = '' } = {}) {
  const tabs = readTables(json);
  const video = (tabs.Videos || [])[0] || {};
  const fps = Number(video.fps) > 0 ? Number(video.fps) : 25;
  const meds = [...tabs.Mediciones].sort((a, b) => a.TI - b.TI || a['Id_Medición'] - b['Id_Medición']);
  const tags = new Map();
  for (const d of tabs.DesTex || []) {
    const k = d.idm;
    if (!tags.has(k)) tags.set(k, []);
    tags.get(k).push(String(d.DesTexto || '').trim().toUpperCase());
  }
  const tagsOf = (m) => tags.get(m['Id_Medición']) || [];

  const cats = new Set(meds.map((m) => m.Categoria));
  const template = [...cats].some((c) => /^T[AB]\s/.test(c)) ? 'TA/TB'
    : [...cats].some((c) => /^(HOME|AWAY)\s/.test(c)) ? 'HOME/AWAY'
    : [...cats].some((c) => /^(OUR|OPP|OPPONENT)\s/.test(String(c).toUpperCase())) ? 'OUR/OPP' : 'Unknown';

  // ---- Halves and quarters -------------------------------------------------
  const obs = (m) => String(m.Observacion || '').toUpperCase();
  const throwIns = meds.filter((m) => m.Categoria === 'THROW IN').map((m) => m.TI);
  const markers = meds.filter((m) => /PERIOD|Q[1-4]/.test(obs(m)));
  const markerAt = (re) => markers.find((m) => re.test(obs(m)))?.TI;

  let halfStarts;
  if (throwIns.length >= 2) halfStarts = [throwIns[0], throwIns[1]];
  else if (markers.length) {
    halfStarts = [markerAt(/PERIOD 1|Q1 /) ?? meds[0].TI, markerAt(/PERIOD 2 STARTS|Q3 BEGINS|Q3 STARTS/)];
  } else halfStarts = [throwIns[0] ?? meds[0].TI, undefined];

  const tagHalf = (m) => {
    const t = tagsOf(m);
    if (t.includes('1ST HALF') || t.includes('1ST H')) return 1;
    if (t.includes('2ND HALF') || t.includes('2ND H')) return 2;
    return null;
  };
  // If no 2nd-half start was marked, use the first event tagged 2ND HALF.
  if (halfStarts[1] == null) {
    const first2 = meds.find((m) => tagHalf(m) === 2);
    if (first2) halfStarts[1] = first2.TI;
  }
  const halfOf = (m) => tagHalf(m) || (halfStarts[1] != null && m.TI >= halfStarts[1] ? 2 : 1);

  const halfEnd = [1, 2].map((h) => Math.max(...meds.filter((m) => halfOf(m) === h).map((m) => m.TI), 0));
  const qMarks = { Q2: markerAt(/Q2 BEGINS|Q2 STARTS/), Q4: markerAt(/Q4 BEGINS|Q4 STARTS/) };
  const quarterOf = (m) => {
    const h = halfOf(m);
    const start = h === 1 ? halfStarts[0] : halfStarts[1] ?? halfStarts[0];
    const mid = h === 1 ? qMarks.Q2 : qMarks.Q4;
    const split = mid ?? start + (halfEnd[h - 1] - start) / 2;
    return h === 1 ? (m.TI < split ? 'Q1' : 'Q2') : (m.TI < split ? 'Q3' : 'Q4');
  };
  const minuteOf = (m) => {
    const h = halfOf(m);
    const start = h === 1 ? halfStarts[0] ?? 0 : halfStarts[1] ?? 0;
    return Math.max(0, Math.round(((m.TI - start) / fps / 60) * 10) / 10);
  };

  // ---- Events --------------------------------------------------------------
  const events = [];
  const warnings = [];
  const unmapped = new Set();

  for (const m of meds) {
    const cat = String(m.Categoria || '').trim().toUpperCase();
    if (!cat || SKIP_CATS.test(cat)) continue;
    if (template === 'OUR/OPP' && OUROPP_SKIP.test(cat)) continue;
    let t = tagsOf(m);
    const ouropp = template === 'OUR/OPP';
    let players = ouropp
      ? [...new Set(t.filter(isInitialName))].map(title)
      : [...new Set([...t.filter(isName), ...(isName(obs(m)) ? [obs(m)] : [])])].map(title);

    let side = null, rest = cat, ooType = null, winback = false;
    const sm = cat.match(/^(TA|TB|HOME|AWAY)\s+(.*)$/);
    if (sm) { side = sm[1] === 'TA' || sm[1] === 'HOME' ? 'A' : 'B'; rest = sm[2].trim(); }
    if (ouropp && OUROPP[cat]) [side, rest, ooType, winback] = OUROPP[cat];
    const other = side === 'A' ? 'B' : side === 'B' ? 'A' : null;
    if (ouropp) {
      // Normalise this template's tags to the shared vocabulary.
      t = t.flatMap((x) => (x === '2 POINT SCORE' ? ['2 POINT'] : x === 'POINT FROM PLACED' ? ['POINT'] : [x]));
    }

    const ev = {
      side,
      event_type: title(rest),
      outcome: null,
      half: halfOf(m) === 1 ? '1st Half' : '2nd Half',
      minute: minuteOf(m),
      start_sec: Math.round((m.TI / fps) * 10) / 10,
      end_sec: Math.round(((m.TF || m.TI) / fps) * 10) / 10,
      player_no: null,
      code: m.Categoria,
      labels: { Half: halfOf(m) === 1 ? '1st Half' : '2nd Half', Quarter: quarterOf(m) },
      nac_id: m['Id_Medición'],
    };
    const area = t.find((x) => AREAS[x]);
    if (area) ev.labels.PitchArea = AREAS[area];
    if (ouropp && !area) {
      // HIGH / MIDDLE / LOW run along the pitch from our point of view.
      const hml = t.find((x) => x === 'HIGH' || x === 'MIDDLE' || x === 'LOW');
      if (hml) {
        const ours = { HIGH: 'Attacking Third', MIDDLE: 'Middle Third', LOW: 'Own Third' }[hml];
        ev.labels.PitchArea = side === 'B' ? { 'Attacking Third': 'Own Third', 'Middle Third': 'Middle Third', 'Own Third': 'Attacking Third' }[ours] : ours;
      }
    }
    if (ouropp) {
      const src = t.map((x) => (/^(PS|OPS) /.test(x) || / SO$/.test(x) ? ouroppSource(x, side) : null)).find(Boolean);
      if (src) ev.labels[rest === 'POSS' ? 'PossFrom' : 'Source'] = src;
      if (ooType) ev.labels.TurnoverType = ooType;
      if (winback) {
        // A winback is the other side's turnover; the names are our players who won it.
        if (players.length) ev.labels.WonBackBy = players.join(', ');
        players = [];
      }
    }
    // Hub box number (BOX 0-15): where a kick-out landed or a shot was taken.
    const boxTag = t.find((x) => /^BOX \d+$/.test(x));
    if (boxTag) ev.labels.Zone = title(boxTag);

    if (players.length) { ev.player_no = players[0]; ev.labels.Players = players.join(', '); }

    if (rest === 'POSS') {
      ev.event_type = 'Poss';
    } else if (rest === 'ATTACK') {
      ev.event_type = 'Attack';
    } else if (/^SHOT\b|^45$/.test(rest)) {
      const mark = /\(M\)/.test(rest);
      const placed = /\(F\)/.test(rest) || mark || rest === '45' || t.includes('FROM FREE');
      ev.event_type = rest === '45' ? 'Shot (45)' : mark ? 'Shot (Mark)' : placed ? 'Shot (F)' : 'Shot (P)';
      const missTag = MISS.find((x) => t.includes(x));
      const scored = t.includes('GOAL') || t.includes('POINT') || t.includes('SCORE') || (t.includes('2 POINT') && !missTag);
      ev.outcome = scored
        ? t.includes('GOAL') ? 'Goal' : t.includes('2 POINT') ? '2 Point' : 'Point'
        : missTag ? title(missTag.replace('SHORT_SAVE_BLOCK', 'Short/Save/Block')) : 'No score';
      if (!scored && (t.includes('2 POINT') || t.includes('2 POINT ATTEMPT'))) ev.labels.Attempt = '2 Point';
      if (t.includes('GOAL CHANCE')) ev.labels.GoalChance = 'Yes';
      let src = rest === '45' ? '45' : mark ? 'Mark' : /\(F\)/.test(rest) ? 'Free' : SOURCES[t.find((x) => SOURCES[x])] || ev.labels.Source;
      // The HOME/AWAY template only marks frees, so everything else is open play.
      if (!src && template === 'HOME/AWAY') src = 'From play';
      if (src) ev.labels.Source = src;
    } else if (/^KICK ?OUT$/.test(rest)) {
      ev.event_type = 'Kickout';
      let winner = null, how = null;
      const tok = t.find((x) => /^T[AB] (CLEAN|BREAK|SL|FREE)$/.test(x));
      if (ouropp) {
        // Won / lost is always from our side, whoever kicked it.
        const hv = t.find((x) => /^(WON|LOST) (CLEAN|BREAK)$/.test(x));
        const res = hv || t.find((x) => /^(WON|LOST) KO$/.test(x));
        if (res) winner = res.startsWith('WON') ? 'A' : 'B';
        if (hv) how = title(hv.split(' ')[1]);
        // Names on kick-outs are our players; only credit them when we won it.
        if (winner !== 'A' && players.length) { delete ev.labels.Players; ev.player_no = null; }
      } else if (tok) {
        winner = tok.startsWith('TA') ? 'A' : 'B';
        how = { CLEAN: 'Clean', BREAK: 'Break', SL: 'Sideline', FREE: 'Free' }[tok.split(' ')[1]];
      } else {
        const hv = t.find((x) => /^(WON|LOST) (CLEAN|BREAK)$/.test(x));
        if (hv) { winner = hv.startsWith('WON') ? side : other; how = title(hv.split(' ')[1]); }
        else if (t.includes('WON')) winner = side;
        else if (t.includes('LOST')) winner = other;
      }
      ev.outcome = winner ? `${names[winner]} ${how || 'Unspecified'}` : null;
      const len = t.find((x) => /^(OPP )?(LONG|SHORT|MEDIUM)( KO| KICKOUT)?$/.test(x));
      if (len) ev.labels.KickoutDistance = len.replace(/^OPP /, '')[0] + 'KO';
      const setup = t.find((x) => /^\d-\d/.test(x));
      if (setup) ev.labels.Setup = title(setup);
      if (!winner) warnings.push(`Kick-out at ${ev.minute}′ (${ev.half}) has no winner tagged.`);
    } else if (/^TURNOVER( LOST)?$/.test(rest)) {
      ev.event_type = 'Turnover';
      const ty = t.find((x) => TURNOVER_TYPES[x]);
      if (ty) ev.labels.TurnoverType = TURNOVER_TYPES[ty];
    } else if (rest === 'FREE WON') {
      // Stored as a foul by the other team so "fouls conceded" works for every template.
      ev.event_type = 'Foul';
      ev.side = other;
      ev.labels.FreeWonBy = side;
    } else if (rest === 'FOUL') {
      ev.event_type = 'Foul';
    } else if (rest === 'CARD') {
      ev.event_type = 'Card';
      const c = t.find((x) => ['YELLOW', 'RED', 'BLACK'].includes(x));
      ev.outcome = c ? title(c) : null;
    } else if (rest === 'TACKLE') {
      ev.event_type = 'Tackle';
    } else if (rest === 'ASSIST') {
      ev.event_type = 'Assist';
      const how = t.find((x) => /PASS$/.test(x));
      if (how) ev.labels.How = title(how);
    } else if (cat === 'THROW IN' || rest === 'THROW IN') {
      ev.event_type = 'Throw In';
    } else {
      unmapped.add(cat);
    }
    events.push(ev);
  }

  // Tagged score per side, for the check against the official result.
  const tally = { A: { g: 0, p: 0 }, B: { g: 0, p: 0 } };
  for (const e of events) {
    if (!e.side || !/^Shot/.test(e.event_type)) continue;
    if (e.outcome === 'Goal') tally[e.side].g += 1;
    else if (e.outcome === '2 Point') tally[e.side].p += 2;
    else if (e.outcome === 'Point') tally[e.side].p += 1;
  }

  const counts = {};
  for (const e of events) counts[e.event_type] = (counts[e.event_type] || 0) + 1;
  if (unmapped.size) warnings.push(`Kept in the event log only: ${[...unmapped].join(', ')}.`);
  const halfTagged = meds.some((m) => tagHalf(m));
  if (!throwIns.length && !markers.length && !halfTagged) warnings.push('No throw-in, period or half markers found, so halves and quarters are estimated.');
  else if (!markers.length && halfTagged && !throwIns.length) warnings.push('Halves come from the 1st/2nd half tags; quarters are each half split in two.');

  return {
    template,
    fps,
    events,
    score: tally,
    counts,
    warnings,
    video: video.Nombre_Archivo || '',
    guess: guessFromName(fileName, video.Nombre_Archivo || ''),
  };
}

// ---- Sportscode / Hudl XML -------------------------------------------------
// Reads an XML export (<file><ALL_INSTANCES><instance>…) into the same tables a
// Nacsport export has, so parseNacsport can read it. Times are in seconds.
// Some exports put each half on its own clock starting at 0; the second half
// is then moved to start after the first so the game reads in order.
const unescape = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const XML_FPS = 25;

export function fromSportscodeXml(text, fileName = '') {
  const blocks = text.match(/<instance>[\s\S]*?<\/instance>/g) || [];
  if (!blocks.length) throw new Error('No <instance> entries found in this XML file.');
  const get = (b, tag) => { const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? unescape(m[1].trim()) : ''; };
  const rows = blocks.map((b, i) => ({
    id: Number(get(b, 'ID')) || i + 1,
    start: Number(get(b, 'start')) || 0,
    end: Number(get(b, 'end')) || 0,
    code: get(b, 'code'),
    labels: (b.match(/<label>[\s\S]*?<\/label>/g) || []).map((l) => get(l, 'text')).filter(Boolean),
  })).filter((r) => r.code);

  const halfOf = (r) => {
    const u = r.labels.map((x) => x.toUpperCase());
    if (u.some((x) => x === '1ST H' || x === '1ST HALF')) return 1;
    if (u.some((x) => x === '2ND H' || x === '2ND HALF')) return 2;
    return 0;
  };
  const first = rows.filter((r) => halfOf(r) === 1), second = rows.filter((r) => halfOf(r) === 2);
  let shift = 0;
  if (first.length && second.length) {
    const firstEnd = Math.max(...first.map((r) => r.start));
    const secondStart = Math.min(...second.map((r) => r.start));
    if (secondStart < firstEnd) shift = firstEnd + 60;
  }
  const Mediciones = {}, DesTex = {};
  let d = 0;
  for (const r of rows) {
    const off = halfOf(r) === 2 ? shift : 0;
    Mediciones[r.id] = { Categoria: r.code.toUpperCase(), 'Id_Medición': r.id, TI: Math.round((r.start + off) * XML_FPS), TF: Math.round((r.end + off) * XML_FPS) };
    for (const l of r.labels) DesTex[++d] = { idm: r.id, DesTexto: l };
  }
  return {
    0: { table: 'Mediciones', fields: Mediciones },
    1: { table: 'DesTex', fields: DesTex },
    2: { table: 'Videos', fields: { 1: { fps: XML_FPS, Nombre_Archivo: fileName } } },
  };
}
