# Attribution

## Trait framework

**AVONET** — Tobias, J.A. et al. (2022), *AVONET: morphological, ecological and
geographical data for all birds*, Ecology Letters 25: 581–597.
DOI [10.6084/m9.figshare.16586228](https://doi.org/10.6084/m9.figshare.16586228).
Licensed **CC BY 4.0**.

Every measurable trait in the shipped dataset comes from AVONET: body mass,
habitat category, range centroid, range size, migration behaviour and trophic
niche. `pipeline/enrich_from_avonet.py` reads the published workbook
(`AVONET Supplementary dataset 1`, sheet `AVONET1_BirdLife`) directly; the
workbook is committed under `pipeline/raw/` so the join is reproducible.

Diet labels are AVONET's trophic niches reworded for a general audience
(`Invertivore` → "Insects and invertebrates"); the categories are unchanged.

## Taxonomy and common names

**eBird/Clements Checklist of Birds of the World**, Cornell Lab of Ornithology.
Scientific names and English common names follow this checklist.

## Photos and articles

**Wikipedia / Wikimedia Commons.** Reveal-screen photographs and article links
are fetched from the Wikipedia REST API at the moment a game ends. Images are
licensed individually — most under **CC BY-SA** or public domain — and each
reveal card links back to the source article, where the per-image licence and
author are recorded.

No images are redistributed with this repository; they are loaded from
Wikimedia's servers on demand.

## Plumage colour

**Han, X. et al., plumage colour dataset**, Dryad,
[doi:10.5061/dryad.70rxwdc6s](https://doi.org/10.5061/dryad.70rxwdc6s).

Referenced by the full pipeline for the colour clue. The shipped curated dataset
does not use it — its colours were assigned by hand — so this credit applies
only if you run `--source avonet` with that file present.

## Conservation status

IUCN Red List categories are sourced via **Wikidata** (property P141, CC0)
rather than the IUCN API directly, whose terms of use restrict application and
commercial use.
