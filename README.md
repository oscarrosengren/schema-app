# Schemavisare (TimeEdit)

Enkel, fristående webbapp för att visa ditt TimeEdit-schema och hitta **schemakrockar**.

## Använda
Använd <https://schema-app-opal.vercel.app> — där gäller det du avmarkerar även i Google
Calendar. `index.html` fungerar också som lokal fil, men då sparas valet bara i
webbläsaren.

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
Appen ligger på <https://schema-app-opal.vercel.app> och varje kurs publiceras som en **egen kalender**, dels för
att Google sätter färg per kalender, dels för att kunna släcka en hel kurs på en gång.

| Kalender | Pass | URL att prenumerera på |
|---|---|---|
| Automatiserings- och robotteknik | 33 | `https://schema-app-opal.vercel.app/cal/automatiserings-och-robotteknik.ics` |
| Reglerteknik II | 33 | `https://schema-app-opal.vercel.app/cal/reglerteknik-ii.ics` |
| Industriell ekonomi | 31 | `https://schema-app-opal.vercel.app/cal/industriell-ekonomi.ics` |
| Teknik, affärsutveckling och ledning | 20 | `https://schema-app-opal.vercel.app/cal/teknik-affarsutveckling-och-ledning.ics` |
| Kreativitet och hållbar design i teknikbaserat entreprenörskap | 10 | `https://schema-app-opal.vercel.app/cal/kreativitet-och-hallbar-design-i-teknikbasera.ics` |
| Vetenskapliga metoder för industriell ekonomi | 10 | `https://schema-app-opal.vercel.app/cal/vetenskapliga-metoder-for-industriell-ekonomi.ics` |
| Immaterialrätt och affärsjuridik | 1 | `https://schema-app-opal.vercel.app/cal/immaterialratt-och-affarsjuridik.ics` |
| Röda dagar | 7 | `https://schema-app-opal.vercel.app/cal/roda-dagar.ics` |
| Mitt schema | 145 | `https://schema-app-opal.vercel.app/cal/schema.ics` |

**Lägg till:** `Andra kalendrar +` → **Från URL** → klistra in en URL → *Lägg till
kalender*. Upprepa per kurs. Använd **inte** "Importera" — det blir en engångskopia som
aldrig uppdateras.

**Sätt färg:** hovra över kalendern i vänsterlistan → `⋮` → välj färg. Färgen ligger på
ditt Google-konto, inte i filen, så den överlever alla uppdateringar av schemat.

`schema.ics` är alla kurser i en enda kalender. Prenumerera antingen på den **eller** på
kurskalendrarna — inte båda, då syns varje pass två gånger.

Samma URL:er fungerar i Apple Kalender (Arkiv → Ny kalenderprenumeration) och Outlook.

## Dölja pass från appen
Det som är avmarkerat i appen ligger inte i kalendrarna Google hämtar. Två sätt:

- **Ett enskilt pass:** klicka passet → **🚫 Dölj i kalendern**. Passet ligger kvar
  nedtonat i rutnätet så det går att ta tillbaka (knappen blir *↺ Visa i kalendern
  igen*), och chipet **🚫 n dolda pass** listar alla dolda pass med en återställknapp.
- **En hel kurs:** klicka kursens chip (×). Hela kursen försvinner ur rutnätet, ur
  krockberäkningen och ur kalendern. Klicka igen (+) för att ta tillbaka.

Dolda pass räknas aldrig som krockar, så en krock du valt bort försvinner ur krocklistan.

Texten i huvudet säger var valet gäller: **🔗 Gäller i Google** när servern svarar,
**⚠︎ Bara i den här webbläsaren** när den inte gör det (då sparas valet i localStorage
och Google ser fortfarande allt).

**Obs om uppdateringstakt:** Google hämtar prenumererade kalendrar när Google vill,
typiskt var 8–24:e timme. Ett pass du döljer försvinner alltså inte ur Google direkt —
kalenderfilen är rätt inom någon minut, men Google läser den när Google läser den.

### Så hänger delarna ihop
```
TimeEdit ──sync.py (GitHub Actions, var 6:e h)──> archive/*.ics i repot
                                                      │
appen ──avmarkera──> /api/selection ──> hidden.json ──┤
                                                      ▼
Google ──GET /cal/<kurs>.ics──> Vercel-funktion: arkivet minus det dolda
```
- `archive/*.ics` är sanningen om schemat, inklusive historik, och committas av
  GitHub Actions. Funktionen läser dem direkt ur repot vid varje anrop, så en ny sync
  syns utan att appen behöver deployas om.
- `hidden.json` är listan över dolda kurser och pass. Den ligger i samma repo, så det
  behövdes ingen extra lagringstjänst. Skrivning kräver `GITHUB_TOKEN` i Vercel-projektet
  (se nedan); läsning gör det inte.
- Appen läser `/cal/schema.ics?all=1`, alltså arkivet **ofiltrerat**, för att kunna visa
  dolda pass nedtonade. Google läser samma väg utan `?all=1` och får dem filtrerade.

### Skrivrättighet
`/api/selection` kan bara spara om Vercel-projektet har en `GITHUB_TOKEN` med
`Contents: read and write` på det här repot:

```sh
vercel env add GITHUB_TOKEN production   # klistra in token
vercel deploy --prod
```

Utan token fungerar allt utom sparandet: appen visar **⚠︎ Kan inte spara** och valet
gäller bara i webbläsaren.

Skrivningen är öppen, precis som kalenderlänkarna. `/api/selection` tar därför bara emot
id:n och kursnamn som faktiskt finns i arkivet — det enda någon kan göra med endpointen
är att dölja eller visa dina egna pass, inte lägga in något nytt. Varje ändring blir en
commit, så `git log hidden.json` visar vad som hänt.

### Varför passerade pass ligger kvar
TimeEdits egna flöde rullar fönstret framåt, så pass som varit försvinner ur flödet — och
eftersom en prenumeration speglar flödet exakt tömmer Google då också historiken.
Därför är `archive/*.ics` ett **arkiv**, inte en ren kopia:

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

Arkivet lever i `archive/*.ics` i repot — filerna är både det som publiceras och det som
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
appen enligt ovan. Kurser du dolt i appen ligger kvar i `archive/*.ics` — arkivet är hela schemat, och
filtreringen sker när kalendern hämtas.

## Filer
| Fil | Innehåll |
|---|---|
| `index.html` | genererad app (ICS-datan inbakad) |
| `archive/*.ics` | arkivet: en fil per kurs, med historik. Källa för de publicerade flödena |
| `api/cal.js` | serverar `/cal/<kurs>.ics` = arkivet minus det du dolt |
| `api/selection.js` | läser/skriver `hidden.json` (det avmarkerade) |
| `api/_lib.js` | ICS-filtrering och GitHub-läsning/skrivning |
| `hidden.json` | dolda kurser och pass |
| `vercel.json` | rewrite: `/cal/:file` → funktionen |
| `uitest.mjs` | UI-test i jsdom: `npm i --no-save jsdom && node uitest.mjs` |
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
