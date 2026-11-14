#!/usr/bin/env python3
"""Export the built docs' exact-path redirects for a Cloudflare Bulk Redirect list."""

import argparse
import csv
from pathlib import Path
from urllib.parse import urlsplit

from check_published_docs import BASE, expected_routes

HOST = urlsplit(BASE).netloc


def variants(route, file):
    if file.name == 'index.html':
        return [f'{route}index.html'] + ([f'{route}index', route.rstrip('/')] if route else [])
    return [f'{route}.html', f'{route}/']


def redirect_rows(dist):
    files, legacy = expected_routes(dist)
    canonical = {route: file for route, (kind, file) in files.items() if kind == 'text/html'}
    targets = {}

    def add(source, destination):
        target = urlsplit(destination)
        if target.scheme != 'https' or not target.hostname or target.username or target.password:
            raise ValueError(f'Invalid HTTPS redirect destination: {destination}')
        if source in canonical:
            raise ValueError(f'Redirect would shadow a public guide: {source}')
        if source in targets and targets[source] != destination:
            raise ValueError(f'Conflicting redirect destinations: {source}')
        targets[source] = destination

    for route, file in canonical.items():
        for alias in variants(route, file):
            add(alias, BASE + route)

    for route, (destination, file, uses_fragment) in legacy.items():
        if uses_fragment:
            continue
        for alias in [route, *variants(route, file)]:
            add(alias, destination)

    for source, destination in sorted(targets.items()):
        target = urlsplit(destination)
        same_host = target.netloc == HOST
        if same_host and target.path.lstrip('/') not in canonical:
            raise ValueError(f'Redirect does not lead directly to a public guide: {source}')
        preserve_query = 'TRUE' if same_host and not target.query else 'FALSE'
        yield (f'{HOST}/{source}', destination, 301, preserve_query, 'FALSE', 'FALSE', 'FALSE')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    rows = list(redirect_rows(args.dist))
    with args.output.open('w', encoding='utf-8', newline='') as stream:
        csv.writer(stream).writerows(rows)
    print(f'Exported {len(rows)} exact-path 301 redirects')
