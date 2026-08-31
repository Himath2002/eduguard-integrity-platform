from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import List


_WORD_RE = re.compile(r"[A-Za-z0-9']+")


def _tokenize(s: str) -> List[str]:
    return [m.group(0).lower() for m in _WORD_RE.finditer(s or "")]


def shared_phrases(a: str, b: str, min_tokens: int = 8, max_phrases: int = 5) -> List[str]:
    """Extract common phrases between two texts using token-level matching.

    Returns up to `max_phrases` phrases (as plain strings) with at least `min_tokens` tokens.

    This is not a full highlighter, but it provides strong evidence snippets for reports.
    """
    ta = _tokenize(a)
    tb = _tokenize(b)
    if not ta or not tb:
        return []

    sm = SequenceMatcher(a=ta, b=tb, autojunk=True)
    blocks = sm.get_matching_blocks()

    phrases: List[str] = []
    for blk in sorted(blocks, key=lambda x: x.size, reverse=True):
        if blk.size < min_tokens:
            continue
        phrase_tokens = ta[blk.a : blk.a + blk.size]
        phrase = " ".join(phrase_tokens).strip()
        if not phrase:
            continue
        # avoid duplicates
        if any(phrase in p or p in phrase for p in phrases):
            continue
        phrases.append(phrase)
        if len(phrases) >= max_phrases:
            break

    return phrases
