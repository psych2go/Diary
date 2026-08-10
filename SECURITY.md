# Security Model

## Protected by this design

- Public requests must pass password authentication before reading or writing diary content.
- Production stores a salted scrypt password hash instead of the login password.
- Login cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, host-prefixed, and expire after 30 days.
- Cross-site mutation requests are rejected.
- Diary paths are generated from validated server-side Shanghai dates.
- Diary content is rendered as text, not HTML.
- Application containers do not receive the source repository, `.env`, Git metadata, or Android key.
- R2 backups are encrypted by Restic before leaving the server.
- Android release keys live outside the repository and are created with `0600` permissions.

## Explicit residual risks

The following risks are accepted or cannot be removed without changing the product:

1. Server administrators and anyone who gains root access can read plaintext diary files.
2. An unlocked phone with an active 30-day session can open the diary.
3. An unsaved draft is plaintext in that device's browser local storage until saved or logged out.
4. R2 Bucket Lock is disabled by user decision. Stolen R2 write credentials may delete backups.
5. Compromise of the Cloudflare account, DNS, TLS origin, or Android signing key can undermine the
   TWA trust relationship.
6. The old private GitHub repository still contains historical plaintext diary data.
7. A global login limit can temporarily deny login after repeated malicious failures.
8. Users with Docker daemon access can inspect backup container environment variables. Docker
   access must be treated as root access and restricted to trusted administrators.

## Production checklist

- Store diary files outside the source tree with mode `0700` on the directory and `0600` on files.
- Set `.env` to mode `0600`.
- Use a long unique login password and generate `DIARY_PASSWORD_HASH`.
- Keep `DIARY_SESSION_SECRET`, Restic password, R2 credentials, and SMTP password in Bitwarden.
- Do not grant Docker group or daemon access to untrusted server users.
- Limit the R2 token to the dedicated diary bucket.
- Bind the app to `127.0.0.1`; expose only HTTPS through the reverse proxy or named tunnel.
- Do not use a Cloudflare Quick Tunnel for production.
- Keep reverse-proxy access logs for no more than seven days and never log request bodies.
- Back up the Android keystore separately from its password.
- Run `npm test`, `npm audit --omit=dev`, backup check, and restore test before launch.

## Incident response

Lost phone or stolen cookie:

1. Replace `DIARY_SESSION_SECRET`.
2. Restart the `diary` container.
3. Change the login password hash if compromise is suspected.

Compromised server:

1. Disconnect the server from the network.
2. Rotate the login password, session secret, R2 token, SMTP password, and tunnel credentials.
3. Restore onto a clean server from the most recent verified Restic snapshot.
4. Inspect R2 snapshots for deletion because Bucket Lock is intentionally disabled.

Lost Android signing key:

- Existing APK installations cannot be upgraded with a differently signed APK.
- If Google Play App Signing is enabled, follow the Play Console key recovery process.
