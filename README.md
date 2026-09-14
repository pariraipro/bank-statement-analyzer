# SpendLens — Bank Statement Analyzer

[Open SpendLens](https://spendlens-india.raj-6d6f.chatgpt.site)

A browser-based statement analyzer for Indian rupee transactions. Import CSV or text-based PDF bank statements, review transactions, and explore spending, income, categories, trends, and unusual charges. All statement contents and PDF passwords stay in the browser session. Closing or refreshing the page clears imported data.

## Run locally

Run `node server.cjs`, then open the printed address (`http://127.0.0.1:4173`). No package installation or build step is needed for the website. Serve the `dist` directory through HTTP; opening the HTML directly from the filesystem does not support ES modules reliably.

## CSV import

Import a CSV up to 8 MB, confirm column mapping, date order, and whether the statement uses separate debit/credit columns or one signed amount column. Invalid rows are reported and can be reviewed. Dates, INR formatting, duplicate transactions, and amount direction are checked. A downloadable synthetic sample is included.

## PDF import

- Supports text-based transaction tables with Date, Description/Narration, and Debit/Credit or Amount headings.
- Handles password-protected statements by asking for the password in the browser. Passwords are not stored.
- Limits each PDF to 8 MB, 50 pages, and 2,000 candidate transactions.
- Requires reviewing extracted transactions and confirming the selection before analysis. Dates, descriptions, amounts and directions can be corrected individually.
- Ambiguous monetary column placement is excluded until the amount and direction are supplied manually. Partial dates remain available for correction.
- Signed amounts with no debit/credit marker require an explicit sign convention.
- Scanned or image-only statements require OCR outside this app, or a CSV export. Bank layouts vary; extraction does not guarantee completeness. Check the original statement and all warnings before importing.
- Two-digit PDF years are interpreted as 20xx. PDF dates use day/month/year.

The bundled PDF.js library is distributed under Apache-2.0. Version and integrity information are in `dist/vendor/pdfjs/VERSION.txt`; its license is included.

## Validation

Run `node tests/engine.test.mjs` and `node tests/pdf-extraction.test.mjs` for transaction math, CSV edge cases and PDF table-placement regressions. The actual PDF reader integration test uses Node canvas primitives: install `@napi-rs/canvas` separately, or set `PDF_TEST_CANVAS_MODULE` to its local module path, then run `node tests/pdf-reader.test.mjs`.

PDF extraction and reader integration are checked programmatically. Browser interaction and visual QA of this PDF update were not requested.

Unusual-charge flags are review suggestions based on the uploaded history, not confirmations of fraud. No live bank or card connection is configured.
