// GET /cal/<namn>.ics   – kalendern som Google prenumererar på, utan det du
//                         avmarkerat i appen.
// GET /cal/<namn>.ics?all=1 – ofiltrerad; appen använder den för att kunna visa
//                         dolda pass nedtonade och ta tillbaka dem.
// GET /cal/utan-<kurs>+<kurs>.ics – hela schemat utan de kurserna, för att ge
//                         bort. <kurs> är samma namn som kursens egen kalenderfil,
//                         t.ex. /cal/utan-reglerteknik-ii+industriell-ekonomi.ics
import { createHash } from "node:crypto";
import { fetchArchive, filterIcs, logFetch, readHidden, readProp, splitIcs } from "./_lib.js";

// Samma som slug() i sync.py, så länkarna matchar kurskalendrarnas filnamn.
function slug(name) {
  let s = name.toLowerCase();
  for (const [a, b] of [["å", "a"], ["ä", "a"], ["ö", "o"], ["é", "e"], ["ü", "u"]]) {
    s = s.replaceAll(a, b);
  }
  return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 45).replace(/-+$/, "");
}

/** Vik en ICS-rad så ingen rad överskrider 75 oktetter (RFC 5545 3.1). */
function fold(line, nl) {
  const out = [];
  let cur = "", size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join(nl + " ");
}

/**
 * Bygg en "utan"-kalender ur schema.ics. null om någon kurs inte finns, så ett
 * felstavat namn ger 404 istället för en kalender som tyst innehåller allt.
 */
function without(text, slugs) {
  const courses = new Map();
  for (const b of splitIcs(text).blocks) {
    const course = readProp(b, "X-COURSE");
    if (course) courses.set(slug(course), course);
  }
  const exclude = slugs.map(s => courses.get(s));
  if (!slugs.length || exclude.includes(undefined)) return null;
  // Eget UID-rum per kombination, annars slår Google/Apple ihop passen med
  // schema.ics om någon prenumererar på båda (se README om UID).
  const tag = createHash("sha1").update([...slugs].sort().join("+")).digest("hex").slice(0, 6);
  const { nl } = splitIcs(text);
  const calname = `X-WR-CALNAME:Schema utan ${exclude.join(", ").replace(/,/g, "\\,")}`;
  return filterIcs(text, { courses: exclude, events: [] })
    .replace(/^X-WR-CALNAME:.*$/m, () => fold(calname, nl))
    .replace(/^(UID:[^.@\r\n]+)\.[0-9a-f]+@/gm, `$1.${tag}@`);
}

export default async function handler(req, res) {
  // Rewriten skickar hela filnamnet, t.ex. "reglerteknik-ii.ics".
  const name = String(req.query.name || req.query.file || "schema.ics")
    .replace(/\.ics$/i, "");
  const utan = name.match(/^utan-(.+)$/);
  let text = await fetchArchive(utan ? "schema" : name);
  if (text !== null && utan) text = without(text, utan[1].split(/[+ ]/));
  if (text === null) {
    res.status(404).setHeader("content-type", "text/plain; charset=utf-8");
    return res.end(`Ingen kalender heter "${name}".\n`);
  }

  const all = req.query.all === "1";
  // Logga vem som hämtar, så det går att se att Google faktiskt prenumererar.
  console.log(`cal ${name}${all ? " (ofiltrerad)" : ""} ua=${req.headers["user-agent"] || "-"}`);
  if (!all) await logFetch(name, req.headers["user-agent"]);
  const body = all ? text : filterIcs(text, (await readHidden()).hidden);

  res.setHeader("content-type", "text/calendar; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", all
    ? "no-store"
    : "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  res.status(200).end(body);
}
