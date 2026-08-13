#!/usr/bin/env python3
"""Build public/data/species.json, the single dataset the game ships with.

Two sources feed the same output schema:

  --source curated   (default) the hand-checked seed in curated/seed_species.json
  --source avonet    the full AVONET + Wikidata + pageviews pipeline

The curated seed is what the live site uses today. The AVONET path produces the
same records for a much larger pool; see sources/avonet.py for its status.

Everything downstream of the source -- validation, size bucketing, the
fixed-seed shuffle that becomes the daily order -- is shared, so swapping
sources changes only how many birds are in the pool.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = REPO_ROOT / "pipeline" / "curated" / "seed_species.json"
OUTPUT_PATH = REPO_ROOT / "public" / "data" / "species.json"

# Fixing the seed keeps the daily order stable across rebuilds. Changing it
# reshuffles every future puzzle, so don't, once the game is live.
SHUFFLE_SEED = 20260810
LAUNCH_DATE = "2026-08-10"

CONTINENTS = {
    "North America",
    "South America",
    "Europe",
    "Africa",
    "Asia",
    "Oceania",
    "Antarctica",
}

# AVONET's habitat vocabulary, used as-is so the two sources stay comparable.
HABITATS = {
    "Forest",
    "Woodland",
    "Shrubland",
    "Grassland",
    "Wetland",
    "Desert",
    "Rock",
    "Coastal",
    "Marine",
    "Riverine",
    "Human Modified",
}

# Player-facing colour buckets. The HBW dataset's 24 shades collapse into these.
COLORS = {
    "black",
    "white",
    "gray",
    "brown",
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "pink",
}

REQUIRED_FIELDS = (
    "sci",
    "name",
    "family",
    "mass",
    "habitat",
    "continent",
    "lat",
    "lon",
    "wide",
    "wiki",
)
REVEAL_FIELDS = ("diet", "migration", "status", "fact")
# Colour is optional: the expanded pool has no licensable colour source, and
# the clue hides itself when the data is absent. Trivia is optional for the
# same practical reason -- nobody is hand-writing 1,200 fun facts, so the
# reveal card falls back to the Wikipedia extract it already fetches.
OPTIONAL_REVEAL_FIELDS = ("fact",)

def nice_number(value: float) -> int:
    """Snap to the nearest round number a player can hold in their head.

    Nearest, not upward: rounding 17 g up to 50 g would sweep two quintiles of
    small passerines into one bucket.
    """
    if value <= 0:
        return 1
    exponent = math.floor(math.log10(value))
    base = 10**exponent
    candidates = [step * base for step in (1, 2, 5, 10)]
    return int(min(candidates, key=lambda c: abs(c - value)))


def mass_label(grams: float) -> str:
    if grams >= 1000:
        return f"{grams / 1000:g} kg"
    return f"{grams:g} g"


def size_thresholds(masses: list[float]) -> list[tuple[str, int]]:
    """Cut the pool into five roughly equal size classes.

    Derived from the pool's own mass quintiles rather than fixed numbers,
    because the right cuts depend entirely on which birds are in it: a pool of
    well-known species skews large, while the full taxonomy is mostly small
    passerines. Fixed thresholds put 382 of 1,200 species in one bucket.
    """
    ordered = sorted(masses)
    cuts = []
    for quintile in (0.2, 0.4, 0.6, 0.8):
        raw = ordered[int(len(ordered) * quintile)]
        candidate = nice_number(raw)
        # Keep the cuts strictly increasing even when two quintiles round together.
        if cuts and candidate <= cuts[-1]:
            candidate = cuts[-1] * 2
        cuts.append(candidate)
    return list(zip(("XS", "S", "M", "L"), cuts))


def size_range_labels(thresholds: list[tuple[str, int]]) -> dict[str, str]:
    cuts = [c for _, c in thresholds]
    labels = {"XS": f"under {mass_label(cuts[0])}"}
    for index, (bucket, _) in enumerate(thresholds[1:], start=1):
        labels[bucket] = f"{mass_label(cuts[index - 1])} – {mass_label(cuts[index])}"
    labels["XL"] = f"over {mass_label(cuts[-1])}"
    return labels


def mass_to_bucket(grams: float, thresholds: list[tuple[str, int]]) -> str:
    """The pipeline is the only place mass becomes a bucket.

    The client never re-derives this: it reads the precomputed `size` field and
    the range labels shipped alongside, so there is a single source of truth.
    """
    for bucket, ceiling in thresholds:
        if grams < ceiling:
            return bucket
    return "XL"


class ValidationError(Exception):
    pass


def validate(row: dict[str, Any], index: int) -> list[str]:
    """Return a list of problems with one record; empty means it is usable."""
    problems: list[str] = []
    label = row.get("name") or row.get("sci") or f"row {index}"

    for field in REQUIRED_FIELDS:
        if row.get(field) in (None, ""):
            problems.append(f"{label}: missing {field}")

    if row.get("continent") not in CONTINENTS:
        problems.append(f"{label}: unknown continent {row.get('continent')!r}")
    if row.get("habitat") not in HABITATS:
        problems.append(f"{label}: unknown habitat {row.get('habitat')!r}")
    if row.get("color") and row["color"] not in COLORS:
        problems.append(f"{label}: unknown colour {row.get('color')!r}")

    mass = row.get("mass")
    if not isinstance(mass, (int, float)) or mass <= 0:
        problems.append(f"{label}: mass must be a positive number, got {mass!r}")

    for axis, limit in (("lat", 90), ("lon", 180)):
        value = row.get(axis)
        if not isinstance(value, (int, float)) or abs(value) > limit:
            problems.append(f"{label}: {axis} out of range: {value!r}")

    if not isinstance(row.get("wide"), bool):
        problems.append(f"{label}: wide must be true or false")

    for field in REVEAL_FIELDS:
        if field not in OPTIONAL_REVEAL_FIELDS and not row.get(field):
            problems.append(f"{label}: missing reveal field {field}")

    return problems


def to_species(
    row: dict[str, Any], species_id: int, thresholds: list[tuple[str, int]]
) -> dict[str, Any]:
    return {
        "id": species_id,
        "sci": row["sci"],
        "name": row["name"],
        "family": row["family"],
        "color": row.get("color", ""),
        "mass": row["mass"],
        "size": mass_to_bucket(row["mass"], thresholds),
        "habitat": row["habitat"],
        "continent": row["continent"],
        "lat": row["lat"],
        "lon": row["lon"],
        "wide": row["wide"],
        "wiki": row["wiki"],
        "reveal": {field: row[field] for field in REVEAL_FIELDS},
    }


def load_curated() -> list[dict[str, Any]]:
    with SEED_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_avonet() -> list[dict[str, Any]]:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from sources.avonet import build_rows

    return build_rows()


def report_distribution(species: list[dict[str, Any]]) -> None:
    """Print the clue distributions. Lopsided clues make for a dull game."""
    for field in ("size", "continent", "color", "habitat"):
        counts = Counter(s[field] for s in species)
        summary = ", ".join(f"{k} {v}" for k, v in counts.most_common())
        print(f"  {field:10s} {summary}")

    families = Counter(s["family"] for s in species)
    print(f"  {'families':10s} {len(families)} distinct, largest {families.most_common(1)[0]}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=("curated", "avonet"), default="curated")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail on any invalid record instead of dropping it.",
    )
    parser.add_argument("--out", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    rows = load_curated() if args.source == "curated" else load_avonet()
    print(f"Loaded {len(rows)} rows from {args.source}")

    kept: list[dict[str, Any]] = []
    dropped = 0
    for index, row in enumerate(rows):
        problems = validate(row, index)
        if problems:
            dropped += 1
            for problem in problems:
                print(f"  DROP {problem}", file=sys.stderr)
            if args.strict:
                raise ValidationError("invalid record with --strict set")
            continue
        kept.append(row)

    seen_sci = Counter(row["sci"] for row in kept)
    duplicates = [sci for sci, count in seen_sci.items() if count > 1]
    if duplicates:
        raise ValidationError(f"duplicate scientific names: {duplicates}")

    thresholds = size_thresholds([row["mass"] for row in kept])
    print("Size cuts from the pool's own quintiles: "
          + ", ".join(f"{b}<{c}g" for b, c in thresholds))
    species = [to_species(row, i, thresholds) for i, row in enumerate(kept)]
    if not species:
        raise ValidationError("no usable species; refusing to write an empty pool")

    # Shuffle indices, not the list, so `species` stays in a readable order and
    # only pool_order encodes the daily sequence.
    #
    # Every species is guessable, but a source may mark only its better-known
    # ones as answer-eligible: being asked for a bird you could not name is a
    # bad puzzle, while a long guess list is a good one.
    pool_order = [i for i, row in enumerate(kept) if row.get("answer", True)]
    random.Random(SHUFFLE_SEED).shuffle(pool_order)
    if len(pool_order) < len(species):
        print(
            f"Answers drawn from the {len(pool_order)} best-known of "
            f"{len(species)} species; all {len(species)} remain guessable"
        )

    # The colour clue only appears when the data can actually support it.
    has_colour = all(s["color"] for s in species)
    if not has_colour:
        missing = sum(1 for s in species if not s["color"])
        print(f"Colour clue disabled: {missing}/{len(species)} species have no colour")

    payload = {
        "launchDate": LAUNCH_DATE,
        "poolOrder": pool_order,
        "clues": {"color": has_colour},
        "sizeRanges": size_range_labels(thresholds),
        "species": species,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")

    size_kb = args.out.stat().st_size / 1024
    print(f"Wrote {len(species)} species to {args.out} ({size_kb:.0f} KB), dropped {dropped}")
    years = len(pool_order) / 365
    print(
        f"Pool gives {len(pool_order)} days of puzzles "
        f"({years:.1f} years) before it repeats."
    )
    report_distribution(species)
    return 0


if __name__ == "__main__":
    sys.exit(main())
