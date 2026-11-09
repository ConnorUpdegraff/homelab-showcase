"""Dependency-free source and local-serving checks; not a rendered browser test.

Run from the project: python tests/validate_site.py --http
"""
from collections import Counter
from functools import partial
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import urlopen
import re
import struct
import sys

ROOT = Path(__file__).resolve().parent.parent
PAGES = ("index.html", "architecture.html", "services.html", "engineering.html", "roadmap.html")
VOID = set("area base br col embed hr img input link meta param source track wbr".split())


class Page(HTMLParser):
    def __init__(self, filename):
        super().__init__(convert_charrefs=True)
        self.filename = filename
        self.tags, self.stack, self.nav, self.active = [], [], [], []
        self.h1 = 0
        self.in_nav = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag == "nav" and attrs.get("id") == "primary-nav":
            self.in_nav = True
        if tag == "a" and self.in_nav:
            self.nav.append(attrs.get("href"))
            if attrs.get("aria-current") == "page":
                self.active.append(attrs["href"])
        if tag == "h1":
            self.h1 += 1
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1] == tag, (self.filename, "unbalanced HTML", tag, self.stack[-3:])
        self.stack.pop()
        if tag == "nav":
            self.in_nav = False


def exact_path(relative):
    """Catch casing errors even when running on Windows' case-insensitive FS."""
    current = ROOT
    for part in Path(relative).parts:
        assert part not in ("..", "."), (relative, "unexpected path segment")
        assert part in {item.name for item in current.iterdir()}, (relative, "missing file or wrong capitalization")
        current = current / part
    assert current.is_file(), relative
    return current


def check_sources():
    parsed = {}
    for filename in PAGES:
        page = Page(filename)
        page.feed((ROOT / filename).read_text(encoding="utf-8"))
        assert not page.stack, (filename, page.stack)
        assert page.h1 == 1, (filename, "expected one h1")
        assert tuple(page.nav) == PAGES, (filename, "navigation must load all five HTML pages")
        assert page.active == [filename], (filename, "wrong active-page marker")
        page.ids = [attrs["id"] for _, attrs in page.tags if "id" in attrs]
        assert all(count == 1 for count in Counter(page.ids).values()), (filename, "duplicate IDs")
        parsed[filename] = page

    resources = set(PAGES)
    for filename, page in parsed.items():
        for tag, attrs in page.tags:
            for relation in ("aria-controls", "aria-labelledby", "aria-describedby"):
                for ref in attrs.get(relation, "").split():
                    assert ref in page.ids, (filename, relation, ref)
            if tag == "button":
                assert attrs.get("type") == "button", filename
            if tag == "img":
                assert attrs.get("alt"), (filename, "missing alt")
                image_path = exact_path(attrs["src"])
                data = image_path.read_bytes()
                assert data[:8] == b"\x89PNG\r\n\x1a\n", image_path.name
                assert struct.unpack(">II", data[16:24]) == (int(attrs["width"]), int(attrs["height"])), (filename, "image dimensions")
            for name in ("href", "src"):
                if name not in attrs:
                    continue
                value = attrs[name]
                uri = urlsplit(value)
                assert not uri.scheme and not uri.netloc and not value.startswith("/"), (filename, "external or root-relative URL", value)
                relative = unquote(uri.path) or filename
                exact_path(relative)
                resources.add(relative)
                if uri.fragment:
                    assert relative in parsed and uri.fragment in parsed[relative].ids, (filename, "broken fragment", value)

    architecture = parsed["architecture.html"]
    nodes = {attrs["data-node"] for _, attrs in architecture.tags if "data-node" in attrs}
    panels = {attrs["data-component-panel"] for _, attrs in architecture.tags if "data-component-panel" in attrs}
    assert nodes == panels, ("unmatched architecture controls", nodes ^ panels)
    assert len(nodes) == 17, len(nodes)
    assert sum("data-view" in attrs for _, attrs in architecture.tags) == 2
    assert sum("data-flow" in attrs for _, attrs in architecture.tags) == 3
    assert sum("service-card" in attrs.get("class", "").split() for _, attrs in parsed["services.html"].tags) == 6
    assert sum("case-study" in attrs.get("class", "").split() for _, attrs in parsed["engineering.html"].tags) == 7

    script = (ROOT / "script.js").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    assert not re.search(r"fetch\s*\(|XMLHttpRequest|WebSocket|https?://", script), "unexpected network code"
    assert "prefers-reduced-motion" in css and "prefers-reduced-motion" in script
    assert css.count("{") == css.count("}"), "unbalanced CSS blocks"
    all_source = "\n".join((ROOT / p).read_text(encoding="utf-8") for p in PAGES)
    allowed_addresses = {"10.0.0.245", "10.0.0.250", "10.0.0.2", "10.0.0.240", "0.0.0.0"}
    addresses = set(re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", all_source))
    assert addresses <= allowed_addresses, ("unexpected address", addresses - allowed_addresses)
    assert not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", all_source), "unexpected email"
    assert "From an Old Laptop to a " in all_source and "Working Home Lab." in all_source
    print("PASS: five pages; HTML nesting; unique IDs; exact-case links/assets; ARIA references; image dimensions; active-page navigation.")
    print("PASS: 17 component panels, two views, three flows, six service cards, seven case studies; reduced-motion and source privacy checks.")
    return resources


class PreviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Exercise the same relative assets under a GitHub Pages-style subpath.
        prefix = "/homelab-showcase/"
        if self.path.startswith(prefix):
            self.path = "/" + self.path[len(prefix):]
        super().do_GET()

    def log_message(self, *args):
        pass


def check_http(resources):
    handler = partial(PreviewHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        for prefix in ("/", "/homelab-showcase/"):
            base = f"http://127.0.0.1:{server.server_port}{prefix}"
            for resource in sorted(resources):
                with urlopen(urljoin(base, resource)) as response:
                    assert response.status == 200
                    assert response.read() == (ROOT / resource).read_bytes(), resource
            print(f"PASS: {len(resources)} local resources served unchanged under {prefix}")
    finally:
        server.shutdown()
        server.server_close()
        worker.join()
    print("Temporary localhost server stopped.")


if __name__ == "__main__":
    resources = check_sources()
    if "--http" in sys.argv:
        check_http(resources)
    print("These checks do not replace rendered viewport, keyboard, or touch testing.")
