#!/usr/bin/env python3
"""Pull the plumage-colour table out of a Dryad dataset.

The colour dataset is far too large to hand-upload, but Dryad's public API
serves individual files, so CI can fetch just the tabular one and leave the
illustration archives alone.

    python3 pipeline/fetch_dryad_colours.py --doi 10.5061/dryad.70rxwdc6s

Prints the dataset's full file listing, and the contents of any archive it
opens, so the selection can be corrected if the heuristic picks wrong.

Note on Dryad's API: listing a dataset and downloading an individual file are
both open, but the whole-dataset /download endpoint answers 401 without an API
token. Everything here goes through the per-file routes.
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
ARCHIVE = (".zip",)
# A species-by-colour table is a few MB at most; anything bigger is imagery.
MAX_TABULAR_BYTES = 80 * 1024 * 1024


def get(url: str, *, raw: bool = False, browser: bool = False):
    headers = {"User-Agent": USER_AGENT}
    if browser:
        # The file endpoints refuse a bare script User-Agent with a 403. This
        # is the same public download a visitor gets by clicking the file on
        # the dataset page; the data itself is openly licensed.
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
            "Accept": "*/*",
            "Referer": "https://datadryad.org/",
        }
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=600) as response:
        data = response.read()
    return data if raw else json.loads(data)


def download_file(entry: dict) -> bytes:
    """Fetch one dataset file, preferring the API and falling back to the
    public download the website itself uses.

    The whole-dataset /download endpoint requires a token; the per-file routes
    do not, which is the difference between this working and not.
    """
    links = entry.get("_links", {})
    print(f"  available links: {sorted(links)}")

    urls = []
    # The link the API itself advertises for this file is the one that works.
    # Its key varies by Dryad version, hence both spellings.
    for key in ("stash:download", "stash:file-download"):
        href = links.get(key, {}).get("href")
        if href:
            urls.append(href if href.startswith("http") else f"https://datadryad.org{href}")
    file_id = links.get("self", {}).get("href", "").rstrip("/").rsplit("/", 1)[-1]
    if file_id.isdigit():
        urls.append(f"{API}/files/{file_id}/download")
        urls.append(f"https://datadryad.org/downloads/file_stream/{file_id}")

    last: Exception | None = None
    # Each candidate is tried with the script's own User-Agent first, then with
    # a browser one, since some routes 403 the former.
    for url in urls:
        for browser in (False, True):
            try:
                print(f"  trying {url} (browser-ua={browser})")
                blob = get(url, raw=True, browser=browser)
            except Exception as exc:
                print(f"    {exc}")
                last = exc
                continue
            # A 200 is not proof of success here: some routes answer with an
            # HTML interstitial rather than the file.
            if blob[:1] == b"<" or blob[:15].lower().startswith(b"<!doctype html"):
                preview = blob[:120].decode("utf-8", "replace").replace("\n", " ")
                print(f"    got HTML, not the file: {preview}")
                last = RuntimeError("HTML response")
                continue
            print(f"    got {human(len(blob))}, starts with {blob[:4]!r}")
            return blob
    raise RuntimeError(f"could not download {entry.get('path')}: {last}")


def extract_tabular(blob: bytes, label: str) -> list[tuple[str, bytes]]:
    """Pull the tabular members out of a downloaded archive."""
    out: list[tuple[str, bytes]] = []
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        print(f"\n{label} contains {len(zf.namelist())} member(s):")
        for info in sorted(zf.infolist(), key=lambda i: -i.file_size):
            marker = "*" if info.filename.lower().endswith(TABULAR) else " "
            print(f"  {marker} {human(info.file_size):>8}  {info.filename}")
        for info in zf.infolist():
            name = Path(info.filename).name
            if (
                info.filename.lower().endswith(TABULAR)
                and info.file_size <= MAX_TABULAR_BYTES
                and not name.startswith((".", "__"))
            ):
                out.append((name, zf.read(info)))
    return out


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

    # No fallback to the whole-dataset /download endpoint: it answers 401
    # without an API token, where the listing and per-file routes are open.
    entries = list_files(args.doi)

    print(f"\n{len(entries)} file(s):")
    tabular, archives = [], []
    for entry in entries:
        name = entry.get("path", "?")
        size = entry.get("size")
        print(f"  {human(size):>8}  {name}")
        if name.lower().endswith(TABULAR) and (size or 0) <= MAX_TABULAR_BYTES:
            tabular.append(entry)
        elif name.lower().endswith(ARCHIVE):
            archives.append(entry)

    written: list[str] = []

    # Biggest first: the per-species colour matrix is the substantial file,
    # next to any small readme or metadata sheet.
    for entry in sorted(tabular, key=lambda e: e.get("size") or 0, reverse=True):
        name = Path(entry["path"]).name
        print(f"\ndownloading {name} ({human(entry.get('size'))})…")
        (RAW / name).write_bytes(download_file(entry))
        written.append(name)
        if not args.all:
            break

    # The colour tables are commonly published inside a single archive rather
    # than as loose files, which is exactly the case here.
    if not written:
        for entry in sorted(archives, key=lambda e: e.get("size") or 0, reverse=True):
            label = Path(entry["path"]).name
            print(f"\ndownloading {label} ({human(entry.get('size'))})…")
            members = extract_tabular(download_file(entry), label)
            if not members:
                continue
            members.sort(key=lambda m: -len(m[1]))
            for name, data in members if args.all else members[:1]:
                (RAW / name).write_bytes(data)
                written.append(name)
            break

    if not written:
        print("\nno tabular data found in this dataset", file=sys.stderr)
        return 1

    for name in written:
        print(f"wrote pipeline/raw/{name} ({human((RAW / name).stat().st_size)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
