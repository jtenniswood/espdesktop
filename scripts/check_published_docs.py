#!/usr/bin/env python3
"""Verify that the deployed docs match the artifact GitHub Pages was given."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import HTTPRedirectHandler, Request, build_opener

from check_docs_site import BASE, Page, sitemap_urls
from check_public_firmware import PublicFirmwareError, assert_url_non_empty

DISPLAY = 'guition-esp32-s3-4848s040'
DMG = re.compile(
    r'https://github\.com/jtenniswood/espdesktop/releases/download/'
    r'v?(\d+\.\d+\.\d+)/EspDesktop-\1\.dmg'
)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


BUNDLE = re.compile(r'/assets/app\.([A-Za-z0-9_-]+)\.js')


def fingerprint(body):
    return hashlib.sha256(body).hexdigest()[:12]


def bundle_version(body):
    match = BUNDLE.search(body.decode('utf-8', 'replace'))
    return match[1] if match else 'unknown'


CLOUDFLARE_BEACON = re.compile(
    rb'<script[^>]*src="https://static\.cloudflareinsights\.com/beacon\.min\.js[^"]*"[^>]*>\s*</script>\r?\n'
)
BODY_END = re.compile(rb'[ \t\r\n]*</body>')


def published_body(route, body):
    """Normalise the two rewrites Cloudflare applies to HTML on the live host.

    The production host is a Cloudflare-proxied zone with Web Analytics
    enabled, so Cloudflare injects its beacon script before </body> and
    re-serialises the whitespace that preceded the closing tag (proven from a
    GitHub runner: every HTML page came back exactly 367 bytes longer than the
    deployment artifact, while .md pages matched byte for byte). GitHub Pages
    never performs that rewrite, so artifact and live HTML can never be
    byte-identical without removing those two known artefacts.

    Nothing else is exempted: the body is otherwise compared byte for byte,
    and every non-HTML type is compared completely raw.
    """
    if not route.endswith('.html'):
        return body
    return BODY_END.sub(b'</body>', CLOUDFLARE_BEACON.sub(b'', body))


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
    for feed in sorted((dist / 'updates').glob('companion-appcast-v*.xml')):
        files[feed.relative_to(dist).as_posix()] = ('application/xml', feed)

    def check(route):
        url = urljoin(base, route)
        try:
            status, headers, body = fetch(url)
        except (OSError, URLError) as error:
            return f'{url}: {error}'
        served = published_body(route, body)
        if route in redirects:
            target, path, uses_fragment = redirects[route]
            if status == 200:
                raw = path.read_bytes()
                expected = published_body(route, raw)
                if served == expected:
                    return None
                return (
                    f'{url}: redirect HTML differs from the deployment artifact '
                    f'(served {len(body)}B raw / {len(served)}B normalised {fingerprint(served)} '
                    f'bundle {bundle_version(served)}, expected {len(raw)}B / {len(expected)}B '
                    f'{fingerprint(expected)} bundle {bundle_version(expected)})'
                )
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
        raw = path.read_bytes()
        expected = published_body(route, raw)
        if served != expected:
            return (
                f'{url}: response differs from the deployment artifact '
                f'(served {len(body)}B raw / {len(served)}B normalised {fingerprint(served)} '
                f'bundle {bundle_version(served)}, expected {len(raw)}B / {len(expected)}B '
                f'{fingerprint(expected)} bundle {bundle_version(expected)})'
            )
        return None

    with ThreadPoolExecutor(max_workers=8) as executor:
        errors = [error for error in executor.map(check, [*files, *redirects]) if error]

    version = None
    if manifest.is_file():
        version = json.loads(manifest.read_text(encoding='utf-8'))['version'].removeprefix('v')
    downloads = dist / 'download.html'
    if not downloads.is_file():
        downloads = dist / 'screens/4848s040.html'
    for link in sorted(set(Page(downloads.read_text(encoding='utf-8')).links)):
        match = DMG.fullmatch(link)
        if not match:
            continue
        if version and match[1] != version:
            errors.append(f'Mac download {match[1]} and hosted 4848S040 firmware {version} differ')
            continue
        try:
            assert_url_non_empty(link)
        except (OSError, PublicFirmwareError) as error:
            errors.append(f'Mac download {link} could not be verified: {error}')
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
