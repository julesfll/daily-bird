#!/usr/bin/env python3
"""Overwrite the curated seed's measurable traits with AVONET's published values.

The seed's common names, colours, player-facing family labels, trivia and
conservation status stay as they are -- AVONET does not carry them. Everything
AVONET *is* authoritative for is taken from it:

    mass, habitat, range centroid, range size, migration, trophic niche

Run once against the workbook, then rebuild:

    python3 pipeline/enrich_from_avonet.py --workbook "AVONET Supplementary dataset 1.xlsx"
    python3 pipeline/build_dataset.py --strict

The AVONET1_BirdLife sheet is the spine: it is the only one carrying range
centroids and range sizes. The eBird sheet (AVONET2) has the traits but no
geography at all, which is worth knowing if you follow the original plan's
instruction to use it.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SEED = REPO / "pipeline" / "curated" / "seed_species.json"

# Species whose range is so large that the direction to its centroid tells a
# player nothing useful; the compass sub-clue is suppressed for these.
#
# Tuned against the real distribution rather than the plan's placeholder 15M,
# which flagged 23% of the pool -- including Eurasia-only birds like Great Tit
# (33M) whose centroid is perfectly informative. Range size is an imperfect
# proxy for "spans many continents" at any threshold (Osprey is genuinely
# global at 31M, below Great Tit), but 35M cuts closest to the birds a player
# would actually call cosmopolitan.
WIDE_RANGE_KM2 = 35_000_000

MIGRATION = {1: "Sedentary", 2: "Partial migrant", 3: "Migratory"}

# AVONET's trophic niches are the right categories but the wrong register for a
# reveal card: a casual player does not read "Invertivore". Same buckets, plain
# words.
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

# AVONET1 follows BirdLife taxonomy, which splits or renames a few genera
# relative to the eBird/Clements names the seed uses. These map seed name ->
# AVONET name for the join only: the seed keeps its own spelling, because that
# is the one birders (and eBird) recognise and the one shown to players.
SYNONYMS = {
    "Dryocopus pileatus": "Hylatomus pileatus",
    "Psittacula krameri": "Alexandrinus krameri",
    "Threskiornis molucca": "Threskiornis moluccus",
    "Stercorarius maccormicki": "Catharacta maccormicki",
    "Strigops habroptilus": "Strigops habroptila",
}

# Rough boxes used only to flag a centroid that contradicts its continent
# label, so the mismatch gets a human look rather than silently shipping.
CONTINENT_BOX = {
    "North America": (5, 84, -172, -50),
    "South America": (-57, 14, -83, -33),
    "Europe": (35, 72, -26, 62),
    "Africa": (-36, 38, -19, 53),
    "Asia": (-11, 79, 25, 181),
    "Oceania": (-51, 1, 109, 181),
    "Antarctica": (-91, -55, -181, 181),
}


def load_avonet(workbook: Path) -> dict[str, dict]:
    import openpyxl

    wb = openpyxl.load_workbook(workbook, read_only=True)
    ws = wb["AVONET1_BirdLife"]
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    at = {name: i for i, name in enumerate(header)}

    table: dict[str, dict] = {}
    for row in rows:
        name = row[at["Species1"]]
        if not name:
            continue
        table[name] = {
            "family_sci": row[at["Family1"]],
            "mass": row[at["Mass"]],
            "habitat": row[at["Habitat"]],
            "migration": row[at["Migration"]],
            "niche": row[at["Trophic.Niche"]],
            "lat": row[at["Centroid.Latitude"]],
            "lon": row[at["Centroid.Longitude"]],
            "range": row[at["Range.Size"]],
        }
    return table


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    avonet = load_avonet(args.workbook)
    seed = json.loads(SEED.read_text(encoding="utf-8"))

    unmatched: list[str] = []
    suspect_continent: list[str] = []
    counts = {k: 0 for k in ("mass", "habitat", "centroid", "wide", "migration", "diet")}

    for row in seed:
        sci = SYNONYMS.get(row["sci"], row["sci"])
        record = avonet.get(sci)
        if record is None:
            unmatched.append(f"{row['name']} ({row['sci']})")
            continue

        if record["mass"]:
            if abs(row["mass"] - record["mass"]) > 0.5:
                counts["mass"] += 1
            row["mass"] = round(record["mass"], 1)

        if record["habitat"]:
            if row["habitat"] != record["habitat"]:
                counts["habitat"] += 1
            row["habitat"] = record["habitat"]

        if record["lat"] is not None and record["lon"] is not None:
            if abs(row["lat"] - record["lat"]) > 1 or abs(row["lon"] - record["lon"]) > 1:
                counts["centroid"] += 1
            row["lat"] = round(record["lat"], 2)
            row["lon"] = round(record["lon"], 2)

        if record["range"]:
            wide = record["range"] > WIDE_RANGE_KM2
            if wide != row["wide"]:
                counts["wide"] += 1
            row["wide"] = wide

        label = MIGRATION.get(int(record["migration"] or 0))
        if label:
            if row["migration"] != label:
                counts["migration"] += 1
            row["migration"] = label

        if record["niche"] and record["niche"] != "NA":
            diet = DIET.get(record["niche"], record["niche"])
            if row["diet"] != diet:
                counts["diet"] += 1
            row["diet"] = diet

        box = CONTINENT_BOX.get(row["continent"])
        if box:
            lo_lat, hi_lat, lo_lon, hi_lon = box
            if not (lo_lat <= row["lat"] <= hi_lat and lo_lon <= row["lon"] <= hi_lon):
                suspect_continent.append(
                    f"{row['name']:28s} {row['continent']:15s} centroid=({row['lat']},{row['lon']})"
                )

    print(f"matched {len(seed) - len(unmatched)}/{len(seed)} species")
    print("fields changed: " + ", ".join(f"{k}={v}" for k, v in counts.items()))

    if unmatched:
        print(f"\nUNMATCHED ({len(unmatched)}):")
        for name in unmatched:
            print(f"  {name}")

    if suspect_continent:
        print(f"\nCENTROID OUTSIDE ITS CONTINENT LABEL ({len(suspect_continent)}) — review:")
        for line in suspect_continent:
            print(f"  {line}")

    if args.dry_run:
        print("\n--dry-run: seed not written")
        return 0

    text = json.dumps(seed, ensure_ascii=False, indent=None)
    text = text.replace("}, {", "},\n{").replace("[{", "[\n{").replace("}]", "}\n]")
    SEED.write_text(text + "\n", encoding="utf-8")
    print(f"\nwrote {SEED}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
