// Delad kod för /api/cal och /api/selection.
//
// Arkivet (archive/*.ics) byggs av sync.py och committas av GitHub Actions. Den
// här funktionen läser arkivet därifrån vid varje anrop och filtrerar bort det du
// avmarkerat i appen, som ligger i hidden.json i samma repo. Ingen lagring
// behöver skapas: läsning går mot det publika repot, bara skrivning kräver token.

const REPO = process.env.GITHUB_REPO || "oscarrosengren/schema-app";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN || "";
const HIDDEN_FILE = "hidden.json";
const EMPTY = { courses: [], events: [] };

const raw = path =>
  `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`;

const api = (path, init = {}) =>
  fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "schema-app",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      ...(init.headers || {}),
    },
  });

export const canWrite = () => Boolean(TOKEN);

/** Hämta en arkivfil, t.ex. "schema" eller "reglerteknik-ii". */
export async function fetchArchive(name) {
  if (!/^[a-z0-9-]{1,80}$/.test(name)) return null;
  const r = await fetch(raw(`archive/${name}.ics`));
  return r.ok ? await r.text() : null;
}

/**
 * Läs hidden.json. Med token går läsningen via API:et och är alltid färsk;
 * utan token via raw.githubusercontent, som cachar i ca 5 minuter.
 */
export async function readHidden() {
  try {
    if (TOKEN) {
      const r = await api(`contents/${HIDDEN_FILE}?ref=${BRANCH}`, {
        cache: "no-store",
      });
      if (r.status === 404) return { hidden: EMPTY, sha: null };
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      const body = await r.json();
      const text = Buffer.from(body.content, "base64").toString("utf-8");
      return { hidden: normalize(JSON.parse(text)), sha: body.sha };
    }
    const r = await fetch(raw(HIDDEN_FILE));
    if (!r.ok) return { hidden: EMPTY, sha: null };
    return { hidden: normalize(await r.json()), sha: null };
  } catch {
    return { hidden: EMPTY, sha: null };   // hellre ofiltrerad kalender än fel
  }
}

/** Skriv hidden.json som en commit i repot. */
export async function writeHidden(hidden, sha) {
  const content = Buffer.from(
    JSON.stringify(hidden, null, 2) + "\n", "utf-8"
  ).toString("base64");
  const n = hidden.courses.length + hidden.events.length;
  const r = await api(`contents/${HIDDEN_FILE}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Dolda pass: ${n} poster`,
      content,
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
}

export function normalize(value) {
  const list = v => (Array.isArray(v) ? v.filter(x => typeof x === "string") : []);
  return { courses: list(value?.courses), events: list(value?.events) };
}

/* ---------- ICS ---------- */

/**
 * Dela upp en kalender i huvud, VEVENT-block och avslut. Varje block behåller sin
 * avslutande radbrytning, så head + valda block + tail alltid ger en giltig fil.
 */
export function splitIcs(text) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const head = [], blocks = [], tail = [];
  let cur = null;
  for (const line of text.split(nl)) {
    if (cur === null && line === "BEGIN:VEVENT") { cur = [line]; continue; }
    if (cur !== null) {
      cur.push(line);
      if (line === "END:VEVENT") { blocks.push(cur.join(nl) + nl); cur = null; }
      continue;
    }
    (blocks.length ? tail : head).push(line);
  }
  const join = ls => ls.filter(l => l !== "").map(l => l + nl).join("");
  return { head: join(head), blocks, tail: join(tail), nl };
}

/** Läs en egenskap ur ett VEVENT-block, med hänsyn till ICS-radbrytning. */
export function readProp(block, name) {
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  let value = null;
  for (const line of lines) {
    if (value !== null) {
      if (/^[ \t]/.test(line)) { value += line.slice(1); continue; }
      break;
    }
    const m = line.match(/^([A-Za-z0-9-]+)(;[^:]*)?:(.*)$/);
    if (m && m[1].toUpperCase() === name) value = m[3];
  }
  return value === null ? null : value.replace(/\\([,;\\])/g, "$1").trim();
}

/** Ta bort avmarkerade pass ur en kalenderfil. */
export function filterIcs(text, hidden) {
  const { head, blocks, tail } = splitIcs(text);
  if (!blocks.length) return text;
  const courses = new Set(hidden.courses);
  const events = new Set(hidden.events);
  const keep = blocks.filter(b => {
    const uid = readProp(b, "UID");
    const course = readProp(b, "X-COURSE");
    return !(uid && events.has(uid)) && !(course && courses.has(course));
  });
  return head + keep.join("") + tail;
}

/** Alla giltiga pass-id och kursnamn, för att kunna avvisa skräp i PUT. */
export async function knownIds() {
  const text = await fetchArchive("schema");
  const ids = new Set(), courses = new Set();
  if (text) {
    for (const b of splitIcs(text).blocks) {
      const uid = readProp(b, "UID");
      const course = readProp(b, "X-COURSE");
      if (uid) ids.add(uid);
      if (course) courses.add(course);
    }
  }
  return { ids, courses };
}
