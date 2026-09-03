// GET /api/fetches – vilka som hämtat kalendrarna senast. Svarar bara med
// tidpunkt, kalendernamn och user-agent; inga IP-adresser sparas.
import { readFetches } from "./_lib.js";

export default async function handler(req, res) {
  const rows = await readFetches();
  const google = rows.filter(r => /Google/i.test(r));
  res.setHeader("cache-control", "no-store");
  res.status(200).json({
    antal: rows.length,
    google_hamtningar: google.length,
    senaste_google: google[0] || null,
    rader: rows,
  });
}
