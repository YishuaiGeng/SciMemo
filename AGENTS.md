# SciMemo coding-agent instructions

## Product contract

SciMemo is a personal submission-and-ideas notebook, not Zotero, a teacher dashboard or a generic research management platform.

Keep four user-facing modules: manuscripts, independent ideas/notes, journals/conferences, and dates. No mandatory account, server, AI API key or internet connection for local record operations.

## Architecture contract

- Keep domain rules in src/core. No React, Tauri or HTTP imports there.
- UI calls WorkspaceService, never writes storage directly.
- A local edit and its outbox must commit in the same atomic transaction.
- Preserve submission attempts and event history. Never overwrite the previous target on transfer.
- Notes may exist with no paperIds. Do not add required project hierarchies or artificial complexity.
- Never use client wall clocks for last-write-wins. Conflicts must preserve both versions.
- Paper submissions/events are a single sync aggregate in v1. Do not split network writes without designing atomic dependencies.
- Treat JSON import, remote data, URLs and dates as untrusted.
- Preserve nullable dates and date-only precision. Do not invent a time or timezone.
- Never silently switch back to in-memory storage if IndexedDB/SQLite fails.

## Before changing the model

Update types.ts, domain validators, schemas/document.schema.json, server semantic validation, fixtures and tests together. Schema changes need versioning/migrations. Do not edit historical migration meaning.

## Required checks

```bash
npm run check
npm test
npm run build
python -m pytest server/tests -q
```

For sync changes, run the temporary-server HTTP integration test and add lost-ack / conflict / deletion coverage. Native and device tests must be reported separately.

Never claim a command passed unless it was actually executed. Do not advertise planned features as implemented. Keep TEST_REPORT and KNOWN_LIMITATIONS honest.

## Privacy

Use fictional fixtures only. Never commit real manuscripts, reviews, database files, API keys, access tokens or signing keys. Do not add telemetry, remote fonts, analytics or background network calls without an explicit product decision.

## Scope control

No microservices, generalized plugin system, full PDF reader, citation manager, autonomous publisher scraping or mandatory AI in this milestone.
