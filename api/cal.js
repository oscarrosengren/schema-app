// GET /cal/<namn>.ics   – kalendern som Google prenumererar på, utan det du
//                         avmarkerat i appen.
// GET /cal/<namn>.ics?all=1 – ofiltrerad; appen använder den för att kunna visa
//                         dolda pass nedtonade och ta tillbaka dem.
import { fetchArchive, filterIcs, readHidden } from "./_lib.js";

export default async function handler(req, res) {
  // Rewriten skickar hela filnamnet, t.ex. "reglerteknik-ii.ics".
  const name = String(req.query.name || req.query.file || "schema.ics")
    .replace(/\.ics$/i, "");
  const text = await fetchArchive(name);
  if (text === null) {
    res.status(404).setHeader("content-type", "text/plain; charset=utf-8");
    return res.end(`Ingen kalender heter "${name}".\n`);
  }

  const all = req.query.all === "1";
  const body = all ? text : filterIcs(text, (await readHidden()).hidden);

  res.setHeader("content-type", "text/calendar; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", all
    ? "no-store"
    : "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  res.status(200).end(body);
}
