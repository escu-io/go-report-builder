# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, use [GitHub Security Advisories](https://github.com/escu-io/go-report-builder/security/advisories/new)
to report it privately, or email the maintainers if you prefer.

We aim to acknowledge reports within 3 business days and will coordinate a fix
and disclosure timeline with you.

## Scope

This project generates static HTML from local coverage profiles and source files.
It does not execute untrusted code from the report input. Reports are intended
for trusted CI artifacts and local development use.
