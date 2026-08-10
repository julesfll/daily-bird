"""The full AVONET + Wikidata + pageviews pipeline.

STATUS: written but never executed end to end. The environment this was
authored in blocked egress to figshare, Wikidata, Wikimedia and Dryad, so every
network step here is unverified. Expect to fix details -- column spellings,
sheet names, SPARQL timeouts -- on the first real run. It is a starting point,
not a finished artefact. The site currently ships the curated seed instead; see
README.md.

What it produces: the same row shape build_dataset.py expects from the curated
seed, so `--source avonet` is a drop-in swap for a much larger pool.

Steps:
  1. AVONET (Tobias et al. 2022, CC BY 4.0) -> trait spine, ~11k species.
  2. Wikidata SPARQL -> English common name, enwiki article, IUCN status.
  3. Wikimedia pageviews -> popularity, to cut the pool to recognisable birds.
  4. Natural Earth polygons -> continent from the range centroid.

Colour is the gap: the HBW plumage dataset (Han et al., Dryad
doi:10.5061/dryad.70rxwdc6s) needs a manual download, and there is no
defensible way to guess a species' dominant colour without it. Until that file
is present this module raises rather than inventing colours -- drop it at
pipeline/raw/hbw_colours.csv, or set clues.color = False in the output and hide
the colour clue.

Requires: pip install -r pipeline/requirements.txt
"""

from __future__ import annotations

import csv
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable

RAW_DIR = Path(__file__).resolve().parent.parent / "raw"
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"

FIGSHARE_ARTICLE = "16586228"  # AVONET, DOI 10.6084/m9.figshare.16586228
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
PAGEVIEWS_API = (
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
    "/en.wikipedia/all-access/all-agents/{title}/monthly/{start}/{end}"
)
NATURAL_EARTH_LAND = (
    "https://naturalearth.s3.amazonaws.com/110m_physical/ne_110m_land.zip"
)

USER_AGENT = "daily-bird-pipeline/1.0 (https://github.com/julesfll/daily-bird)"

# How many of the most-viewed species to keep. The plan's 1,000-1,500 range is
# roughly three years of daily puzzles.
POOL_SIZE = 1200

# Ranges larger than this get the compass sub-clue suppressed: a centroid is a
# poor summary of a bird found across half the planet.
WIDE_RANGE_KM2 = 15_000_000

# AVONET habitat values pass through unchanged; its vocabulary is already the
# one build_dataset.py validates against.
HABITAT_ALIASES = {"Human modified": "Human Modified"}


def _fetch(url: str, cache_name: str, *, binary: bool = False) -> bytes | str:
    """GET with an on-disk cache, so reruns do not hammer the APIs."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / cache_name
    if cached.exists():
        return cached.read_bytes() if binary else cached.read_text(encoding="utf-8")

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
    cached.write_bytes(payload)
    return payload if binary else payload.decode("utf-8")


# --------------------------------------------------------------------------
# 1. AVONET
# --------------------------------------------------------------------------


def load_avonet() -> list[dict[str, Any]]:
    """Read the eBird species-averages sheet of AVONET Supplementary dataset 1.

    Download it once by hand if the figshare API is awkward: the article page is
    https://doi.org/10.6084/m9.figshare.16586228 and the file wanted is the
    Excel workbook. Save it to pipeline/raw/AVONET.xlsx.
    """
    import pandas as pd  # imported lazily so the curated path needs no pandas

    workbook = RAW_DIR / "AVONET.xlsx"
    if not workbook.exists():
        meta = json.loads(
            _fetch(
                f"https://api.figshare.com/v2/articles/{FIGSHARE_ARTICLE}",
                "figshare.json",
            )
        )
        candidates = [f for f in meta["files"] if f["name"].lower().endswith((".xlsx", ".xls"))]
        if not candidates:
            raise RuntimeError("no Excel file found in the figshare article")
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        workbook.write_bytes(_fetch(candidates[0]["download_url"], "avonet.xlsx", binary=True))

    frame = pd.read_excel(workbook, sheet_name="AVONET1_eBird")
    rows: list[dict[str, Any]] = []
    for record in frame.to_dict("records"):
        habitat = str(record.get("Habitat", "")).strip()
        rows.append(
            {
                "sci": str(record["Species1"]).strip(),
                "family_sci": str(record.get("Family1", "")).strip(),
                "mass": record.get("Mass"),
                "habitat": HABITAT_ALIASES.get(habitat, habitat),
                "lat": record.get("Centroid.Latitude"),
                "lon": record.get("Centroid.Longitude"),
                "range_size": record.get("Range.Size"),
                "diet": str(record.get("Trophic.Niche", "")).strip(),
                "migration": _migration_label(record.get("Migration")),
            }
        )
    return rows


def _migration_label(code: Any) -> str:
    """AVONET encodes migration as 1/2/3."""
    return {1: "Sedentary", 2: "Partial migrant", 3: "Migratory"}.get(int(code or 0), "Unknown")


# --------------------------------------------------------------------------
# 2. Wikidata
# --------------------------------------------------------------------------

SPARQL_TEMPLATE = """
SELECT ?taxonName ?commonName ?iucnLabel ?article WHERE {
  VALUES ?taxonName { %s }
  ?item wdt:P225 ?taxonName .
  OPTIONAL { ?item wdt:P1843 ?commonName . FILTER(LANG(?commonName) = "en") }
  OPTIONAL { ?item wdt:P141 ?iucn . }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
"""


def enrich_from_wikidata(rows: list[dict[str, Any]], batch: int = 150) -> None:
    """Attach common name, IUCN status and Wikipedia title, in place.

    Batched because a VALUES clause with 11,000 entries will time out.
    """
    by_name = {row["sci"]: row for row in rows}
    names = list(by_name)

    for start in range(0, len(names), batch):
        chunk = names[start : start + batch]
        values = " ".join(f'"{name}"' for name in chunk)
        query = SPARQL_TEMPLATE % values
        url = f"{WIKIDATA_SPARQL}?{urllib.parse.urlencode({'query': query, 'format': 'json'})}"
        payload = json.loads(_fetch(url, f"wikidata-{start}.json"))

        for binding in payload["results"]["bindings"]:
            row = by_name.get(binding["taxonName"]["value"])
            if row is None:
                continue
            if "commonName" in binding:
                row["name"] = binding["commonName"]["value"]
            if "iucnLabel" in binding:
                row["status"] = binding["iucnLabel"]["value"]
            if "article" in binding:
                row["wiki"] = urllib.parse.unquote(
                    binding["article"]["value"].rsplit("/", 1)[-1]
                ).replace("_", " ")
        time.sleep(1)  # be polite to a free public endpoint


# --------------------------------------------------------------------------
# 3. Popularity
# --------------------------------------------------------------------------


def rank_by_pageviews(rows: list[dict[str, Any]], start: str, end: str) -> list[dict[str, Any]]:
    """Sort by 12-month English Wikipedia pageviews, most-read first.

    This is the slow step: one request per article, rate limited. Expect tens of
    minutes for the full AVONET list. Results are cached per article.
    """
    scored: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        title = row.get("wiki")
        if not title:
            continue
        quoted = urllib.parse.quote(title.replace(" ", "_"), safe="")
        url = PAGEVIEWS_API.format(title=quoted, start=start, end=end)
        try:
            payload = json.loads(_fetch(url, f"views-{quoted[:80]}.json"))
            total = sum(item["views"] for item in payload.get("items", []))
        except Exception:
            total = 0  # article missing or renamed; it simply ranks last
        scored.append((total, row))
        time.sleep(0.1)

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [row for _, row in scored]


# --------------------------------------------------------------------------
# 4. Continent
# --------------------------------------------------------------------------


def attach_continents(rows: Iterable[dict[str, Any]]) -> None:
    """Resolve each centroid to a continent, in place.

    Uses Natural Earth polygons. Centroids landing in the ocean -- common for
    island and seabird species -- snap to the nearest landmass.
    """
    import geopandas as gpd
    from shapely.geometry import Point

    land = gpd.read_file(NATURAL_EARTH_LAND)
    if "CONTINENT" not in land.columns:
        raise RuntimeError(
            "Natural Earth land layer has no CONTINENT column; use the "
            "admin_0_countries layer and dissolve by continent instead"
        )

    for row in rows:
        point = Point(row["lon"], row["lat"])
        hit = land[land.contains(point)]
        if len(hit):
            row["continent"] = hit.iloc[0]["CONTINENT"]
        else:
            distances = land.distance(point)
            row["continent"] = land.loc[distances.idxmin(), "CONTINENT"]


# --------------------------------------------------------------------------
# Colour
# --------------------------------------------------------------------------

# The 24 HBW shades collapse to the player-facing buckets in build_dataset.py.
COLOUR_BUCKETS = {
    "navy": "blue", "sky": "blue", "teal": "blue", "blue": "blue",
    "crimson": "red", "scarlet": "red", "maroon": "red", "red": "red",
    "olive": "green", "lime": "green", "green": "green",
    "tan": "brown", "chestnut": "brown", "buff": "brown", "brown": "brown",
    "charcoal": "black", "black": "black",
    "silver": "gray", "grey": "gray", "gray": "gray",
    "cream": "white", "white": "white",
    "gold": "yellow", "yellow": "yellow",
    "orange": "orange", "rufous": "orange",
    "pink": "pink", "magenta": "pink",
}


def attach_colours(rows: Iterable[dict[str, Any]]) -> None:
    """Set `color` from the HBW plumage proportions (male plumage if dimorphic).

    Raises if the file is absent rather than guessing: a wrong colour clue is
    worse than no colour clue.
    """
    source = RAW_DIR / "hbw_colours.csv"
    if not source.exists():
        raise FileNotFoundError(
            f"{source} not found. Download the plumage colour dataset from "
            "Dryad (doi:10.5061/dryad.70rxwdc6s) and place it there, or run "
            "with the colour clue disabled."
        )

    with source.open(encoding="utf-8") as handle:
        table = {row["species"]: row for row in csv.DictReader(handle)}

    for row in rows:
        record = table.get(row["sci"])
        if not record:
            continue
        shades = {k: float(v) for k, v in record.items() if k != "species" and v}
        if not shades:
            continue
        dominant = max(shades, key=shades.get)
        row["color"] = COLOUR_BUCKETS.get(dominant.lower(), dominant.lower())


def build_rows() -> list[dict[str, Any]]:
    """Entry point used by build_dataset.py --source avonet."""
    rows = load_avonet()
    print(f"AVONET: {len(rows)} species")

    enrich_from_wikidata(rows)
    rows = [r for r in rows if r.get("name") and r.get("wiki")]
    print(f"After Wikidata join: {len(rows)}")

    rows = rank_by_pageviews(rows, "2025010100", "2025123100")[:POOL_SIZE]
    print(f"After popularity cut: {len(rows)}")

    attach_continents(rows)
    attach_colours(rows)

    for row in rows:
        row["wide"] = bool(row.get("range_size") or 0) and row["range_size"] > WIDE_RANGE_KM2
        row["family"] = row.get("family_common") or row.get("family_sci", "")
        row.setdefault("status", "Not assessed")
        row.setdefault("fact", "")

    return rows
