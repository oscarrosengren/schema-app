# Set up your own copy (instructions for an AI agent)

Give this file to a coding agent such as Claude Code, together with a copy of this
repo, and say *"Follow SETUP-AGENT.md"*. The agent asks for what it needs and then
does the rest.

The end result is the user's own copy of the app:

- a web app that shows their TimeEdit schedule and highlights **clashes** between
  sessions,
- one **Google Calendar subscription per course** (each course gets its own colour),
  plus one calendar with everything in it,
- an **archive**, so past sessions stay in Google after TimeEdit drops them,
- the option to **hide** courses or single sessions in the app, which also hides them
  in Google.

---

## Agent: how to run this

Work through the phases in order. **Ask the user** at each step marked 🗣. Don't
guess their values, and don't reuse anything that belongs to the original owner. Run
the commands yourself where you can. When something needs a browser login, tell the
user exactly what to type: in Claude Code they can run it with `! <command>`.

### Phase 0: Check the tools

Check that the user has `git`, `python3` (3.9 or newer), `node` (22 or newer), `gh` (the
GitHub CLI) and the `vercel` CLI. Offer to install anything missing, for example
`npm i -g vercel@latest` and `brew install gh` on a Mac. Then sign in to each:

```sh
gh auth login
vercel login
```

### Phase 1: Collect the TimeEdit links 🗣

Ask the user these questions, one at a time:

1. **"Which university's TimeEdit do you use?"** The domain looks like
   `cloud.timeedit.net/<school>/…`, for example `uu` for Uppsala, `chalmers`, `kth` or
   `liu`.
2. **"Please paste your TimeEdit subscription link(s)."** If they don't know where to
   find them, walk them through it:
   - Open the university's TimeEdit and search for the courses or programme they want.
     Add them all to one search, or make several.
   - Click **Prenumerera / Subscribe** (sometimes under *Exportera*, or behind a
     calendar icon).
   - Copy the link. It must end in **`.ics`** and usually contains `s.ics?i=…`.
   - A `webcal://` link is fine too. Change `webcal://` to `https://`.
   - Several links are fine. The app merges them and finds clashes **between** them.
3. **"What should each link be called?"** This is a short label per link, such as
   `Kursschema` or `Industriell ekonomi`. It appears in the app's detail view.
4. **"What do you want to call the project?"** This becomes the GitHub repo name and
   the Vercel URL, for example `my-schedule` → `my-schedule.vercel.app`.

Check every link before continuing:

```sh
curl -sL "<link>" | head -5                    # must start with BEGIN:VCALENDAR
curl -sL "<link>" | grep -c BEGIN:VEVENT       # number of sessions, should be > 0
```

If a link returns HTML or zero sessions, tell the user and ask for a new one. Common
causes are copying the page address instead of the subscribe link, or a search that
ended up empty.

⚠️ Tell the user plainly: **the repo must be public** (see Phase 4), so **their
schedule and TimeEdit links will be publicly visible**. That's usually fine for a
class schedule, but they should decide. Continue only if they agree.

### Phase 2: Clean out the original owner's data

This repo still holds the original owner's schedule. Remove all of it, or their
sessions will show up in the new user's calendars **forever**, because the archive
never deletes past sessions:

```sh
rm -f archive/*.ics schema*.ics index.html .last-sync
rm -rf .vercel
rm -rf .git && git init -b main      # fresh history, without the owner's commits
```

### Phase 3: Configure the code

Make these changes. Each one points to a file and the setting inside it.

1. **`sync.py`: `FEEDS`.** Replace the list with the user's links from Phase 1:
   ```python
   FEEDS = [
       ("Kursschema", "https://cloud.timeedit.net/<school>/web/…/s.ics?i=…"),
       ("Programme",  "https://cloud.timeedit.net/<school>/web/…/s.ics?i=…"),
   ]
   ```
   Feed *n* is saved to `schema<n>.ics`.
2. **`.github/workflows/sync.yml`.** The step "Committa ändringar" lists
   `schema1.ics schema2.ics` by name. Replace them with `schema*.ics` so it works for
   any number of feeds:
   ```sh
   if git diff --quiet --cached -- archive index.html schema*.ics; then
   ```
3. **`index.template.html`.** Set `window.APP_BASE` to the user's future Vercel URL,
   `https://<project>.vercel.app`. If you don't know the exact URL until Phase 5, come
   back and update it then.
4. **`README.md`.** Replace `schema-app-opal.vercel.app` with the user's URL. Empty
   the calendar table for now; you'll fill it in Phase 7.

Build the first version:

```sh
python3 sync.py
ls archive/            # one .ics per course + schema.ics + maybe roda-dagar.ics
```

Open `index.html` in a browser and ask the user 🗣 whether the courses and sessions
look right.

### Phase 4: GitHub (storage and the automatic sync)

The Vercel function reads the calendars directly from the repo through
`raw.githubusercontent.com`, so the repo must be **public**. A GitHub Action fetches
TimeEdit every 6 hours and commits the changes. You don't need to deploy again after
each sync.

```sh
git add -A && git commit -m "My own schedule"
gh repo create <project> --public --source . --push
```

Then:

- Allow the Action to push: **Settings → Actions → General → Workflow permissions →
  Read and write**. The workflow asks for `contents: write`, but some accounts block it
  by default.
- Start the first run by hand and check that it goes green:
  ```sh
  gh workflow run sync.yml && sleep 5 && gh run watch
  ```

### Phase 5: Vercel (hosting)

Vercel hosts the app and the `/cal/<course>.ics` addresses that Google subscribes to.
The free **Hobby** plan is enough.

Recommended: **connect the GitHub repo** so every push deploys automatically.

1. Go to <https://vercel.com/new> → **Import Git Repository** → choose `<project>`.
2. Leave **Framework Preset** as *Other*, and leave the build and output settings
   empty. The repo is static files plus `api/*.js` functions, and `vercel.json` handles
   the `/cal/…` route.
3. Under **Environment Variables**, add:
   | Name | Value |
   |---|---|
   | `GITHUB_REPO` | `<github-user>/<project>` (**required**; the default points to the original owner's repo) |
   | `GITHUB_BRANCH` | `main` (only if the branch has another name) |
4. Click **Deploy**.

Or use the CLI from the repo folder:

```sh
vercel link                                    # create or link the project
vercel env add GITHUB_REPO production          # enter: <github-user>/<project>
vercel deploy --prod
```

Check that it works:

```sh
curl -s https://<project>.vercel.app/cal/schema.ics | grep -c BEGIN:VEVENT
```

If the project name was taken and Vercel gave a different URL, update `APP_BASE`
(Phase 3.3) and the README, then commit and push.

### Phase 6: Upstash Redis (optional; needed to hide sessions from Google) 🗣

Without this step everything works, but sessions the user hides in the app stay
visible in Google (the app shows **⚠︎ Bara i den här webbläsaren**). Ask the user if
they want it.

The user signs up with **their own** Upstash account. This is separate from Vercel
storage, so no Vercel Marketplace setup is needed.

1. Go to <https://console.upstash.com> → **Create Database** → Redis, free plan, the
   region closest to them (e.g. `eu-central-1`).
2. On the database page, open the **REST API** section and copy
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Use the REST token, **not**
   the password in the `redis://` string; the wrong one gives `WRONGPASS`.
3. Add them to Vercel and deploy again:
   ```sh
   vercel env add UPSTASH_REDIS_REST_URL production
   vercel env add UPSTASH_REDIS_REST_TOKEN production
   vercel deploy --prod
   ```
   Or add them in the dashboard under **Settings → Environment Variables**, then click
   **Redeploy**.

Never put the token in a file that gets committed.

Check: the app's header should say **🔗 Gäller i Google**.

### Phase 7: Subscribe in Google Calendar 🗣

List the user's calendars together with their URLs:

```sh
for f in archive/*.ics; do
  n=$(basename "$f" .ics)
  echo "$(grep -c BEGIN:VEVENT "$f")  https://<project>.vercel.app/cal/$n.ics"
done
```

Write the list into the README table. Then explain:

- In Google Calendar, open **Other calendars +** → **From URL** → paste one URL →
  **Add calendar**. Repeat for each course. **Don't** use *Import*, which makes a copy
  that never updates.
- Subscribe to **either** `schema.ics` (everything in one calendar) **or** the course
  calendars, not both. Otherwise every session shows up twice.
- Set the colour with `⋮` next to the calendar → choose a colour. The colour stays on
  their Google account and survives updates.
- Google refreshes subscriptions every **8–24 hours**. Changes don't show up
  immediately. `https://<project>.vercel.app/api/fetches` shows when Google last
  fetched.
- The same URLs work in Apple Calendar (File → New Calendar Subscription) and Outlook.

---

## Good to know (pass on to the user)

- **Course renamed in TimeEdit** → it gets a **new** calendar file with a new name,
  and the old one only keeps its history. Run the listing in Phase 7 again and swap
  the subscription.
- **New course added in TimeEdit** → if the TimeEdit link covers the whole programme,
  the course shows up by itself after the next sync, with its own new URL. If the link
  only covers chosen courses, they need to create a new link in TimeEdit and swap it in
  `FEEDS`.
- **Dropped a course** → it stays in the feed until the TimeEdit link changes. Hide it
  in the app instead: click the course chip (×).
- **The Action stops running** → GitHub pauses scheduled workflows in repos with no
  activity for 60 days. The workflow writes a monthly heartbeat to prevent that, but if
  it happens anyway, open the Actions tab → *Enable workflow*.
- `/api/selection` is open, like the calendar links. Anyone who knows the URL can hide
  or show the user's sessions, but can't add anything new.
- Share the schedule without some courses:
  `https://<project>.vercel.app/cal/utan-<course>+<course>.ics`. See the README.
