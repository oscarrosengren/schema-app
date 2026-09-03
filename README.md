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
Varje kurs publiceras som en **egen kalender** på GitHub Pages, eftersom Google sätter
färg per kalender och struntar i färgangivelser inne i en .ics-fil. Prenumerera på en
kurs i taget och ge var och en sin färg i Google.

| Kalender | Pass | URL |
|---|---|---|
| Automatiserings- och robotteknik | 33 | `https://oscarrosengren.github.io/schema-app/cal/automatiserings-och-robotteknik.ics` |
| Reglerteknik II | 33 | `https://oscarrosengren.github.io/schema-app/cal/reglerteknik-ii.ics` |
| Industriell ekonomi | 31 | `https://oscarrosengren.github.io/schema-app/cal/industriell-ekonomi.ics` |
| Teknik, affärsutveckling och ledning | 20 | `https://oscarrosengren.github.io/schema-app/cal/teknik-affarsutveckling-och-ledning.ics` |
| Kreativitet och hållbar design i teknikbaserat entreprenörskap | 10 | `https://oscarrosengren.github.io/schema-app/cal/kreativitet-och-hallbar-design-i-teknikbasera.ics` |
| Vetenskapliga metoder för industriell ekonomi | 10 | `https://oscarrosengren.github.io/schema-app/cal/vetenskapliga-metoder-for-industriell-ekonomi.ics` |
| Immaterialrätt och affärsjuridik | 1 | `https://oscarrosengren.github.io/schema-app/cal/immaterialratt-och-affarsjuridik.ics` |
| Röda dagar | 7 | `https://oscarrosengren.github.io/schema-app/cal/roda-dagar.ics` |
| Mitt schema | 145 | `https://oscarrosengren.github.io/schema-app/cal/schema.ics` |

**Lägg till:** `Andra kalendrar +` → **Från URL** → klistra in en URL → *Lägg till
kalender*. Upprepa per kurs. Använd **inte** "Importera" — det blir en engångskopia som
aldrig uppdateras.

**Sätt färg:** hovra över kalendern i vänsterlistan → `⋮` → välj färg. Färgen ligger på
ditt Google-konto, inte i filen, så den överlever alla uppdateringar av schemat.

`schema.ics` är alla kurser i en enda kalender (en färg för allt). Prenumerera antingen
på den **eller** på kurskalendrarna — inte båda, då syns varje pass två gånger.

Samma URL:er fungerar i Apple Kalender (Arkiv → Ny kalenderprenumeration) och Outlook.

**Obs om uppdateringstakt:** Google hämtar prenumererade kalendrar när Google vill,
typiskt var 8–24:e timme, oavsett `REFRESH-INTERVAL` i filen. Behöver du se en ändring
direkt: öppna krockvisaren, eller läs in filen i Apple Kalender som hämtar oftare.

### Hur kurserna delas upp
Kursnamnet plockas ur TimeEdits `SUMMARY` med exakt samma logik som krockvisaren använder
(`course_of()` i `sync.py` speglar `splitSummary()` i `app.js`), så uppdelningen stämmer
med kurschipsen i appen. Heldagsposter (röda dagar) samlas i `roda-dagar.ics`. Nya kurser
får en egen fil automatiskt vid nästa sync — inget att konfigurera.

En kurs som försvinner helt ur flödet (avslutad eller avhoppad) byggs om mot ett tomt
flöde: historiken ligger kvar, allt framtida försvinner. Filen tas alltså aldrig bort av
sig själv, så gamla terminer finns kvar att prenumerera på.

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
MERGED    = ("Mitt schema", "schema.ics")  # alla flöden i en fil (None = hoppa över)
SPLIT     = False                          # en fil per flöde i FEEDS
BY_COURSE = True                           # en fil per kurs (egen färg i Google)
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
| `cal/*.ics` | publicerade kalendrar (en per kurs) med arkiv — prenumerera på dessa |
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
