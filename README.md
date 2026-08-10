# MyDiary

[简体中文](README.zh-CN.md) | English

MyDiary is a minimal, self-hosted Markdown diary designed for quick daily writing on mobile
devices. It provides one focused workflow: open the page, dictate or type an entry, and save it.

The repository contains application source code only. It does not contain diary entries,
production environment files, passwords, backup credentials, or Android signing keys.

## Features

- Minimal mobile-first writing interface
- System keyboard voice-to-text support
- Two-step circular record/save control
- Read-only history
- Monthly calendar and streak statistics
- Single-password authentication
- Secure 30-day login sessions
- Plain Markdown storage
- Progressive Web App support
- Optional Android WebView/TWA shell
- Optional encrypted Cloudflare R2 backups with Restic

## Architecture

| Component | Responsibility |
| --- | --- |
| `server.js` | HTTP server, authentication, security headers, and API routing |
| `src/` | Password/session handling, diary storage, statistics, and Android asset links |
| `public/` | Mobile web interface, PWA manifest, icons, and service worker |
| `backup/` | Restic backup, retention, integrity checks, and restore testing |
| `android/` | Android wrapper, launcher assets, signing helpers, and build scripts |
| `deploy/` | Generic reverse-proxy and certificate-renewal templates |
| `test/` | Authentication, storage, backup, Android, and server security tests |

The web application remains the primary product. Most feature and UI updates only require a web
deployment; the Android APK normally stays unchanged.

## Diary format

Entries are stored outside the source repository:

```text
{YYYY}/{YYYYMMDD}.md
```

Each file uses this structure:

```markdown
# YYYY-MM-DD

## HH:MM

Original diary text
```

New entries are appended without rewriting the original text. Dates and times use
`Asia/Shanghai` by default.

## Local development

Requirements:

- Node.js 22 or newer
- npm

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The development command prompts for a local password without echoing it or storing a default
credential in the repository.

Open:

```text
http://127.0.0.1:3000
```

Do not expose the development server to a network.

Run the tests:

```bash
npm test
npm audit --omit=dev
```

## Production deployment

### 1. Prepare configuration

```bash
cp .env.example .env
npm run password:hash
openssl rand -hex 32
openssl rand -base64 48
```

Set at least:

```dotenv
DIARY_PASSWORD_HASH=generated-scrypt-hash
DIARY_SESSION_SECRET=long-random-session-secret
DIARY_HOST_DATA_DIR=/srv/my-diary/data
DIARY_SECURE_COOKIE=true
DIARY_TRUST_PROXY=true
```

Store `.env` with mode `0600` and never commit it.

Only enable `DIARY_TRUST_PROXY` when the application is behind a trusted local reverse proxy that
overwrites `X-Real-IP` or `X-Forwarded-For`. The included Compose and OpenResty templates satisfy
that requirement.

### 2. Prepare the data directory

```bash
sudo install -d -m 700 -o "$(id -u)" -g "$(id -g)" /srv/my-diary/data
```

Existing diary files can be copied into that directory:

```bash
sudo cp -a /path/to/existing-diary-data/. /srv/my-diary/data/
```

### 3. Start the application

```bash
docker compose up -d diary
```

The container port is bound to `127.0.0.1` by default. Put a TLS-enabled reverse proxy in front of
it and do not expose port `3000` directly to the internet.

A generic OpenResty example is available in `deploy/openresty/`.

## Encrypted R2 backups

The optional backup container uses Restic with the R2 S3-compatible API. Configure a dedicated
private bucket and bucket-scoped credentials in `.env`.

Initialize and verify the repository once:

```bash
docker compose --profile backup run --rm diary-backup init
docker compose --profile backup run --rm diary-backup backup
docker compose --profile backup run --rm diary-backup check
docker compose --profile backup run --rm diary-backup restore-test
```

Start the scheduler:

```bash
docker compose --profile backup up -d diary-backup
```

Default policy:

- Daily backups retained for 30 days
- Monthly backups retained for 12 months
- Yearly backups retained indefinitely
- Monthly repository integrity checks
- Restore tests in January and July

R2 stores encrypted Restic objects, not directly readable Markdown. Recovery requires both the R2
credentials and the Restic password. Keep those credentials outside the repository.

## Android app

The Android project is a lightweight wrapper around the hosted web application. It supports:

- Trusted Web Activity when a compatible browser is available
- WebView fallback when no compatible TWA browser is installed
- Digital Asset Links verification
- External release keystore storage
- Signed APK and AAB builds

Before building a fork, review the package name, production domain, manifest URLs, and signing
configuration in `android/`.

Detailed instructions:

```text
android/README.md
```

## Security

Production protections include:

- Salted scrypt password hashes
- `HttpOnly`, `Secure`, `SameSite=Strict` session cookies
- Origin checks for state-changing requests
- Request size and timeout limits
- CSP, HSTS, COOP, CORP, and related browser security headers
- Read-only containers with dropped capabilities
- Diary data stored outside the source tree
- Restic encryption before backup upload
- Android signing keys stored outside the repository

See `SECURITY.md` for the threat model, residual risks, and incident-response checklist.

## Repository privacy

Never commit:

- Diary Markdown files
- `.env`
- Passwords, hashes, session secrets, or backup credentials
- Android keystores or password files
- APK, AAB, or signing sidecar files
- Restic repositories or restored diary data

The included ignore rules cover these paths, but ignored files already present in Git history must
still be removed by rewriting or replacing that history before publishing the repository.
