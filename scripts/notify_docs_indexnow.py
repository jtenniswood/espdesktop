#!/usr/bin/env python3
"""Notify IndexNow about public guide changes after Pages serves them."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from check_docs_site import Page

HOST = 'espdesktop.com'
BASE = f'https://{HOST}'
ENDPOINT = 'https://api.indexnow.org/indexnow'


def routes(sitemap):
    paths = set()
    for item in ET.fromstring(sitemap).findall('./{*}url/{*}loc'):
        url = urlsplit(item.text or '')
        if (url.scheme != 'https' or url.netloc != HOST or url.query or url.fragment
                or not url.path.startswith('/') or set(url.path.split('/')) & {'.', '..'}):
            raise ValueError('Unexpected public guide URL in sitemap')
        paths.add(url.path)
    if not paths:
        raise ValueError('No public guide URLs in sitemap')
    return paths


def markdown_path(route):
    return route + ('index.md' if route.endswith('/') else '.md')


def digest(markdown, html):
    page = Page(html.decode('utf-8'))
    search_metadata = json.dumps({
        'title': page.title,
        'canonical': page.canonicals,
        'meta': {name: value for name, value in page.meta.items()
                 if name in ('description', 'robots') or name.startswith(('og:', 'twitter:'))},
    }, sort_keys=True).encode('utf-8')
    # The next-guide footer changes when the sidebar changes.
    article = re.sub(rb'\n\[Next \xc2\xb7 [^\n]+\]\([^\n]+\)\s*$', b'', markdown)
    return sha256(search_metadata + b'\n' + article.strip()).hexdigest()


def live_digest(route):
    return digest(read_live(markdown_path(route)), read_live(route))


def read_live(path):
    request = Request(BASE + path, headers={'Cache-Control': 'no-cache'})
    with urlopen(request, timeout=15) as response:
        return response.read()


def prepare(dist, key, receipt):
    # Keep ownership verification in the deployment if the live crawl fails.
    (dist / f'{key}.txt').write_text(key, encoding='utf-8')
    before = routes(read_live('/sitemap.xml'))
    after = routes((dist / 'sitemap.xml').read_bytes())

    def find_update(route):
        relative = markdown_path(route)
        source = dist / relative.lstrip('/')
        current = digest(source.read_bytes(), source.with_suffix('.html').read_bytes())
        if route not in before or current != live_digest(route):
            return route, current
        return None

    with ThreadPoolExecutor(max_workers=8) as executor:
        changes = dict(item for item in executor.map(find_update, sorted(after)) if item)
    changes.update({route: None for route in sorted(before - after)})
    receipt.write_text(json.dumps(changes), encoding='utf-8')
    print(f'IndexNow prepared {len(changes)} changed guide URLs')


def submit(key, receipt):
    changes = json.loads(receipt.read_text(encoding='utf-8'))
    if not changes:
        print('IndexNow has no guide changes to submit')
        return

    for attempt in range(4):
        try:
            if read_live(f'/{key}.txt').decode('utf-8') != key:
                raise ValueError('IndexNow verification file is not ready')
            current = routes(read_live('/sitemap.xml'))
            for route, expected in changes.items():
                if expected is None:
                    if route in current:
                        raise ValueError(f'Retired guide still in sitemap: {route}')
                elif route not in current or live_digest(route) != expected:
                    raise ValueError(f'Updated guide is not yet live: {route}')
            break
        except (ValueError, OSError, URLError) as error:
            if attempt == 3:
                raise RuntimeError('IndexNow could not verify the published changes') from error
            time.sleep(10)

    payload = json.dumps({
        'host': HOST,
        'key': key,
        'urlList': [BASE + route for route in changes],
    }).encode('utf-8')
    request = Request(ENDPOINT, data=payload, headers={'Content-Type': 'application/json; charset=utf-8'})
    with urlopen(request, timeout=15) as response:
        if response.status not in (200, 202):
            raise RuntimeError(f'Unexpected IndexNow status {response.status}')
        print(f'IndexNow received {len(changes)} URLs (HTTP {response.status})')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['prepare', 'submit'])
    parser.add_argument('--dist', type=Path, default=Path('dist'))
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()

    key = os.environ.get('INDEXNOW_KEY', '')
    if not key:
        print('IndexNow is disabled')
        return
    if not re.fullmatch(r'[A-Za-z0-9-]{8,128}', key):
        parser.error('INDEXNOW_KEY must contain 8–128 letters, digits or hyphens')
    try:
        if args.phase == 'prepare':
            prepare(args.dist, key, args.receipt)
        else:
            submit(key, args.receipt)
    except HTTPError as error:
        raise SystemExit(f'IndexNow or Pages returned HTTP {error.code}') from None
    except (ValueError, RuntimeError, OSError, URLError, ET.ParseError) as error:
        raise SystemExit(f'IndexNow: {error}') from None


if __name__ == '__main__':
    main()
