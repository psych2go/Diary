# MyDiary

[简体中文](README.zh-CN.md) | English

MyDiary is a minimal, self-hosted Markdown diary designed for quick daily writing on mobile
devices. It provides one focused workflow: open the page, dictate or type an entry, and save it.

The repository contains application source code only. It does not contain diary entries,
production environment files, passwords, or backup credentials.

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
- Optional encrypted Cloudflare R2 backups with Restic

## Architecture

| Component | Responsibility |
| --- | --- |
| `server.js` | HTTP server, authentication, security headers, and API routing |
| `src/` | Password/session handling, diary storage, and statistics |
| `public/` | Mobile web interface, PWA manifest, icons, and service worker |
| `backup/` | Restic backup, retention, integrity checks, and restore testing |
| `deploy/` | Generic reverse-proxy and certificate-renewal templates |
| `test/` | Authentication, storage, backup, and server security tests |

The application is accessed directly through a browser. It can also be installed from supported
browsers as a Progressive Web App.

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

## R2 image hosting

Images use a dedicated R2 bucket and are kept separate from encrypted backups:

```text
Bucket: zhuying-blog-images
Public domain: https://image.zhuying.fun
```

`image.zhuying.fun` is enabled as the R2 custom domain while public `r2.dev` access remains disabled.
Uploads use Wrangler OAuth, so R2 access keys do not need to be stored in this repository.

Install and authenticate Wrangler once on each device:

```bash
npm install --global wrangler
wrangler login
wrangler whoami
```

Upload an image:

```bash
npm run image:upload -- /path/to/photo.webp "Image description"
```

The command uploads to `images/YYYY/MM/name-content-hash.extension`, sets the correct content type
and one-year immutable caching, then prints the public URL and ready-to-use Markdown:

```text
URL: https://image.zhuying.fun/images/2026/08/photo-a1b2c3d4e5f6.webp
Markdown: ![Image description](https://image.zhuying.fun/images/2026/08/photo-a1b2c3d4e5f6.webp)
```

Override the defaults with environment variables when needed:

```bash
R2_IMAGE_BUCKET=another-bucket \
R2_IMAGE_BASE_URL=https://img.example.com \
R2_IMAGE_PREFIX=uploads \
npm run image:upload -- /path/to/photo.png "Image description"
```

Supported extensions are `.avif`, `.gif`, `.jpeg`, `.jpg`, `.png`, `.svg`, and `.webp`. Because
URLs use immutable caching, upload changed image content again and use the newly generated URL.

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

See `SECURITY.md` for the threat model, residual risks, and incident-response checklist.

## Repository privacy

Never commit:

- Diary Markdown files
- `.env`
- Passwords, hashes, session secrets, or backup credentials
- Restic repositories or restored diary data

The included ignore rules cover these paths, but ignored files already present in Git history must
still be removed by rewriting or replacing that history before publishing the repository.
