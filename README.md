# Schemavisare (TimeEdit)

Enkel, fristående webbapp för att visa ditt TimeEdit-schema och hitta **schemakrockar**.

## Använda
Öppna `index.html` i webbläsaren. Inget bygge, ingen server, inga beroenden.

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

Lägg till fler genom att fylla på `FEEDS`-listan i `update.sh` med rader på formen
`"Namn|URL"` och köra `./update.sh`. Samma bokning i flera flöden (t.ex. röda dagar)
räknas bara en gång, så den krockar aldrig med sig själv.

## Uppdatera schemat
```sh
./update.sh
```
Hämtar om ICS-filen från TimeEdit och bakar in den i `index.html`. Dina borttagna kurser
ligger kvar efteråt.

**Obs:** länken i `update.sh` har TimeEdits objekturval inbakat i själva URL:en. Om du
hoppar av en kurs i Ladok/Studium försvinner den *inte* automatiskt ur flödet — du måste
antingen generera en ny länk i TimeEdit (och byta ut `URL=` i `update.sh`) eller ta bort
kursen i appen enligt ovan.

## Filer
| Fil | Innehåll |
|---|---|
| `index.html` | genererad app (ICS-datan inbakad) |
| `index.template.html` | mall, `__ICS__` ersätts av `update.sh` |
| `app.js` | ICS-parser, krockdetektering, rendering |
| `style.css` | stilar (ljust/mörkt läge) |
| `schema1.ics`, `schema2.ics` | senast hämtade flödena |

## Noter
- Tider visas i **Europe/Stockholm**; TimeEdit levererar UTC.
- Detaljrutan visar vilken kalender ett pass kommer från när flera är inlästa.
- Heldagsposter (röda dagar) räknas aldrig som krockar.
- Krock = två tidsatta pass som överlappar mer än 0 minuter.
