/* ---------- ICS parsing ---------- */
function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeIcs(v) {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

// TimeEdit emits UTC stamps (…Z) and floating all-day dates.
function parseIcsDate(value, params) {
  if (params.includes("VALUE=DATE") || /^\d{8}$/.test(value)) {
    const y = +value.slice(0, 4), m = +value.slice(4, 6), d = +value.slice(6, 8);
    return { date: new Date(Date.UTC(y, m - 1, d)), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return { date: z ? new Date(ms) : new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

// TimeEdit summaries look like "<program codes...>, <Course name>.  , <activity>".
// Splitting on commas alone would cut a name like "Teknik, affärsutveckling och
// ledning" in half, so we strip leading segments only when they behave like program
// codes: no spaces, and either containing a digit ("I5", "E4.SES", "MastersIn2") or
// seen in front of two or more different courses ("Entreprenörskolan").
function summaryHead(summary) {
  const m = (summary || "").trim().match(/^(.*)\.\s*,\s*(.*)$/);   // greedy: last ".  ,"
  return m && { head: m[1], type: m[2].trim() };
}

function buildCodeIndex(summaries) {
  const seen = new Map();
  for (const s of summaries) {
    const h = summaryHead(s);
    if (!h) continue;
    const segs = h.head.split(",").map(x => x.trim()).filter(Boolean);
    for (let i = 0; i < segs.length - 1; i++) {
      if (!seen.has(segs[i])) seen.set(segs[i], new Set());
      seen.get(segs[i]).add(segs.slice(i + 1).join(", "));
    }
  }
  return seen;
}

function splitSummary(summary, codeIndex) {
  const h = summaryHead(summary);
  const raw = (summary || "").trim();
  if (!h) return { course: raw || "Okänd", type: "", programs: [] };
  const segs = h.head.split(",").map(x => x.trim()).filter(Boolean);
  const isCode = seg => !/\s/.test(seg) && (/\d/.test(seg) || (codeIndex.get(seg) || new Set()).size > 1);
  let i = 0;
  while (i < segs.length - 1 && isCode(segs[i])) i++;
  return { course: segs.slice(i).join(", ") || "Okänd", type: h.type, programs: segs.slice(0, i) };
}

// A booking with several rooms arrives as one LOCATION with embedded
// newlines: "101156, Grupprum \nPlats: 101168, Grupprum \nPlats: ...".
function cleanLocation(value) {
  return value.split("\n")
    .map(v => v.replace(/^\s*Plats:\s*/, "").trim())
    .filter(Boolean)
    .join("; ");
}

function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text).split("\n")) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur && cur.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [key, ...params] = rawKey.split(";");
    if (key === "DTSTART") { const p = parseIcsDate(value, params); if (p) { cur.start = p.date; cur.allDay = p.allDay; } }
    else if (key === "DTEND") { const p = parseIcsDate(value, params); if (p) cur.end = p.date; }
    else if (key === "SUMMARY") cur.summary = unescapeIcs(value);
    else if (key === "LOCATION") cur.location = cleanLocation(unescapeIcs(value));
    else if (key === "DESCRIPTION") cur.description = unescapeIcs(value);
    else if (key === "UID") cur.uid = value;
    else if (key === "URL") cur.url = value;
  }
  const codeIndex = buildCodeIndex(events.map(e => e.summary));
  for (const e of events) {
    if (!e.end) e.end = new Date(e.start.getTime() + (e.allDay ? 864e5 : 36e5));
    Object.assign(e, splitSummary(e.summary, codeIndex));
    e.note = (e.description || "").split("\n")[0].replace(/^ID \d+$/, "").trim();
  }
  events.sort((a, b) => a.start - b.start);
  return events;
}

/* ---------- time helpers (Europe/Stockholm) ---------- */
const TZ = "Europe/Stockholm";
const fmtTime = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const fmtFull = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "long", year: "numeric", month: "long", day: "numeric" });

// Local wall-clock fields for a date, in Stockholm.
function parts(date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { key: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}

function isoWeek(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7;           // Mon = 0
  dt.setUTCDate(dt.getUTCDate() - dow + 3);        // Thursday of this week
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const fDow = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fDow + 3);
  return { week: 1 + Math.round((dt - firstThu) / 6048e5), year: dt.getUTCFullYear() };
}

function mondayOf(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/* ---------- clash detection ---------- */
// Two timed events clash when they overlap by >0 minutes. All-day entries
// (holidays) are informational and never counted as clashes.
function findClashes(events) {
  const timed = events.filter(e => !e.allDay);
  const pairs = [];
  const clashing = new Set();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j];
      if (b.start >= a.end) break;
      const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (overlap > 0) {
        pairs.push({ a, b, minutes: Math.round(overlap / 6e4) });
        clashing.add(a.uid + a.start); clashing.add(b.uid + b.start);
      }
    }
  }
  return { pairs, clashing };
}

/* ---------- state ---------- */
let EVENTS = [];
let CLASH = { pairs: [], clashing: new Set() };
let removed = loadRemoved();  // course names the user has dropped; persisted
let onlyClashes = false;
let weekStart = null;
let view = "week";
let SOURCES = [];
let focusKeys = new Set();   // events to scroll to + flash after a clash click

const el = id => document.getElementById(id);
const key = e => e.uid + e.start;
const palette = ["#4f7cff", "#e0568a", "#12a594", "#f08c1c", "#8b5cf6", "#0ea5e9", "#65a30d", "#d94f4f", "#0891b2", "#b45309"];

function courses() {
  return [...new Set(EVENTS.filter(e => !e.allDay).map(e => e.course))].sort();
}
function activeCourses() {
  return courses().filter(c => !removed.has(c));
}
function colorOf(course) {
  const list = courses();
  return palette[Math.max(0, list.indexOf(course)) % palette.length];
}

const STORE_KEY = "schema.removedCourses.v1";
function loadRemoved() {
  try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveRemoved() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...removed])); } catch {}
}

// Events left after the user's removals. Clashes are recomputed from this set, so
// dropping a course also drops every clash that only existed because of it.
function remaining() {
  return EVENTS.filter(e => !removed.has(e.course));
}
function visible() {
  const base = remaining();
  return onlyClashes ? base.filter(e => CLASH.clashing.has(key(e))) : base;
}
function recompute() {
  CLASH = findClashes(remaining());
}

/* ---------- rendering ---------- */
function renderFilters() {
  const box = el("filters");
  box.innerHTML = "";
  for (const c of courses()) {
    const off = removed.has(c);
    const n = EVENTS.filter(e => e.course === c).length;
    const b = document.createElement("button");
    b.className = "chip" + (off ? " off" : "");
    b.style.setProperty("--c", colorOf(c));
    b.title = off ? "Klicka för att lägga tillbaka" : "Klicka för att ta bort kursen";
    b.innerHTML = `<span class="dot"></span>${esc(c)} <span class="count">${n}</span><span class="x">${off ? "+" : "×"}</span>`;
    b.onclick = () => {
      off ? removed.delete(c) : removed.add(c);
      saveRemoved();
      recompute();
      render();
    };
    box.appendChild(b);
  }
  if (removed.size) {
    const r = document.createElement("button");
    r.className = "chip restore";
    r.textContent = `↺ Återställ alla (${removed.size} borttagna)`;
    r.onclick = () => { removed.clear(); saveRemoved(); recompute(); render(); };
    box.appendChild(r);
  }
}

function eventCard(e, clash) {
  const d = document.createElement("div");
  d.className = "ev" + (clash ? " clash" : "");
  d.style.setProperty("--c", colorOf(e.course));
  const time = e.allDay ? "Heldag" : `${fmtTime.format(e.start)}–${fmtTime.format(e.end)}`;
  d.innerHTML = `<div class="ev-time">${time}</div>
    <div class="ev-title">${esc(e.course)}</div>
    <div class="ev-meta">${esc([e.type, e.note].filter(Boolean).join(" · "))}</div>
    <div class="ev-meta">${esc(e.location || "")}</div>`;
  d.onclick = () => showDetail(e, clash);
  return d;
}

function esc(s) {
  return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function renderWeek() {
  const grid = el("grid");
  grid.innerHTML = "";
  grid.className = "week";
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const evs = visible();

  const dayEvents = {};
  for (const d of days) dayEvents[d] = [];
  for (const e of evs) {
    const k = parts(e.start).key;
    if (dayEvents[k]) dayEvents[k].push(e);
  }

  // Only render hours that actually contain something (with sane defaults).
  let minM = 8 * 60, maxM = 18 * 60;
  for (const e of evs) {
    const k = parts(e.start).key;
    if (!dayEvents[k] || e.allDay) continue;
    minM = Math.min(minM, parts(e.start).minutes);
    maxM = Math.max(maxM, parts(e.end).minutes || 24 * 60);
  }
  const h0 = Math.floor(minM / 60), h1 = Math.ceil(maxM / 60);
  const PX = 56; // px per hour

  const head = document.createElement("div");
  head.className = "wk-head";
  head.innerHTML = `<div class="gutter"></div>` + days.map(d => {
    const dt = new Date(d + "T12:00:00Z");
    const today = parts(new Date()).key === d;
    const allDay = dayEvents[d].filter(e => e.allDay).map(e => `<div class="allday">${esc(e.course)}</div>`).join("");
    return `<div class="wk-col-head${today ? " today" : ""}"><div>${fmtDay.format(dt)}</div>${allDay}</div>`;
  }).join("");
  grid.appendChild(head);

  const body = document.createElement("div");
  body.className = "wk-body";
  const gutter = document.createElement("div");
  gutter.className = "gutter";
  for (let h = h0; h < h1; h++) {
    const t = document.createElement("div");
    t.className = "hour-label";
    t.style.height = PX + "px";
    t.textContent = String(h).padStart(2, "0") + ":00";
    gutter.appendChild(t);
  }
  body.appendChild(gutter);

  for (const d of days) {
    const col = document.createElement("div");
    col.className = "wk-col";
    col.style.height = (h1 - h0) * PX + "px";
    for (let h = h0; h < h1; h++) {
      const line = document.createElement("div");
      line.className = "hline";
      line.style.top = (h - h0) * PX + "px";
      col.appendChild(line);
    }
    const timed = dayEvents[d].filter(e => !e.allDay).sort((a, b) => a.start - b.start);
    for (const [e, lane, lanes] of layout(timed)) {
      const s = parts(e.start).minutes, en = parts(e.end).minutes || 24 * 60;
      const node = eventCard(e, CLASH.clashing.has(key(e)));
      node.classList.add("abs");
      if (focusKeys.has(key(e))) node.classList.add("focused");
      node.style.top = ((s - h0 * 60) / 60) * PX + "px";
      node.style.height = Math.max(22, ((en - s) / 60) * PX - 2) + "px";
      node.style.left = `calc(${(lane / lanes) * 100}% + 2px)`;
      node.style.width = `calc(${100 / lanes}% - 4px)`;
      col.appendChild(node);
    }
    body.appendChild(col);
  }
  grid.appendChild(body);

  const target = grid.querySelector(".ev.focused");
  if (target) {
    // let layout settle before scrolling, otherwise offsets are still 0
    requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  const wk = isoWeek(weekStart);
  el("range").textContent = `Vecka ${wk.week}, ${wk.year} — ${weekStart} → ${addDays(weekStart, 6)}`;
}

// Side-by-side lanes for overlapping events in one day.
function layout(list) {
  const out = [];
  let cluster = [], clusterEnd = null;
  const flush = () => {
    const lanes = [];
    for (const e of cluster) {
      let i = lanes.findIndex(end => end <= e.start);
      if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = e.end;
      out.push([e, i, 0]);
    }
    const n = lanes.length;
    for (let i = out.length - cluster.length; i < out.length; i++) out[i][2] = n;
    cluster = []; clusterEnd = null;
  };
  for (const e of list) {
    if (clusterEnd && e.start >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = clusterEnd ? new Date(Math.max(clusterEnd, e.end)) : e.end;
  }
  if (cluster.length) flush();
  return out;
}

function renderList() {
  const grid = el("grid");
  grid.className = "list";
  grid.innerHTML = "";
  const evs = visible();
  let lastDay = null;
  for (const e of evs) {
    const k = parts(e.start).key;
    if (k !== lastDay) {
      const h = document.createElement("div");
      h.className = "day-head";
      h.textContent = fmtFull.format(e.start);
      grid.appendChild(h);
      lastDay = k;
    }
    grid.appendChild(eventCard(e, CLASH.clashing.has(key(e))));
  }
  if (!evs.length) grid.innerHTML = '<p class="empty">Inga pass matchar filtret.</p>';
  el("range").textContent = `Alla pass (${evs.length})`;
}

function renderClashes() {
  const box = el("clashlist");
  const pairs = CLASH.pairs;
  el("clashcount").textContent = pairs.length;
  el("copyclash").disabled = !pairs.length;
  box.innerHTML = "";
  if (!pairs.length) {
    box.innerHTML = '<p class="empty">Inga schemakrockar. 🎉</p>';
    return;
  }
  for (const p of pairs) {
    const d = document.createElement("div");
    d.className = "clash-item";
    d.innerHTML = `<div class="clash-when">${fmtFull.format(p.a.start)} · ${p.minutes} min överlapp</div>
      <div class="clash-pair">
        <div><b style="color:${colorOf(p.a.course)}">${esc(p.a.course)}</b><br>
          <span class="sub">${fmtTime.format(p.a.start)}–${fmtTime.format(p.a.end)} · ${esc(p.a.type)} · ${esc(p.a.location || "")}</span></div>
        <div><b style="color:${colorOf(p.b.course)}">${esc(p.b.course)}</b><br>
          <span class="sub">${fmtTime.format(p.b.start)}–${fmtTime.format(p.b.end)} · ${esc(p.b.type)} · ${esc(p.b.location || "")}</span></div>
      </div>`;
    d.onclick = () => goToEvent(p.a, p.b);
    box.appendChild(d);
  }
}

// Jump the week view to a specific pass and flash it (plus whatever it clashes with).
function goToEvent(...evs) {
  view = "week";
  onlyClashes = false;
  el("onlyclash").checked = false;
  weekStart = mondayOf(parts(evs[0].start).key);
  focusKeys = new Set(evs.map(key));
  render();
  clearTimeout(goToEvent.t);
  goToEvent.t = setTimeout(() => {
    focusKeys = new Set();
    document.querySelectorAll(".ev.focused").forEach(n => n.classList.remove("focused"));
  }, 2600);
}


/* ---------- export ---------- */
const fmtDate = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtWeekday = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "short" });

function clashRows() {
  const oneLine = v => String(v || "").replace(/\s+/g, " ").trim();
  return CLASH.pairs.map(p => {
    const span = e => `${fmtTime.format(e.start)}–${fmtTime.format(e.end)}`;
    const desc = e => oneLine([e.course, e.type, e.location].filter(Boolean).join(" · "));
    return {
      vecka: "v" + isoWeek(parts(p.a.start).key).week,
      datum: `${fmtWeekday.format(p.a.start)} ${fmtDate.format(p.a.start)}`,
      pass1: `${span(p.a)} ${desc(p.a)}`,
      pass2: `${span(p.b)} ${desc(p.b)}`,
    };
  });
}

const COLS = [
  ["vecka", "Vecka"], ["datum", "Datum"], ["pass1", "Pass 1"], ["pass2", "Pass 2"],
];

// Tab-separated: pastes as a real table into Excel, Sheets, Word and Outlook.
// (Space-padded columns were tried first, but course names push the width past
// 190 chars, which wraps into mush in any mail client.)
function clashesAsText(rows) {
  return [
    `Schemakrockar (${rows.length} st) - ${activeCourses().length} kurser`,
    "",
    COLS.map(c => c[1]).join("\t"),
    ...rows.map(r => COLS.map(c => r[c[0]]).join("\t")),
  ].join("\n");
}

// Inline styles only — mail clients strip <style> blocks.
function clashesAsHtml(rows) {
  const td = "padding:6px 10px;border:1px solid #ccc;font-family:Arial,sans-serif;font-size:13px;vertical-align:top";
  const th = td + ";background:#f0f0f4;font-weight:bold;text-align:left";
  return `<table style="border-collapse:collapse;border:1px solid #ccc">
<thead><tr>${COLS.map(c => `<th style="${th}">${esc(c[1])}</th>`).join("")}</tr></thead>
<tbody>
${rows.map(r => `<tr>${COLS.map(c => `<td style="${td}">${esc(r[c[0]])}</td>`).join("")}</tr>`).join("\n")}
</tbody></table>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#666">${rows.length} schemakrockar. Tider i Europe/Stockholm.</p>`;
}

async function copyClashes() {
  const rows = clashRows();
  const btn = el("copyclash");
  if (!rows.length) return flash(btn, "Inga krockar att kopiera");
  const text = clashesAsText(rows), html = clashesAsHtml(rows);
  try {
    // Rich + plain on the clipboard: mail clients take the table, editors the text.
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
    flash(btn, `✓ Kopierat (${rows.length} krockar)`);
  } catch {
    copyHtmlFallback(html, text)
      ? flash(btn, `✓ Kopierat (${rows.length} krockar)`)
      : showCopyBox(text);
  }
}

// execCommand path for browsers/contexts where the async clipboard is blocked.
function copyHtmlFallback(html, text) {
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const sel = getSelection();
  sel.removeAllRanges(); sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  sel.removeAllRanges();
  holder.remove();
  return ok;
}

// Last resort: show the text so it can be selected by hand.
function showCopyBox(text) {
  el("detail").hidden = false;
  el("detail").innerHTML = `<button class="close" onclick="document.getElementById('detail').hidden=true">✕</button>
    <h3>Kopiera krocklistan</h3>
    <p class="sub">Automatisk kopiering blockerades. Markera och kopiera:</p>
    <textarea class="copybox" readonly>${esc(text)}</textarea>`;
  el("detail").querySelector("textarea").select();
}

function flash(btn, msg) {
  const old = btn.dataset.label || btn.textContent;
  btn.dataset.label = old;
  btn.textContent = msg;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { btn.textContent = btn.dataset.label; }, 2200);
}

function showDetail(e, clash) {
  window.__detailEvent = e;
  const others = CLASH.pairs
    .filter(p => key(p.a) === key(e) || key(p.b) === key(e))
    .map(p => key(p.a) === key(e) ? p.b : p.a);
  el("detail").innerHTML = `
    <button class="close" onclick="document.getElementById('detail').hidden=true">✕</button>
    <h3 style="color:${colorOf(e.course)}">${esc(e.course)}</h3>
    <p><b>${esc(e.type || "Pass")}</b></p>
    <p>${fmtFull.format(e.start)}<br>${e.allDay ? "Heldag" : fmtTime.format(e.start) + "–" + fmtTime.format(e.end)}</p>
    <p>📍 ${esc(e.location || "—")}</p>
    ${SOURCES.length > 1 && e.source ? `<p class="sub">📆 ${esc(e.source)}</p>` : ""}
    ${e.note ? `<p>📝 ${esc(e.note)}</p>` : ""}
    ${e.url ? `<p><a href="${esc(e.url)}" target="_blank" rel="noopener">Karta</a></p>` : ""}
    <p><button onclick="goToEvent(window.__detailEvent)">↦ Visa i veckovyn</button></p>
    ${clash ? `<div class="warn"><b>Krockar med:</b><br>${others.map(o => esc(o.course) + " (" + fmtTime.format(o.start) + "–" + fmtTime.format(o.end) + ")").join("<br>")}</div>` : ""}`;
  el("detail").hidden = false;
}

function updateStats() {
  const base = remaining();
  const dropped = removed.size ? ` · ${removed.size} borttagna` : "";
  const feeds = SOURCES.length > 1 ? ` · ${SOURCES.length} kalendrar` : "";
  el("stats").textContent = `${base.length} pass · ${activeCourses().length} kurser${feeds}${dropped}`;
}

function render() {
  updateStats();
  renderFilters();
  renderClashes();
  view === "week" ? renderWeek() : renderList();
  el("btn-week").classList.toggle("active", view === "week");
  el("btn-list").classList.toggle("active", view === "list");
  el("nav").style.visibility = view === "week" ? "visible" : "hidden";
}

// Several TimeEdit links can publish the same booking (the röda dagar show up in
// every feed), so identical uid+start pairs are kept only once — otherwise each
// duplicate would "clash" with itself.
function loadFeeds(feeds) {
  EVENTS = [];
  const seen = new Set();
  for (const f of feeds) {
    for (const e of parseIcs(f.ics)) {
      const id = e.uid + "|" + e.start.toISOString();
      if (seen.has(id)) continue;
      seen.add(id);
      e.source = f.name;
      EVENTS.push(e);
    }
  }
  EVENTS.sort((a, b) => a.start - b.start);
  SOURCES = feeds.map(f => f.name);

  removed = loadRemoved();
  recompute();
  const today = parts(new Date()).key;
  const base = remaining();
  const upcoming = base.find(e => parts(e.start).key >= today) || base[0] || EVENTS[0];
  weekStart = mondayOf(parts(upcoming ? upcoming.start : new Date()).key);
  render();
}

/* ---------- wiring ---------- */
el("btn-week").onclick = () => { view = "week"; render(); };
el("btn-list").onclick = () => { view = "list"; render(); };
el("prev").onclick = () => { focusKeys = new Set(); weekStart = addDays(weekStart, -7); render(); };
el("next").onclick = () => { focusKeys = new Set(); weekStart = addDays(weekStart, 7); render(); };
el("today").onclick = () => { focusKeys = new Set(); weekStart = mondayOf(parts(new Date()).key); render(); };
el("copyclash").onclick = copyClashes;
el("onlyclash").onchange = ev => { onlyClashes = ev.target.checked; render(); };
el("file").onchange = ev => {
  const f = ev.target.files[0];
  if (f) f.text().then(t => loadFeeds([{ name: f.name, ics: t }]));
};
document.addEventListener("keydown", ev => {
  if (view !== "week") return;
  if (ev.key === "ArrowLeft") el("prev").click();
  if (ev.key === "ArrowRight") el("next").click();
  if (ev.key === "Escape") el("detail").hidden = true;
});

loadFeeds(window.ICS_FEEDS || [{ name: "Schema", ics: window.ICS_DATA }]);
