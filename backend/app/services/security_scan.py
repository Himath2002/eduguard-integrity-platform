from __future__ import annotations

import os


def basic_file_scan(file_path: str) -> bool:
    size = os.path.getsize(file_path)
    if size <= 0:
        raise ValueError("File is empty or corrupted")
    return True
