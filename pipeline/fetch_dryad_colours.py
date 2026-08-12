#!/usr/bin/env python3
"""Pull the plumage-colour table out of a Dryad dataset.

The colour dataset is far too large to hand-upload, but Dryad's public API
serves individual files, so CI can fetch just the tabular one and leave the
illustration archives alone.

    python3 pipeline/fetch_dryad_colours.py --doi 10.5061/dryad.70rxwdc6s

Prints the dataset's full file listing either way, so the selection can be
corrected if the heuristic picks wrong. Falls back to streaming the whole
dataset zip and extracting only its tabular members if the per-file endpoints
are unavailable.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RAW = REPO / "pipeline" / "raw"
API = "https://datadryad.org/api/v2"
USER_AGENT = "daily-bird-pipeline/1.0 (https://github.com/julesfll/daily-bird)"

TABULAR = (".csv", ".tsv", ".txt", ".xlsx", ".xls")
# A species-by-colour table is a few MB at most; anything bigger is imagery.
MAX_TABULAR_BYTES = 80 * 1024 * 1024


def get(url: str, *, raw: bool = False):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        data = response.read()
    return data if raw else json.loads(data)


def human(size: int | None) -> str:
    if not size:
        return "?"
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.0f}{unit}"
        size /= 1024
    return f"{size:.0f}TB"


def list_files(doi: str) -> list[dict]:
    """Walk dataset -> latest version -> files."""
    encoded = urllib.parse.quote(f"doi:{doi}", safe="")
    dataset = get(f"{API}/datasets/{encoded}")
    print(f"dataset: {dataset.get('title', '(untitled)')}")

    version_path = dataset.get("_links", {}).get("stash:version", {}).get("href")
    if not version_path:
        versions = get(f"{API}/datasets/{encoded}/versions")
        embedded = versions.get("_embedded", {}).get("stash:versions", [])
        if not embedded:
            raise RuntimeError("no versions listed for this dataset")
        version_path = embedded[-1]["_links"]["self"]["href"]

    files = get(f"https://datadryad.org{version_path}/files")
    return files.get("_embedded", {}).get("stash:files", [])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--doi", required=True, help="e.g. 10.5061/dryad.70rxwdc6s")
    parser.add_argument("--all", action="store_true", help="download every tabular file")
    args = parser.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)

    try:
        entries = list_files(args.doi)
    except Exception as exc:
        print(f"file listing unavailable ({exc}); falling back to the full zip", file=sys.stderr)
        return fallback_zip(args.doi)

    print(f"\n{len(entries)} file(s):")
    wanted = []
    for entry in entries:
        name = entry.get("path", "?")
        size = entry.get("size")
        print(f"  {human(size):>8}  {name}")
        if name.lower().endswith(TABULAR) and (size or 0) <= MAX_TABULAR_BYTES:
            wanted.append(entry)

    if not wanted:
        print("\nno tabular file found; falling back to the full zip", file=sys.stderr)
        return fallback_zip(args.doi)

    # Biggest tabular file first: the per-species colour matrix is the
    # substantial one, next to any small readme or metadata sheet.
    wanted.sort(key=lambda e: e.get("size") or 0, reverse=True)
    if not args.all:
        wanted = wanted[:1]

    for entry in wanted:
        href = entry["_links"]["stash:file-download"]["href"]
        name = Path(entry["path"]).name
        print(f"\ndownloading {name} ({human(entry.get('size'))})…")
        (RAW / name).write_bytes(get(f"https://datadryad.org{href}", raw=True))
        print(f"  wrote pipeline/raw/{name}")
    return 0


def fallback_zip(doi: str) -> int:
    encoded = urllib.parse.quote(f"doi:{doi}", safe="")
    url = f"{API}/datasets/{encoded}/download"
    print(f"streaming {url} …")
    blob = get(url, raw=True)
    print(f"  {human(len(blob))} downloaded")

    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        print(f"\n{len(zf.namelist())} member(s):")
        for info in zf.infolist():
            print(f"  {human(info.file_size):>8}  {info.filename}")
        members = [
            i
            for i in zf.infolist()
            if i.filename.lower().endswith(TABULAR) and i.file_size <= MAX_TABULAR_BYTES
        ]
        if not members:
            print("no tabular member found", file=sys.stderr)
            return 1
        members.sort(key=lambda i: i.file_size, reverse=True)
        target = members[0]
        name = Path(target.filename).name
        (RAW / name).write_bytes(zf.read(target))
        print(f"\nwrote pipeline/raw/{name} ({human(target.file_size)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
