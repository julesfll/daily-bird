# Daily Bird

A daily bird-identification guessing game. Everyone gets the same bird each day;
you have six guesses, and every guess is scored against the target on five
traits — colour, size, habitat, region, and family.

**Play: https://julesfll.github.io/daily-bird/**

> **Currently in practice mode.** The daily puzzle and the six-guess cap are
> temporarily switched off: you get a random bird, unlimited guesses, and a
> *New bird* button. Both are single flags in [`src/config.ts`](src/config.ts) —
> set `DAILY_MODE = true` and `GUESS_LIMIT = 6` to restore the daily game.
> Streaks and the countdown are hidden while practice mode is on, because
> neither means anything without a once-a-day puzzle.

## How it works

The whole game is a static site. There is no server, no account, and no
database.

- The day's bird is `poolOrder[daysSinceLaunch % poolSize]`, resolved in the
  browser. The order is a fixed-seed shuffle baked into the data file, so every
  player on every device lands on the same species without anything to
  coordinate.
- The rollover is midnight UTC for everybody. Per-timezone rollovers would leak
  tomorrow's bird across timezone boundaries.
- Progress, streaks and your guess distribution live in `localStorage`.

### The honest caveat about cheating

The original design kept the answer server-side and evaluated guesses over an
API. This build is static, so **the full species list ships to the browser and a
determined player can read the day's answer out of it.** That was a deliberate
trade for zero-ops hosting — the same trade the original Wordle made. Nothing in
the UI reveals the answer early, and casual play is unaffected.

If that stops being acceptable, the fix is small and the schema already
anticipates it: move `evaluateGuess` behind a function that takes a species id
and returns a `GuessResult`, and have it call a Worker holding the dataset
privately. Nothing about the data or the game logic needs to change.

## Layout

```
pipeline/          Python: builds the shipped dataset
  build_dataset.py   validation, size bucketing, daily order
  curated/           the hand-checked species seed
  sources/avonet.py  the full AVONET pipeline (see below)
public/data/       species.json — committed, so the site build never hits the network
src/game/          pure, tested game logic (no React)
src/components/    the UI
```

`src/game/` deliberately has no React in it: the clue rules, the daily rotation
and the six-guess state machine are plain functions with unit tests.

## The dataset

The site ships **169 species** with all clue fields precomputed — around five
and a half months of puzzles before the sequence repeats.

The species list is hand-picked for recognisability, but every measurable trait
comes from **AVONET** (Tobias et al. 2022): mass, habitat, range centroid, range
size, migration and diet. `pipeline/enrich_from_avonet.py` joins the seed to the
published workbook and overwrites those fields, leaving the things AVONET does
not carry — common name, colour, the player-facing family label, trivia and
conservation status — alone. It is idempotent, so re-running it is safe.

Size buckets are derived from the pool's own mass quintiles rather than round
guesses; `build_dataset.py` prints the resulting spread on every run, and badly
lopsided buckets make the size clue useless. The thresholds live only in the
pipeline, which emits the range labels alongside the data, so the client can
never drift out of step with them.

Two things worth knowing if you re-run the enrichment:

- **AVONET1_BirdLife is the spine, not the eBird sheet.** Only AVONET1 carries
  range centroids and range sizes; AVONET2_eBird has the traits and no geography
  at all. AVONET1 follows BirdLife taxonomy, so a handful of binomials are joined
  through a synonym map and the seed keeps its eBird spelling for display.
- **The wide-range threshold is 35M km², not the 15M the plan guessed.** At 15M
  nearly a quarter of the pool lost its compass clue, including Eurasia-only
  birds like Great Tit whose centroid is perfectly informative. Range size is an
  imperfect proxy for "spans many continents" at any cut — Osprey is genuinely
  global at 31M, below Great Tit's 33M — but 35M lands closest to the birds a
  player would call cosmopolitan.

### Rebuilding

```bash
python3 pipeline/build_dataset.py --strict
```

No dependencies for this path. CI re-runs it and fails if the committed
`species.json` differs, so the data and the seed can't diverge.

To add or correct a species, edit `pipeline/curated/seed_species.json` and
rebuild. Validation rejects unknown continents, habitats and colours, so a typo
fails the build rather than reaching a player. To re-pull traits from AVONET
after adding species (needs `pip install openpyxl`):

```bash
python3 pipeline/enrich_from_avonet.py \
  --workbook "pipeline/raw/AVONET Supplementary dataset 1.xlsx" --dry-run
```

Drop `--dry-run` to write. It reports every field it changes and flags any
species whose continent label contradicts its published range centroid.

### The full AVONET pipeline

`pipeline/sources/avonet.py` implements the larger pool described in the
original plan: AVONET traits, joined to Wikidata for common names and IUCN
status, ranked by Wikipedia pageviews, cut to the ~1,200 most recognisable
species, with continents resolved from range centroids.

**It has never been run.** The environment it was written in blocked egress to
figshare, Wikidata, Wikimedia and Dryad, so every network call in it is
unverified — expect to fix column names and API details on the first real run.
It is a starting point, not a finished artefact.

One genuine gap: plumage colour needs the HBW dataset from Dryad
(`doi:10.5061/dryad.70rxwdc6s`), which requires a manual download. The module
raises rather than inventing colours. If you want to ship without it, set
`clues.color` to `false` in the output and the colour clue disappears from the
UI and the share grid.

```bash
pip install -r pipeline/requirements.txt
python3 pipeline/build_dataset.py --source avonet
```

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # game logic, storage, and dataset validation
npm run build    # production build into dist/
```

## Deployment

### One-time setup (required once, ~30 seconds)

GitHub Pages has to be switched on by a repository admin — an Actions workflow
cannot enable it for you (`configure-pages` fails with *"Create Pages site
failed: Resource not accessible by integration"*, which is what the first run
here did).

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to the **Actions** tab, open the most recent *Deploy* run, and click
   **Re-run all jobs**.

### After that

Push to `main`. GitHub Actions runs the tests, rebuilds the dataset and fails if
the committed `species.json` differs, builds the site, and publishes it. Nothing
else to do, ever.

## Not in this version

No accounts, no cross-device sync, no hard mode, no archive of past puzzles, no
localisation. None of these need a schema change to add later: streaks already
derive from stored history, and puzzles are already keyed by date.

Global "you beat X% of players today" stats are the one feature that genuinely
needs a server, and would arrive with the same Worker described above.

## Credits

See [ATTRIBUTION.md](ATTRIBUTION.md).
