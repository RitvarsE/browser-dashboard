// api/games.js — Vercel serverless funkcija
// -------------------------------------------
// Nolasa atvērtās lāzertaga spēles no https://lt.gnl.lv/applications
// servera pusē (lai apietu CORS) un atdod tās lapai kā JSON uz /api/games.
//
// SVARĪGI: dati tiek "scrapoti" no lapas HTML, nevis no oficiāla API.
// Ja gnl.lv lapu pārtaisa, parsēšanas stratēģijas (skat. parseGames) būs
// jāpielāgo. Rezultāts tiek kešots 5 minūtes, lai nedauzītu avota lapu.

const SOURCE_URL = 'https://lt.gnl.lv/applications';
const CACHE_MS = 5 * 60 * 1000; // 5 minūtes
const FETCH_TIMEOUT_MS = 10000;

// Vienkāršs atmiņas kešs. Dzīvo tik ilgi, cik funkcijas instance ir "silta".
// Serverless vidē tas nav garantēts, bet ar to pietiek, lai izlīdzinātu
// slodzi karstajā periodā.
let cache = { at: 0, payload: null };

module.exports = async function handler(req, res) {
  // Atļaujam CORS, lai /api/games var atvērt un pārbaudīt arī tieši.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_MS) {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.status(200).json({ ...cache.payload, cached: true });
    return;
  }

  try {
    const html = await fetchHtml(SOURCE_URL);
    const games = parseGames(html);

    const payload = {
      source: SOURCE_URL,
      updated: new Date().toISOString(),
      count: games.length,
      games,
      cached: false,
    };

    cache = { at: now, payload };
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.status(200).json(payload);
  } catch (err) {
    // Ja avots nokrīt, atdodam pēdējos zināmos datus (ja ir), citādi kļūdu.
    if (cache.payload) {
      res.status(200).json({
        ...cache.payload,
        cached: true,
        stale: true,
        error: String(err && err.message ? err.message : err),
      });
      return;
    }
    res.status(502).json({
      source: SOURCE_URL,
      updated: new Date().toISOString(),
      count: 0,
      games: [],
      error: String(err && err.message ? err.message : err),
    });
  }
};

// --- Tīkls ---------------------------------------------------------------

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Daļa lapu bloķē pieprasījumus bez "pārlūka" galvenēm.
        'User-Agent':
          'Mozilla/5.0 (compatible; gnl-dashboard/1.0; +https://vercel.com)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'lv,en;q=0.8',
      },
    });
    if (!resp.ok) {
      throw new Error(`Avota lapa atbildēja ar HTTP ${resp.status}`);
    }
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

// --- Parsēšana -----------------------------------------------------------

// Mēģina vairākas stratēģijas pēc kārtas. Pirmā, kas kaut ko atrod, uzvar.
// Tā kā precīzais lapas HTML no izstrādes vides nebija pieejams, stratēģijas
// ir apzināti "izturīgas" un vispārīgas.
function parseGames(html) {
  const strategies = [
    extractFromNextData,
    parseTable,
    parseByMarkers,
    parseRepeatedBlocks,
  ];
  for (const strat of strategies) {
    try {
      const games = strat(html);
      if (games && games.length) return games;
    } catch (_) {
      // Ejam uz nākamo stratēģiju.
    }
  }
  return [];
}

// 1) Next.js / iegultā JSON. Daudzas modernas lapas ievieto datus
//    <script id="__NEXT_DATA__" type="application/json"> vai līdzīgā blokā.
function extractFromNextData(html) {
  const scripts = [
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/i,
  ];
  for (const re of scripts) {
    const m = html.match(re);
    if (!m) continue;
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (_) {
      continue;
    }
    const arr = findGameArray(data);
    if (arr && arr.length) return arr.map(normalizeObject);
  }
  return [];
}

// Rekursīvi meklē masīvu ar objektiem, kas "izskatās pēc spēlēm"
// (satur laika/vietas/spēlētāju atslēgas).
function findGameArray(node, depth = 0) {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    const looksLikeGames =
      node.length > 0 &&
      node.every((x) => x && typeof x === 'object' && !Array.isArray(x)) &&
      node.some((x) => objectLooksLikeGame(x));
    if (looksLikeGames) return node;
    for (const item of node) {
      const found = findGameArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const found = findGameArray(node[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function objectLooksLikeGame(obj) {
  const keys = Object.keys(obj).join(' ').toLowerCase();
  return /(date|datum|time|laik|arena|arēn|location|viet|player|spēlēt|spelet|game|spēl|spel|team|komand|status|slot)/.test(
    keys
  );
}

// 2) HTML tabula. Ja spēles ir sarindotas <table> ar galveni, izmantojam
//    galvenes nosaukumus kā lauku vārdus.
function parseTable(html) {
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const table = tableMatch[0];

  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  if (rows.length < 2) return [];

  const headerCells = getCells(rows[0], /<th[\s\S]*?<\/th>/gi);
  const headers =
    headerCells.length > 0 ? headerCells.map(cleanFieldName) : null;

  const games = [];
  for (let i = headers ? 1 : 0; i < rows.length; i++) {
    const cells = getCells(rows[i], /<td[\s\S]*?<\/td>/gi);
    if (!cells.length || cells.every((c) => !c)) continue;
    const obj = {};
    cells.forEach((cell, idx) => {
      const key = headers && headers[idx] ? headers[idx] : `col${idx + 1}`;
      obj[key] = cell;
    });
    // Mēģinām noķert saiti uz spēli.
    const link = rows[i].match(/href="([^"]+)"/i);
    if (link) obj.url = absoluteUrl(link[1]);
    games.push(normalizeObject(obj));
  }
  return games;
}

function getCells(rowHtml, cellRe) {
  return [...rowHtml.matchAll(cellRe)].map((m) => stripTags(m[0]));
}

// 3) Marķieri. lt.gnl.lv kartītes sākas ar tekstu "Pieteikties uz:", tāpēc
//    sadalām HTML pēc šī marķiera un no katra gabala izvelkam tekstu + saiti.
//    Lauku atpazīšana notiek klienta pusē (index.html), tāpēc šeit pietiek
//    ar visu kartītes tekstu vienā laukā.
const STATUS_WORD =
  '(Atvērts|Atvērta|Atvērtā|Slēgts|Slēgta|Slēgtā|Aizvērts|Aizvērta|Pilns|Notiek|Gaida|Beidzies|Open|Closed|Full)';

function parseByMarkers(html) {
  const markerRe = /Pieteikties\s+uz/gi;
  const positions = [];
  let mm;
  while ((mm = markerRe.exec(html)) !== null) positions.push(mm.index);
  if (!positions.length) return [];

  const trailingBadge = new RegExp('\\s*' + STATUS_WORD + '\\s*$', 'i');
  // Nozīmīte kā atsevišķs elementa teksts, piem. <span ...>Atvērts</span>.
  const badgeEl = new RegExp('>\\s*' + STATUS_WORD + '\\s*<', 'gi');

  const games = [];
  for (let i = 0; i < positions.length; i++) {
    const marker = positions[i];
    // Kartītes ķermenis: no šīs kartītes marķiera līdz nākamajam.
    const end =
      i + 1 < positions.length
        ? positions[i + 1]
        : Math.min(html.length, marker + 4000);

    let text = stripTags(html.slice(marker, end));
    // Ķermeņa beigās parasti pielīp nākamās kartītes nozīmīte — nogriežam to.
    text = text.replace(trailingBadge, '').trim();
    if (text.length < 3) continue;

    // Šīs kartītes nozīmīte atrodas PIRMS marķiera — meklējam tuvāko statusa
    // elementu iepriekšējā gabalā (starp iepriekšējo un šo marķieri).
    const before = html.slice(i > 0 ? positions[i - 1] : 0, marker);
    const badges = [...before.matchAll(badgeEl)];
    const badge = badges.length ? badges[badges.length - 1][1] : null;

    // "raw" — pilns kartītes teksts lauku atpazīšanai klienta pusē.
    const obj = { raw: (badge ? badge + ' ' : '') + text };
    if (badge) obj.status = badge; // nepārprotams statuss no nozīmītes
    // Saiti ("Pieteikties" poga) meklējam tikai no marķiera uz priekšu.
    const link = html.slice(marker, end).match(/href="([^"]+)"/i);
    if (link) obj.url = absoluteUrl(link[1]);
    games.push(obj);
  }
  return games;
}

// 4) Atkārtoti bloki. Meklējam elementus ar klasi, kas satur atslēgvārdus
//    (application, game, event, card, row, item) un no katra izvelkam tekstu.
function parseRepeatedBlocks(html) {
  const body = html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ');
  const blockRe =
    /<(?:li|article|div|tr)[^>]*class="[^"]*(?:application|game|event|match|booking|card|list-item|row|item)[^"]*"[^>]*>([\s\S]*?)<\/(?:li|article|div|tr)>/gi;

  const games = [];
  let m;
  while ((m = blockRe.exec(body)) !== null && games.length < 100) {
    const inner = m[1];
    const text = stripTags(inner);
    if (!text || text.length < 3) continue;

    const obj = { raw: text };
    const link = inner.match(/href="([^"]+)"/i);
    if (link) obj.url = absoluteUrl(link[1]);
    games.push(obj);
  }
  return games;
}

// --- Palīgi --------------------------------------------------------------

// Sakārto objektu: notīra tukšumus, izmet tukšas vērtības, saglabā url.
function normalizeObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string') {
      const t = v.replace(/\s+/g, ' ').trim();
      if (t) out[k] = t;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // Saplacinām seklu ligzdotu objektu (piem., {name: "..."}).
      const flat = normalizeObject(v);
      for (const [fk, fv] of Object.entries(flat)) {
        if (!(fk in out)) out[fk] = fv;
      }
    }
  }
  return out;
}

function cleanFieldName(s) {
  return (
    stripTags(s)
      .toLowerCase()
      .replace(/[^a-z0-9āčēģīķļņšūž]+/gi, '_')
      .replace(/^_+|_+$/g, '') || 'lauks'
  );
}

function absoluteUrl(href) {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/')) return 'https://lt.gnl.lv' + href;
  return 'https://lt.gnl.lv/' + href.replace(/^\.?\//, '');
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}
