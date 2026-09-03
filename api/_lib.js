// Delad kod för /api/cal och /api/selection.
//
// Schemat: archive/*.ics byggs av sync.py och committas av GitHub Actions.
// Funktionen läser dem direkt ur repot vid varje anrop, så en ny sync syns utan
// att appen deployas om.
//
// Det avmarkerade: en JSON-post i Upstash Redis (eget konto, REST över HTTP, så
// ingen klientbiblioteksberoende behövs).

const REPO = process.env.GITHUB_REPO || "oscarrosengren/schema-app";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const KEY = process.env.HIDDEN_KEY || "schema:hidden";
const EMPTY = { courses: [], events: [] };

export const canWrite = () => Boolean(REDIS_URL && REDIS_TOKEN);

/** Kör ett Redis-kommando, t.ex. ["GET", "schema:hidden"]. */
async function redis(command) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${REDIS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).result;
}

/** Hämta en arkivfil, t.ex. "schema" eller "reglerteknik-ii". */
export async function fetchArchive(name) {
  if (!/^[a-z0-9-]{1,80}$/.test(name)) return null;
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/archive/${name}.ics`);
  return r.ok ? await r.text() : null;
}

/**
 * Läs listan över dolda kurser och pass. Går något fel svarar vi "inget dolt":
 * en ofiltrerad kalender är bättre än en trasig, och Google raderar hellre inget
 * än allt.
 */
export async function readHidden() {
  if (!canWrite()) return { hidden: EMPTY };
  try {
    const value = await redis(["GET", KEY]);
    return { hidden: value ? normalize(JSON.parse(value)) : EMPTY };
  } catch {
    return { hidden: EMPTY };
  }
}

export async function writeHidden(hidden) {
  await redis(["SET", KEY, JSON.stringify(hidden)]);
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
