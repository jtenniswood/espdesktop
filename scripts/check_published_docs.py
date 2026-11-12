#!/usr/bin/env python3
"""Verify that the deployed docs match the artifact GitHub Pages was given."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import HTTPRedirectHandler, Request, build_opener

from check_docs_site import BASE, Page, sitemap_urls

DISPLAY = 'guition-esp32-s3-4848s040'
DMG = re.compile(
    r'https://github\.com/jtenniswood/espdesktop/releases/download/'
    r'v?(\d+\.\d+\.\d+)/EspDesktop-\1\.dmg'
)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url):
    request = Request(url, headers={
        'Cache-Control': 'no-cache',
        'User-Agent': 'EspDesktop-Docs-Verification/1.0 (+https://github.com/jtenniswood/espdesktop)',
    })
    try:
        with build_opener(NoRedirect).open(request, timeout=15) as response:
            return response.status, response.headers, response.read()
    except HTTPError as response:
        with response:
            return response.code, response.headers, b''


def html_route(path):
    if path.name == 'index.html':
        return '' if path.parent == Path('.') else f'{path.parent.as_posix()}/'
    return path.with_suffix('').as_posix()


def expected_routes(dist):
    files = {
        'robots.txt': ('text/plain', dist / 'robots.txt'),
        'llms.txt': ('text/plain', dist / 'llms.txt'),
        'sitemap.xml': ('application/xml', dist / 'sitemap.xml'),
    }
    guides = sitemap_urls((dist / 'sitemap.xml').read_text(encoding='utf-8'))
    for url in guides:
        route = url.removeprefix(BASE)
        if route == url:
            raise ValueError(f'Sitemap URL is outside {BASE}: {url}')
        stem = f'{route}index' if not route or route.endswith('/') else route
        files[route] = ('text/html', dist / f'{stem}.html')
        files[f'{stem}.md'] = ('text/markdown', dist / f'{stem}.md')

    redirects = {}
    for path in dist.rglob('*.html'):
        route = html_route(path.relative_to(dist))
        if route in files:
            continue
        html = path.read_text(encoding='utf-8')
        refresh = Page(html).meta.get('refresh', '')
        if refresh.startswith('0; url='):
            redirects[route] = (refresh.removeprefix('0; url='), path, 'location.hash' in html)
    return files, redirects


def verify(dist, base):
    files, redirects = expected_routes(dist)
    manifest_path = f'firmware/{DISPLAY}/manifest.json'
    manifest = dist / manifest_path
    if manifest.is_file():
        files[manifest_path] = ('application/json', manifest)

    def check(route):
        url = urljoin(base, route)
        try:
            status, headers, body = fetch(url)
        except (OSError, URLError) as error:
            return f'{url}: {error}'
        if route in redirects:
            target, path, uses_fragment = redirects[route]
            if status == 200:
                if body == path.read_bytes():
                    return None
                return f'{url}: redirect HTML differs from the deployment artifact'
            if uses_fragment:
                return f'{url}: expected HTML that preserves section links, got HTTP {status}'
            if status in (301, 308) and urljoin(url, headers.get('Location', '')) == target:
                return None
            return f'{url}: expected a permanent redirect to {target}, got HTTP {status}'
        media_type, path = files[route]
        served_type = headers.get_content_type()
        accepted_types = {media_type}
        if media_type == 'application/xml':
            accepted_types.add('text/xml')
        if status != 200 or served_type not in accepted_types:
            return f'{url}: expected HTTP 200 and {media_type}, got HTTP {status} and {served_type}'
        if body != path.read_bytes():
            return f'{url}: response differs from the deployment artifact'
        return None

    with ThreadPoolExecutor(max_workers=8) as executor:
        errors = [error for error in executor.map(check, [*files, *redirects]) if error]

    if manifest.is_file():
        version = json.loads(manifest.read_text(encoding='utf-8'))['version'].removeprefix('v')
        downloads = dist / 'download.html'
        if not downloads.is_file():
            downloads = dist / 'screens/4848s040.html'
        for link in Page(downloads.read_text(encoding='utf-8')).links:
            match = DMG.fullmatch(link)
            if match and match[1] != version:
                errors.append(f'Mac download {match[1]} and hosted 4848S040 firmware {version} differ')
    if not errors:
        print(f'Published docs verified: {len(files)} files and {len(redirects)} redirects')
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, required=True)
    parser.add_argument('--base-url', default=BASE)
    parser.add_argument('--attempts', type=int, default=4)
    args = parser.parse_args()
    if args.attempts < 1:
        parser.error('--attempts must be positive')
    for attempt in range(args.attempts):
        failures = verify(args.dist, args.base_url.rstrip('/') + '/')
        if not failures:
            break
        if attempt == args.attempts - 1:
            raise SystemExit('\n'.join(failures))
        print(f'Waiting for Pages to serve the new artifact ({len(failures)} discrepancies)', flush=True)
        time.sleep(15)
