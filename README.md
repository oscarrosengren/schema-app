# Schemavisare (TimeEdit)

Enkel, fristående webbapp för att visa ditt TimeEdit-schema och hitta **schemakrockar**.

## Använda
Öppna `index.html` i webbläsaren, eller <https://oscarrosengren.github.io/schema-app/>.
Inget bygge, ingen server, inga beroenden.

## Funktioner
- **Veckovy** med överlappande pass sida vid sida, och **listvy** över alla pass.
- **Krockpanel** till höger: varje par av överlappande pass med datum, längd på överlappet
  och lokal. **Klicka på en krock** för att hoppa till rätt vecka, scrolla till rätt tid och
  få båda passen blinkande markerade. Samma sak via "↦ Visa i veckovyn" i detaljrutan.
- Krockande pass är rödmarkerade i rutnätet. Klicka på ett pass för detaljer + karta.
- **Ta bort en kurs** genom att klicka på dess chip (×). Kursen försvinner ur rutnätet,
  ur statistiken och ur krockberäkningen — krockar som bara fanns på grund av den kursen
  räknas alltså inte längre. Valet sparas i webbläsaren (localStorage) och överlever både
  omladdning och `./update.sh`. Klicka på chipet igen (+) eller "↺ Återställ alla" för att
  ta tillbaka den.
- Kryssa i **Visa bara krockar** för att dölja allt annat.
- **📋 Kopiera som tabell** lägger krocklistan på urklipp i två format samtidigt: en
  HTML-tabell med inline-stilar (som Outlook/Gmail klistrar in som en riktig tabell) och
  tabbseparerad text som fallback (blir tabell i Excel, Sheets och Word). Kolumner:
  Vecka, Datum, Pass 1, Pass 2 — varje pass med tid, kurs, momenttyp och sal.
  Borttagna kurser följer inte med.
- Piltangenter ←/→ byter vecka, Esc stänger detaljrutan.
- **Öppna .ics** läser in vilken annan kalenderfil som helst.

## Kalendrar
Appen slår ihop flera TimeEdit-flöden och letar krockar **mellan** dem:

| Namn | Fil |
|---|---|
| Kursschema | `schema1.ics` |
| Industriell ekonomi | `schema2.ics` |

Lägg till fler genom att fylla på `FEEDS`-listan i `sync.py` och köra `./update.sh`. Samma bokning i flera flöden (t.ex. röda dagar)
räknas bara en gång, så den krockar aldrig med sig själv.

## Prenumerera i Google Calendar
Kalendrarna publiceras på GitHub Pages och uppdateras av sig själva var sjätte timme:

| Kalender | URL |
|---|---|
| Allt (sammanslaget) | `https://oscarrosengren.github.io/schema-app/cal/schema.ics` |
| Kursschema | `https://oscarrosengren.github.io/schema-app/cal/kursschema.ics` |
| Industriell ekonomi | `https://oscarrosengren.github.io/schema-app/cal/industriell-ekonomi.ics` |

Krockvisaren ligger på <https://oscarrosengren.github.io/schema-app/>.

**Lägg till i Google Calendar:** `Andra kalendrar +` → **Från URL** → klistra in en av
länkarna ovan → *Lägg till kalender*. Använd **inte** "Importera" — då blir det en
engångskopia som aldrig uppdateras.

Samma URL:er fungerar i Apple Kalender (Arkiv → Ny kalenderprenumeration) och Outlook.

**Obs om uppdateringstakt:** Google hämtar prenumererade kalendrar när Google vill,
typiskt var 8–24:e timme, oavsett `REFRESH-INTERVAL` i filen. Behöver du se en ändring
direkt: öppna krockvisaren, eller läs in `cal/schema.ics` i Apple Kalender som hämtar
oftare.

### Varför passerade pass ligger kvar
TimeEdits egna flöde rullar fönstret framåt, så pass som varit försvinner ur flödet — och
eftersom en prenumeration speglar flödet exakt tömmer Google då också historiken.
Därför är `cal/*.ics` ett **arkiv**, inte en ren kopia:

- pass som redan **passerat** (sluttid + 6 h) sparas för alltid, även när TimeEdit slutar
  skicka dem,
- pass i **framtiden** speglar alltid flödet — hoppar du av en kurs eller flyttas en
  föreläsning försvinner den gamla posten,
- samma bokning i flera flöden räknas en gång (152 pass → 145 i den sammanslagna filen),
- varje pass får ett stabilt eget UID (hash av TimeEdits UID + starttid), så en flyttad
  föreläsning inte skriver över sin egen historik i Google.

## Uppdatera schemat
Sker automatiskt i GitHub Actions (`.github/workflows/sync.yml`, var 6:e timme, kan även
köras manuellt från Actions-fliken). Lokalt:

```sh
./update.sh          # hämta om flödena, uppdatera cal/*.ics och index.html
./sync.py --no-fetch # bygg om från redan nedladdade schemaN.ics
```

Arkivet lever i `cal/*.ics` i repot — filerna är både det som publiceras och det som
kommer ihåg historiken, så de ska committas. Tidsstämplar som TimeEdit sätter vid varje
hämtning ignoreras, så en sync utan verkliga ändringar ger ingen commit.

Filupplägget styrs av tre rader i `sync.py`:

```python
MERGED = ("Mitt schema", "schema.ics")  # alla flöden i en fil (None = hoppa över)
SPLIT  = True                            # dessutom en fil per flöde
```

**Obs:** länkarna i `sync.py` har TimeEdits objekturval inbakat i själva URL:en. Om du
hoppar av en kurs i Ladok/Studium försvinner den *inte* automatiskt ur flödet — du måste
antingen generera en ny länk i TimeEdit (och byta ut den i `FEEDS`) eller ta bort kursen i
appen enligt ovan. Kurser du tagit bort i appen ligger kvar i `cal/*.ics`, eftersom valet
bara sparas i din webbläsare.

## Filer
| Fil | Innehåll |
|---|---|
| `index.html` | genererad app (ICS-datan inbakad) |
| `cal/*.ics` | publicerade kalendrar med arkiv — prenumerera på dessa |
| `sync.py` | hämtar flöden, slår ihop med arkivet, bygger `index.html` |
| `.github/workflows/sync.yml` | kör `sync.py` var 6:e timme och committar ändringar |
| `index.template.html` | mall, `__FEEDS__` ersätts vid bygge |
| `app.js` | ICS-parser, krockdetektering, rendering |
| `style.css` | stilar (ljust/mörkt läge) |
| `schema1.ics`, `schema2.ics` | senast hämtade flödena |

## Noter
- Tider visas i **Europe/Stockholm**; TimeEdit levererar UTC.
- Detaljrutan visar vilken kalender ett pass kommer från när flera är inlästa.
- Heldagsposter (röda dagar) räknas aldrig som krockar.
- Krock = två tidsatta pass som överlappar mer än 0 minuter.
