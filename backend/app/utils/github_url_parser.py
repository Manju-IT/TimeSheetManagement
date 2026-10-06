"""GitHub URL parser.

The URL is always stored verbatim; this module only *classifies* it and pulls
out useful metadata. Unparseable-but-valid URLs are accepted as `other`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class ParsedLink:
    link_type: str  # 'commit' | 'pull_request' | 'branch' | 'file' | 'compare' | 'other'
    repo: str | None
    ref: str | None
    number: str | None


_GITHUB_HOSTS = {"github.com", "www.github.com"}

_COMMIT_RE = re.compile(r"^/(?P<owner>[^/]+)/(?P<repo>[^/]+)/commit/(?P<sha>[0-9a-fA-F]{7,40})/?$")
_PR_RE = re.compile(r"^/(?P<owner>[^/]+)/(?P<repo>[^/]+)/pull/(?P<num>\d+)(?:/.*)?$")
_TREE_RE = re.compile(r"^/(?P<owner>[^/]+)/(?P<repo>[^/]+)/tree/(?P<branch>.+?)/?$")
_BLOB_RE = re.compile(
    r"^/(?P<owner>[^/]+)/(?P<repo>[^/]+)/blob/(?P<ref>.+?)/(?P<path>.+?)/?$"
)
_COMPARE_RE = re.compile(r"^/(?P<owner>[^/]+)/(?P<repo>[^/]+)/compare/(?P<refs>.+)$")
_REPO_RE = re.compile(r"^/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$")


def parse_github_url(url: str) -> ParsedLink:
    try:
        parsed = urlparse(url)
    except ValueError:
        return ParsedLink("other", None, None, None)

    if parsed.scheme not in ("http", "https"):
        return ParsedLink("other", None, None, None)
    if parsed.hostname not in _GITHUB_HOSTS:
        return ParsedLink("other", None, None, None)

    path = parsed.path or "/"

    if m := _COMMIT_RE.match(path):
        return ParsedLink(
            "commit",
            f"{m['owner']}/{m['repo']}",
            m["sha"],
            None,
        )
    if m := _PR_RE.match(path):
        return ParsedLink(
            "pull_request",
            f"{m['owner']}/{m['repo']}",
            None,
            m["num"],
        )
    if m := _BLOB_RE.match(path):
        return ParsedLink(
            "file",
            f"{m['owner']}/{m['repo']}",
            m["ref"],
            None,
        )
    if m := _COMPARE_RE.match(path):
        return ParsedLink(
            "compare",
            f"{m['owner']}/{m['repo']}",
            m["refs"],
            None,
        )
    if m := _TREE_RE.match(path):
        return ParsedLink(
            "branch",
            f"{m['owner']}/{m['repo']}",
            m["branch"],
            None,
        )
    if m := _REPO_RE.match(path):
        return ParsedLink("other", f"{m['owner']}/{m['repo']}", None, None)

    return ParsedLink("other", None, None, None)


def looks_like_github(url: str) -> bool:
    try:
        return urlparse(url).hostname in _GITHUB_HOSTS
    except ValueError:
        return False