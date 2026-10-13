# Security and privacy

SciMemo 0.1.0-dev is a development starter, not an audited application. Do not use it as the sole copy of sensitive research data.

Default behavior: local record operations do not require a network service. No telemetry or required AI integrations are included. Users explicitly trigger synchronization.

Current limitations: local SQLite is not encrypted; the optional sync server can read plaintext content; no end-to-end encryption, per-device revocation, automatic backup or integrated reverse-proxy rate limiting is implemented.

Remote sync requires HTTPS. The sample Docker service binds only to loopback. Use explicit CORS origins and a high-entropy token. Do not put secrets in frontend build-time variables, Git, screenshots or issue reports.

Native commands operate on a fixed application-data directory and do not expose a generic shell or arbitrary SQL execution. Outgoing links are limited to HTTP(S); note HTML is not rendered.

Before public deployment, review dependency advisories, pin lockfiles and CI action revisions, enforce reverse-proxy limits, exercise restore procedures, and test all target platforms.

For a discovered vulnerability, do not publish real data or credentials. Repository owners should enable GitHub private vulnerability reporting before making the project public. This starter does not invent a contact address or claim an existing disclosure program.
