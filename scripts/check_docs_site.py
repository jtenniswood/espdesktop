#!/usr/bin/env python3
"""Check the published HTML contract, or collect a read-only live SEO baseline."""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://espdesktop.com/'
PREVIOUS_BASE = 'https://jtenniswood.github.io/espdesktop/'


def normalized(value):
    return ' '.join(value.replace('\u200b', '').split())


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.title = ''
        self.meta = {}
        self.canonicals = []
        self.described_by = []
        self.markdown_alternates = []
        self.h1 = []
        self.ids = set()
        self.links = []
        self.images = []
        self.schemas = []
        self.faq = []
        self.in_main = False
        self.capture = None
        self.schema = None
        self.question = None
        self.answer = []
        self.question_heading = False
        self.feed(html)

    def finish_answer(self):
        if self.question is not None:
            self.faq.append((normalized(self.question), normalized(''.join(self.answer))))
        self.question = None
        self.answer = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])
        if tag == 'img':
            self.images.append(attrs)
        if tag == 'meta':
            self.meta[attrs.get('name', attrs.get('property', attrs.get('http-equiv', '')))] = attrs.get('content', '')
        if tag == 'link':
            if attrs.get('rel') == 'canonical':
                self.canonicals.append(attrs.get('href'))
            if attrs.get('rel') == 'describedby':
                self.described_by.append(attrs.get('href'))
            if attrs.get('rel') == 'alternate' and attrs.get('type') == 'text/markdown':
                self.markdown_alternates.append(attrs.get('href'))
        if tag == 'main':
            self.in_main = True
        if self.in_main and tag in ('p', 'li', 'br'):
            self.answer.append(' ')
        if tag == 'title':
            self.capture = 'title'
        if tag == 'h1':
            self.h1.append('')
            self.capture = 'h1'
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.schema = ''
        if self.in_main and tag in ('h2', 'h3'):
            self.finish_answer()
            if tag == 'h3':
                self.question = ''
                self.question_heading = True

    def handle_endtag(self, tag):
        if tag == self.capture:
            self.capture = None
        if tag == 'h3':
            self.question_heading = False
        if tag == 'main':
            self.finish_answer()
            self.in_main = False
        if tag == 'script' and self.schema is not None:
            schema = json.loads(self.schema)
            self.schemas.extend(schema.get('@graph', [schema]))
            self.schema = None

    def handle_data(self, data):
        if self.capture == 'title':
            self.title += data
        elif self.capture == 'h1':
            self.h1[-1] += data
        if self.schema is not None:
            self.schema += data
        if self.in_main and self.question is not None:
            if self.question_heading:
                self.question += data
            else:
                self.answer.append(data)


def text_only(html):
    class Text(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts = []

        def handle_data(self, data):
            self.parts.append(data)

        def handle_starttag(self, tag, attrs):
            if tag in ('p', 'li', 'br'):
                self.parts.append(' ')

    parser = Text()
    parser.feed(html)
    return normalized(''.join(parser.parts))


def sitemap_urls(xml):
    return [node.text for node in ET.fromstring(xml).findall('.//{*}loc')]


def snapshot(pages):
    titles = Counter(page.title for page in pages.values())
    descriptions = Counter(page.meta.get('description', '') for page in pages.values())
    return {
        'captured_at': datetime.now(timezone.utc).isoformat(),
        'sitemap_urls': len(pages),
        'generated_urls': [url for url in pages if '/generated/' in url],
        'duplicate_titles': {title: count for title, count in titles.items() if count > 1},
        'duplicate_descriptions': {description: count for description, count in descriptions.items() if count > 1},
        'missing_h1': [url for url, page in pages.items() if not page.h1],
        'missing_metadata': [url for url, page in pages.items() if not page.title or not page.meta.get('description') or not page.canonicals],
        'missing_share_image_alt': [url for url, page in pages.items() if not page.meta.get('og:image:alt')],
        'missing_breadcrumbs': [url for url, page in pages.items() if url != BASE and
                                not any(schema.get('@type') == 'BreadcrumbList' for schema in page.schemas)],
        'search_console_data': 'Not available in this crawl; export from the verified owner account.',
    }


def live_snapshot(base):
    def get(url):
        with urlopen(url, timeout=30) as response:
            return response.read().decode()

    urls = sitemap_urls(get(urljoin(base, 'sitemap.xml')))
    with ThreadPoolExecutor(max_workers=6) as executor:
        return snapshot(dict(zip(urls, executor.map(lambda url: Page(get(url)), urls))))


def check_markdown_guides(dist, pages):
    errors = []
    index_file = dist / 'llms.txt'
    if not index_file.is_file():
        return ['Missing plain-text docs index (llms.txt)']
    index = index_file.read_text()
    if not index.startswith('# EspDesktop\n'):
        errors.append('The plain-text docs index must start with the project name')

    expected = set()
    for url, page in pages.items():
        markdown_url = url + ('index.md' if url.endswith('/') else '.md')
        expected.add(markdown_url)
        if page.described_by != [BASE + 'llms.txt'] or page.markdown_alternates != [markdown_url]:
            errors.append(f'Missing plain-text discovery links: {url}')
        file = dist / markdown_url.removeprefix(BASE)
        if not file.is_file():
            errors.append(f'Missing Markdown edition: {url}')
            continue
        guide = file.read_text()
        if not guide.startswith('# ') or f'[Original EspDesktop guide]({url})' not in guide:
            errors.append(f'Markdown edition needs a heading and original page link: {url}')

    links = [url for url in re.findall(r'^- \[[^\]]+\]\((https://[^)\s]+)\)', index, re.MULTILINE)
             if url.startswith(BASE)]
    if len(links) != len(set(links)) or set(links) != expected:
        errors.append('The plain-text docs index must list each public Markdown edition once')
    markdown_files = {BASE + file.relative_to(dist).as_posix() for file in dist.rglob('*.md')}
    if markdown_files != expected:
        errors.append(f'Markdown editions must match public guides: {sorted(markdown_files ^ expected)}')
    return errors


def check_build(dist):
    errors = []
    pages = {}
    urls = sitemap_urls((dist / 'sitemap.xml').read_text())
    if len(urls) != len(set(urls)):
        errors.append('Duplicate URL in sitemap')
    for url in urls:
        if not url.startswith(BASE):
            errors.append(f'Sitemap URL outside the docs site: {url}')
            continue
        relative = url[len(BASE):]
        file = dist / (relative + 'index.html' if relative.endswith('/') or not relative else relative + '.html')
        page = Page(file.read_text())
        pages[url] = page
        if '/generated/' in url or url.endswith('/card-types/weather-forecast'):
            errors.append(f'Internal or retired page in sitemap: {url}')
        if not page.title or not page.meta.get('description') or not page.meta.get('og:description'):
            errors.append(f'Missing page metadata: {url}')
        if page.canonicals != [url]:
            errors.append(f'Incorrect canonical: {url}: {page.canonicals}')
        if len(page.h1) != 1:
            errors.append(f'Expected one main heading: {url}')
        if 'noindex' in page.meta.get('robots', ''):
            errors.append(f'Noindex page in sitemap: {url}')
        if 'max-image-preview:large' not in page.meta.get('robots', '').split(','):
            errors.append(f'Large image previews not enabled: {url}')
        if 'Espcontrol' in page.title:
            errors.append(f'Inconsistent brand spelling: {url}')
        if page.meta.get('og:url') != url:
            errors.append(f'Share URL does not match the canonical URL: {url}')
        for field in ('title', 'description', 'image', 'image:alt'):
            if not page.meta.get(f'og:{field}') or page.meta.get(f'twitter:{field}') != page.meta.get(f'og:{field}'):
                errors.append(f'Missing or inconsistent share {field}: {url}')
        share_image = page.meta.get('og:image', '')
        if not share_image.startswith(BASE) or not (dist / share_image.removeprefix(BASE)).is_file():
            errors.append(f'Missing bundled share image: {url}: {share_image}')
        if not all(page.meta.get(f'og:image:{size}', '').isdigit() and int(page.meta[f'og:image:{size}']) > 0
                   for size in ('width', 'height')):
            errors.append(f'Missing share image dimensions: {url}')

        site_schema = [entry for entry in page.schemas if entry.get('@type') == 'WebSite']
        if [entry.get('url') for entry in site_schema] != ([BASE] if url == BASE else []):
            errors.append(f'Website structured data should identify the homepage: {url}')
        breadcrumb_schema = [entry for entry in page.schemas if entry.get('@type') == 'BreadcrumbList']
        trails = [[(item.get('position'), item.get('item')) for item in entry.get('itemListElement', [])]
                  for entry in breadcrumb_schema]
        if trails != ([[(1, BASE), (2, url)]] if url != BASE else []):
            errors.append(f'Incorrect breadcrumb trail: {url}')

    report = snapshot(pages)
    mac_docs = {
        BASE,
        BASE + 'screens/4848s040',
        BASE + 'screens/4848s040-stand',
        BASE + 'getting-started/install',
        BASE + 'getting-started/mac-app',
        BASE + 'getting-started/troubleshooting',
        BASE + 'mac-controls/apps',
        BASE + 'mac-controls/websites',
        BASE + 'mac-controls/folders',
        BASE + 'mac-controls/shortcuts',
        BASE + 'mac-controls/improve-shortcuts',
        BASE + 'mac-controls/security',
        BASE + 'features/setup',
        BASE + 'features/home',
        BASE + 'features/subpages',
        BASE + 'reference/faq',
        BASE + 'reference/companion-compatibility',
        BASE + 'reference/privacy',
        BASE + 'reference/support',
        BASE + 'reference/request-icons',
    }
    if unexpected_pages := set(pages) - mac_docs:
        errors.append(f'Unexpected sitemap pages: {sorted(unexpected_pages)}')
    if missing_pages := mac_docs - set(pages):
        errors.append(f'Missing sitemap pages: {sorted(missing_pages)}')
    errors.extend(check_markdown_guides(dist, pages))
    for field in ('duplicate_titles', 'duplicate_descriptions'):
        if report[field]:
            errors.append(f'{field}: {report[field]}')

    paths = {url: set() for url in pages}
    for url, page in pages.items():
        for image in page.images:
            source = urljoin(url, image.get('src', ''))
            if 'alt' not in image:
                errors.append(f'Missing image alt attribute: {url}: {source}')
            if source.startswith(BASE) and not (dist / unquote(urlsplit(source).path.removeprefix('/'))).is_file():
                errors.append(f'Missing page image: {url}: {source}')
        for href in page.links:
            target = urlsplit(urljoin(url, href))
            if target.netloc != urlsplit(BASE).netloc:
                continue
            target_url = target._replace(query='', fragment='').geturl()
            if target_url.endswith('.html'):
                target_url = target_url[:-5]
            destination = pages.get(target_url)
            if destination:
                paths[url].add(target_url)
                if target.fragment and unquote(target.fragment) not in destination.ids:
                    errors.append(f'Broken anchor from {url}: {href}')
            else:
                relative = unquote(target.path.removeprefix('/'))
                if not (dist / relative).is_file():
                    errors.append(f'Broken or retired link from {url}: {href}')

    reachable = set()
    pending = [BASE]
    while pending:
        url = pending.pop()
        if url not in reachable:
            reachable.add(url)
            pending.extend(paths.get(url, set()) - reachable)
    if set(pages) - reachable:
        errors.append(f'Sitemap pages have no link path from the homepage: {sorted(set(pages) - reachable)}')

    missing = Page((dist / '404.html').read_text())
    if 'noindex' not in missing.meta.get('robots', '') or missing.canonicals:
        errors.append('The 404 page must stay out of search and have no canonical URL')

    faq = pages[BASE + 'reference/faq']
    schemas = [schema for schema in faq.schemas if schema.get('@type') == 'FAQPage']
    if len(schemas) != 1:
        errors.append('FAQ must have exactly one generated FAQPage schema')
    else:
        actual = [(entry['name'], text_only(entry['acceptedAnswer']['text'])) for entry in schemas[0]['mainEntity']]
        if actual != faq.faq:
            errors.append('FAQ structured answers differ from the rendered questions or answers')

    redirects = {
        'reference/request-device-support': BASE + 'screens/4848s040',
        'screens/index': BASE + 'screens/4848s040',
        'card-types/companion': BASE + '#what-you-can-control',
        'card-types/weather-forecast': 'https://jtenniswood.github.io/espcontrol/',
        'card-types/index': 'https://jtenniswood.github.io/espcontrol/',
        'getting-started/home-assistant-actions': 'https://jtenniswood.github.io/espcontrol/',
        'features/media-cover-art': BASE + 'features/setup#screen-and-system-settings',
        'mac-controls/statistics': BASE + '#what-you-can-control',
        'mac-controls/volume': BASE + '#what-you-can-control',
        'guides/index': 'https://jtenniswood.github.io/espcontrol/',
        'immich/index': 'https://jtenniswood.github.io/espcontrol/',
        'generated/companion-compatibility': BASE + 'reference/companion-compatibility',
        'generated/cards/capabilities': BASE + '#what-you-can-control',
        'generated/cards/runtime-coverage': 'https://github.com/jtenniswood/espdesktop/blob/main/dev-docs/generated/card-runtime-coverage.md',
    }
    redirects['screens/jc4880p443-v3'] = 'https://jtenniswood.github.io/espcontrol/screens/jc4880p443-v3'
    screen_guides = {
        '4848s040': (BASE + 'screens/4848s040', BASE + 'getting-started/install'),
        'jc1060p470': ('https://jtenniswood.github.io/espcontrol/', 'https://jtenniswood.github.io/espcontrol/'),
        'jc1060p470-v2': ('https://jtenniswood.github.io/espcontrol/', 'https://jtenniswood.github.io/espcontrol/'),
        'jc4880p443': ('https://jtenniswood.github.io/espcontrol/', 'https://jtenniswood.github.io/espcontrol/'),
        'jc4880p443-v3': ('https://jtenniswood.github.io/espcontrol/screens/jc4880p443-v3', 'https://jtenniswood.github.io/espcontrol/screens/jc4880p443-v3'),
        'jc8012p4a1': ('https://jtenniswood.github.io/espcontrol/', 'https://jtenniswood.github.io/espcontrol/'),
        'jc8012p4a1-v2': ('https://jtenniswood.github.io/espcontrol/', 'https://jtenniswood.github.io/espcontrol/'),
        'jc8012p4a1-v3': ('https://jtenniswood.github.io/espcontrol/', 'https://jtenniswood.github.io/espcontrol/'),
        'p4-86': ('https://jtenniswood.github.io/espcontrol/', 'https://jtenniswood.github.io/espcontrol/'),
    }
    for model, (grid, install) in screen_guides.items():
        redirects[f'generated/screens/{model}-grid'] = grid
        redirects[f'generated/screens/{model}-install'] = install
    baseline = json.loads((ROOT / 'dev-docs/hosting/seo-baseline-2026-09-22.json').read_text())
    for url in baseline['generated_urls']:
        if url.removeprefix(PREVIOUS_BASE) not in redirects:
            errors.append(f'Previously published generated page has no redirect: {url}')
    for path, destination in redirects.items():
        file = dist / (path + '.html')
        if not file.is_file():
            errors.append(f'Missing retired-page redirect: {path}')
            continue
        page = Page(file.read_text())
        if page.canonicals != [destination.split('#')[0]] or 'noindex' not in page.meta.get('robots', '') or page.meta.get('refresh') != f'0; url={destination}' or destination not in page.links:
            errors.append(f'Broken retired-page redirect: {path}')
        if destination.startswith(BASE):
            target = urlsplit(destination)
            target_page = pages.get(target._replace(fragment='').geturl())
            if not target_page or (target.fragment and unquote(target.fragment) not in target_page.ids):
                errors.append(f'Broken redirect destination: {path}: {destination}')
    for file in (dist / 'generated').rglob('*.html'):
        if file.relative_to(dist).with_suffix('').as_posix() not in redirects:
            errors.append(f'Generated fragment is still published: {file.relative_to(dist)}')
    robots = dist / 'robots.txt'
    if not robots.is_file() or f'Sitemap: {BASE}sitemap.xml' not in robots.read_text().splitlines():
        errors.append('Host-root robots.txt must announce the public sitemap')

    if errors:
        raise SystemExit('\n'.join(sorted(set(errors))))
    report['faq_answers_verified'] = len(faq.faq)
    print(f'Docs site checks passed: {len(pages)} reachable canonical pages with share metadata and Markdown editions, '
          f'{len(faq.faq)} matching FAQ answers, {len(redirects)} redirects; links, images and breadcrumbs checked.')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'docs/.vitepress/dist')
    parser.add_argument('--base-url', help='Read-only live sitemap crawl instead of checking the local build')
    parser.add_argument('--output', type=Path, help='Write the measured technical baseline as JSON')
    args = parser.parse_args()
    result = live_snapshot(args.base_url) if args.base_url else check_build(args.dist)
    if args.output:
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    elif args.base_url:
        print(json.dumps(result, indent=2))
