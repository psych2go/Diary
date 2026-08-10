import crypto from "node:crypto";

const SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(left);
  const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function passwordMatches(candidate, expected) {
  if (isPasswordHash(expected)) {
    const [algorithm, saltValue, digestValue, extra] = expected.split("$");

    try {
      const salt = Buffer.from(saltValue, "base64url");
      const expectedDigest = Buffer.from(digestValue, "base64url");
      const candidateDigest = crypto.scryptSync(
        candidate,
        salt,
        SCRYPT_KEY_LENGTH,
        SCRYPT_OPTIONS
      );
      return safeEqual(candidateDigest, expectedDigest);
    } catch {
      return false;
    }
  }

  return safeEqual(candidate, expected);
}

export function isPasswordHash(value) {
  const [algorithm, saltValue, digestValue, extra] = String(value || "").split("$");
  if (
    algorithm !== "scrypt" ||
    !BASE64URL_PATTERN.test(saltValue || "") ||
    !BASE64URL_PATTERN.test(digestValue || "") ||
    extra
  ) {
    return false;
  }

  try {
    return (
      Buffer.from(saltValue, "base64url").length >= 16 &&
      Buffer.from(digestValue, "base64url").length === SCRYPT_KEY_LENGTH
    );
  } catch {
    return false;
  }
}

export function createPasswordHash(password, salt = crypto.randomBytes(16)) {
  const digest = crypto.scryptSync(
    password,
    salt,
    SCRYPT_KEY_LENGTH,
    SCRYPT_OPTIONS
  );
  return `scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export function createSession(secret, now = Date.now()) {
  const payload = encode(
    JSON.stringify({
      expiresAt: now + SESSION_AGE_SECONDS * 1000,
      nonce: crypto.randomBytes(16).toString("hex")
    })
  );

  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token) {
    return false;
  }

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload, secret))) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(session.expiresAt) && session.expiresAt > now;
  } catch {
    return false;
  }
}

export function sessionCookie(token, secure = false) {
  const cookieName = secure ? "__Host-diary_session" : "diary_session";
  const attributes = [
    `${cookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
    `Max-Age=${SESSION_AGE_SECONDS}`
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function clearSessionCookie(secure = false) {
  const cookieName = secure ? "__Host-diary_session" : "diary_session";
  const attributes = [
    `${cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
    "Max-Age=0"
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function clearLegacySessionCookie(secure = false) {
  const attributes = [
    "diary_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Priority=High",
    "Max-Age=0"
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function readCookie(cookieHeader, name) {
  const cookies = (cookieHeader || "").split(";");

  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) {
      return value.join("=");
    }
  }

  return "";
}
