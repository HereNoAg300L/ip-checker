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
- No third-party IP intelligence provider is called.
- Static pages receive a restrictive CSP and related browser security headers.

Deployment owners remain responsible for Cloudflare account security, access policies, custom domains, and any platform-level logging they enable.
