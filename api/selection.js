// GET  /api/selection – vad som är avmarkerat just nu
// PUT  /api/selection – spara. Lagras som hidden.json i GitHub-repot.
//
// Skrivningen är öppen, precis som kalenderlänkarna. Därför tas bara id:n och
// kursnamn emot som faktiskt finns i arkivet: det enda någon kan göra med
// endpointen är att dölja eller visa dina egna pass, inte lägga in något nytt.
import { canWrite, knownIds, normalize, readHidden, writeHidden } from "./_lib.js";

const MAX = 4000;

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, PUT, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("cache-control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    const { hidden } = await readHidden();
    return res.status(200).json({ ...hidden, canWrite: canWrite() });
  }

  if (req.method !== "PUT") {
    res.setHeader("allow", "GET, PUT, OPTIONS");
    return res.status(405).json({ error: "Använd GET eller PUT." });
  }

  if (!canWrite()) {
    return res.status(503).json({
      error: "Ingen GITHUB_TOKEN satt, så servern kan inte spara. "
           + "Valet gäller bara i den här webbläsaren.",
    });
  }

  const wanted = normalize(typeof req.body === "string" ? safeParse(req.body) : req.body);
  if (wanted.courses.length + wanted.events.length > MAX) {
    return res.status(413).json({ error: "För många poster." });
  }

  const { ids, courses } = await knownIds();
  const hidden = {
    events: wanted.events.filter(id => ids.has(id)).sort(),
    courses: wanted.courses.filter(c => courses.has(c)).sort(),
  };
  const skipped = (wanted.events.length - hidden.events.length)
                + (wanted.courses.length - hidden.courses.length);

  try {
    const { sha } = await readHidden();
    await writeHidden(hidden, sha);
  } catch (err) {
    return res.status(502).json({ error: `Kunde inte spara: ${err.message}` });
  }
  return res.status(200).json({ ...hidden, canWrite: true, skipped });
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
