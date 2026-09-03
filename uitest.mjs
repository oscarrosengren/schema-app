import { JSDOM } from "jsdom";
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf-8").replace('<script src="app.js"></script>', "");
const archive = fs.readFileSync("archive/schema.ics", "utf-8");
const puts = [];
let selection = { courses: [], events: [], canWrite: true };
const reply = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://schema-app-opal.vercel.app/" });
const win = dom.window;
const errors = [];
win.addEventListener("error", e => errors.push(e.message || String(e.error)));
win.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("/api/selection")) {
    if (init.method === "PUT") {
      selection = { ...JSON.parse(init.body), canWrite: true };
      puts.push(JSON.parse(init.body));
    }
    return reply(selection);
  }
  if (u.includes(".ics")) return { ok: true, status: 200, text: async () => archive };
  throw new Error("okänd url " + u);
};
win.eval(fs.readFileSync("app.js", "utf-8"));

const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(300);

const $ = s => win.document.querySelector(s);
const all = s => [...win.document.querySelectorAll(s)];
let failed = 0;
const check = (label, ok, extra = "") => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  → " + extra : ""}`); };

check("läser arkivet, inte den inbakade kopian", $("#savestate").className === "synced", $("#savestate").textContent);
check("statusrad", /145 pass · 7 kurser/.test($("#stats").textContent), $("#stats").textContent);
check("kurschips (7 kurser, röda dagar räknas inte som kurs)", all("#filters .chip").length === 7);
const cards = all(".ev");
check("pass ritade i veckovyn", cards.length > 0, cards.length + " kort");

cards[0].dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
check("detaljrutan öppnas", !$("#detail").hidden);
const hideBtn = [...$("#detail").querySelectorAll("button")].find(b => /Dölj i kalendern/.test(b.textContent));
check("döljknapp aktiv (passen bär arkivets id)", Boolean(hideBtn) && !hideBtn.disabled);

hideBtn.click();
await wait(1200);
check("PUT skickad", puts.length === 1, JSON.stringify(puts[0]));
check("exakt ett pass dolt", puts[0]?.events.length === 1 && /@timeedit-arkiv$/.test(puts[0].events[0]));
check("passet kvar men nedtonat", all(".ev.muted").length === 1);
check("statusen säger sparat", $("#savestate").className === "saved", $("#savestate").textContent);
check("chip för dolda pass", all("#filters .chip.hidden-pass").length === 1);

$("#filters .chip.hidden-pass").click();
const restore = [...$("#detail").querySelectorAll("button")].find(b => /Visa igen/.test(b.textContent));
check("listan har återställ-knapp", Boolean(restore));
restore?.click();
await wait(1200);
check("passet tillbaka i kalendern", puts.at(-1)?.events.length === 0 && all(".ev.muted").length === 0, JSON.stringify(puts.at(-1)));

const chip = all("#filters .chip").find(c => /Reglerteknik II/.test(c.textContent));
chip.click();
await wait(1200);
check("hel kurs dold via chipet", puts.at(-1)?.courses.includes("Reglerteknik II"));
check("kursens pass borta ur rutnätet", !all(".ev-title").some(t => /Reglerteknik II/.test(t.textContent)));
// renderFilters() bygger om chipsen, så referensen måste hämtas på nytt
const chipAgain = all("#filters .chip").find(c => /Reglerteknik II/.test(c.textContent));
chipAgain.click();
await wait(1200);
check("kursen tillbaka", puts.at(-1)?.courses.length === 0 && all(".ev-title").some(t => /Reglerteknik II/.test(t.textContent)));

check("inga JS-fel", errors.length === 0, errors.join("; "));
console.log(failed ? `\n${failed} test misslyckades` : "\nAlla test gick igenom");
process.exit(failed ? 1 : 0);
