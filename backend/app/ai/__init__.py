"""AI / integrity detection engine.

Includes:
- Plagiarism detection (SBERT + FAISS/numpy)
- Multi-signal AI *risk* scoring (Option-2: RoBERTa fine-tune later)
- PDF extraction and chunking utilities
"""
from .risk import compute_ai_risk  # noqa: F401
