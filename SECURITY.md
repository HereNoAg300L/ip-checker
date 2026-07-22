# Security Policy

## Supported version

Only the latest version on the default branch receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately to the repository owner instead of opening a public issue. Include the affected endpoint, reproduction steps, impact, and any suggested mitigation. Do not include real visitor IP addresses, cookies, credentials, or Cloudflare tokens in the report.

## Security model

- `CF-Connecting-IP` is used only as display information and never as an authorization signal.
- Generic forwarding headers are ignored.
- Visitor responses are marked `private, no-store`.
- No inbound authentication, cookie, or arbitrary request headers are reflected.
- By default, no third-party IP intelligence provider is called.
- If the deployment owner configures the optional `IPINFO_TOKEN` secret and does not set `IPINFO_MODE=off`, the Worker sends the visitor IP to IPinfo over HTTPS for enrichment. The token is transmitted in the backend `Authorization: Bearer` header and is never returned to the browser.
- IPinfo requests use a short timeout and safely fall back to Cloudflare-only data; lookup errors and upstream response bodies are not exposed to visitors.
- Static pages receive a restrictive CSP and related browser security headers.

Deployment owners remain responsible for Cloudflare account security, IPinfo account and token security, informing visitors when third-party enrichment is enabled, access policies, custom domains, and any platform-level logging they enable. This project does not intentionally persist IPinfo responses, but Cloudflare and IPinfo may process or log requests according to the deployment owner's configuration and their respective policies.
