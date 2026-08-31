# Integrity Detection Testing Step 1 — Core AI and Plagiarism Engine Foundation

## Purpose

This step creates the dedicated backend foundation for the Integrity Detection Engine test pack. It focuses on stable low-level behavior that should remain correct even when scoring thresholds, model selection, or plagiarism calibration are improved later.

## Main changes

- Added isolated backend test folder for the Integrity Detection Engine.
- Added deterministic fixtures and environment controls to avoid live Hugging Face downloads during tests.
- Added text preprocessing tests for extracted PDF text cleanup, reference stripping, sentence splitting, and chunking.
- Added plagiarism matching tests for copied text, unrelated text, source metadata, generic phrase suppression, and visible evidence alignment.
- Added AI scoring contract tests for label handling, batching, fail-open behavior, and model probability conversion.
- Added integrity pipeline contract tests to protect the response shape used by report pages.

## Suggested commit message

`test: add integrity engine core AI and plagiarism unit tests`
