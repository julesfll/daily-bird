"""Assemble the expanded species pool from AVONET plus the committed crawl.

Inputs, both already in the repo:

  pipeline/raw/AVONET Supplementary dataset 1.xlsx   traits and geography
  pipeline/raw/online_data.json                      names, articles, IUCN,
                                                     pageviews, continents

No network access: fetch_online_data.py does all of that in CI and commits its
result, so this step is offline and reproducible.

Selection is by English Wikipedia pageviews, most-read first, which is the only
workable proxy for "a player might have heard of this". AVONET's 11,009 species
are overwhelmingly birds nobody outside ornithology could name.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

RAW = Path(__file__).resolve().parent.parent / "raw"
WORKBOOK = RAW / "AVONET Supplementary dataset 1.xlsx"
ONLINE = RAW / "online_data.json"

POOL_SIZE = 1200

# Every species in the pool can be *guessed*, but only the best-known ones are
# ever the *answer*. A puzzle whose answer is the Lesser Sooty Owl is not
# solvable by anyone who is not already an ornithologist, while a rich guess
# list costs nothing and makes the autocomplete far more satisfying.
# Raise this for more runway at the cost of harder days.
ANSWER_POOL = 600

# Ranges past this get the compass sub-clue suppressed; see build_dataset.py
# for why 35M rather than the 15M the original plan guessed at.
WIDE_RANGE_KM2 = 35_000_000

MIGRATION = {1: "Sedentary", 2: "Partial migrant", 3: "Migratory"}

DIET = {
    "Invertivore": "Insects and invertebrates",
    "Vertivore": "Birds and mammals",
    "Aquatic predator": "Fish and aquatic prey",
    "Granivore": "Seeds and grain",
    "Frugivore": "Fruit",
    "Nectarivore": "Nectar",
    "Herbivore terrestrial": "Leaves and plants",
    "Herbivore aquatic": "Aquatic plants",
    "Scavenger": "Carrion",
    "Omnivore": "Omnivore",
}

# Words that stay lowercase inside a bird's name.
_SMALL = {"of", "the", "and", "a", "an", "in"}


def display_name(title: str) -> str:
    """Turn a Wikipedia article title into a name to show a player.

    Wikipedia titles beat Wikidata's "taxon common name" comprehensively: that
    property yields comma-separated lists ("swift, common swift"), obscure
    synonyms ("Owl Parrot" for the kakapo), inconsistent case, and in at least
    one case a Navajo name tagged as English. Titles are the name people
    actually use.
    """
    # "Merlin (bird)", "Brant (goose)" -- disambiguation is not part of the name.
    name = re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()

    words = []
    for index, word in enumerate(name.split()):
        if index > 0 and word.lower() in _SMALL:
            words.append(word.lower())
        else:
            # Only the start of each space-separated word is capitalised, so
            # "white-bellied sea eagle" becomes "White-bellied Sea Eagle"
            # rather than "White-Bellied ...".
            words.append(word[:1].upper() + word[1:])
    return " ".join(words)


def to_float(value: Any) -> float | None:
    """AVONET writes every missing value as the string 'NA', in every column."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def clean(value: Any) -> str:
    text = str(value).strip() if value is not None else ""
    return "" if text in ("", "NA", "None") else text


def load_avonet() -> dict[str, dict[str, Any]]:
    import openpyxl

    wb = openpyxl.load_workbook(WORKBOOK, read_only=True)
    ws = wb["AVONET1_BirdLife"]
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    at = {name: i for i, name in enumerate(header)}

    table: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = row[at["Species1"]]
        if not name:
            continue
        table[name] = {
            "family_sci": clean(row[at["Family1"]]),
            "mass": to_float(row[at["Mass"]]),
            "habitat": clean(row[at["Habitat"]]),
            "migration": to_float(row[at["Migration"]]),
            "niche": clean(row[at["Trophic.Niche"]]),
            "lat": to_float(row[at["Centroid.Latitude"]]),
            "lon": to_float(row[at["Centroid.Longitude"]]),
            "range": to_float(row[at["Range.Size"]]),
        }
    return table


def build_rows(pool_size: int = POOL_SIZE) -> list[dict[str, Any]]:
    """Entry point used by build_dataset.py --source avonet."""
    from .families import FAMILY_LABELS

    if not ONLINE.exists():
        raise FileNotFoundError(
            f"{ONLINE} missing. Run the 'Fetch online data' workflow first."
        )

    avonet = load_avonet()
    online = json.loads(ONLINE.read_text(encoding="utf-8"))
    online.sort(key=lambda r: r.get("views") or 0, reverse=True)

    rows: list[dict[str, Any]] = []
    unmapped: Counter[str] = Counter()
    skipped = Counter()

    for record in online:
        if len(rows) >= pool_size:
            break
        if not record.get("views"):
            skipped["no pageviews"] += 1
            continue

        traits = avonet.get(record["sci"])
        if traits is None:
            skipped["not in AVONET"] += 1
            continue
        if not record.get("wiki"):
            skipped["no article"] += 1
            continue
        if traits["mass"] is None or not traits["habitat"]:
            skipped["missing traits"] += 1
            continue
        if traits["lat"] is None or not record.get("continent"):
            skipped["no location"] += 1
            continue

        family = FAMILY_LABELS.get(traits["family_sci"])
        if not family:
            unmapped[traits["family_sci"]] += 1
            continue

        rows.append(
            {
                # Rank is by pageviews, so the earliest rows are the best known.
                "answer": len(rows) < ANSWER_POOL,
                "sci": record["sci"],
                "name": display_name(record["wiki"]),
                "family": family,
                "mass": round(traits["mass"], 1),
                "habitat": traits["habitat"],
                "continent": record["continent"],
                "lat": round(traits["lat"], 2),
                "lon": round(traits["lon"], 2),
                "wide": bool(traits["range"] and traits["range"] > WIDE_RANGE_KM2),
                "wiki": record["wiki"],
                "diet": DIET.get(traits["niche"]) or traits["niche"] or "Varied",
                "migration": MIGRATION.get(
                    int(traits["migration"]) if traits["migration"] else 0, "Unknown"
                ),
                # Wikidata returns these lowercase ("least concern"); the Red
                # List writes them as titles.
                "status": (record.get("status") or "Not assessed").title(),
                # No hand-written trivia at this scale; the reveal card falls
                # back to the Wikipedia extract it already fetches for the photo.
                "fact": "",
            }
        )

    answers = sum(1 for r in rows if r["answer"])
    print(f"  selected {len(rows)} species, {answers} of them answer-eligible")
    print(f"  skipped: {dict(skipped)}")
    if unmapped:
        print(f"  {len(unmapped)} unmapped families cost {sum(unmapped.values())} species:")
        for name, count in unmapped.most_common(60):
            print(f"    {count:>4}  {name}")
    return rows
