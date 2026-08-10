import net from "node:net";

function headerValue(value) {
  return Array.isArray(value) ? value[0] : String(value || "");
}

function normalizeAddress(value) {
  const address = String(value || "").trim();
  if (address.startsWith("::ffff:") && net.isIP(address.slice(7)) === 4) {
    return address.slice(7);
  }
  return net.isIP(address) ? address : "";
}

function isLoopback(address) {
  const normalized = normalizeAddress(address);
  return normalized === "127.0.0.1" || normalized === "::1";
}

export function loginClientKey(request) {
  const peerAddress = normalizeAddress(request.socket?.remoteAddress) || "unknown";
  if (!isLoopback(peerAddress)) {
    return peerAddress;
  }

  const realIp = normalizeAddress(headerValue(request.headers?.["x-real-ip"]));
  if (realIp) {
    return realIp;
  }

  const forwarded = headerValue(request.headers?.["x-forwarded-for"])
    .split(",")
    .map((value) => normalizeAddress(value))
    .filter(Boolean);
  return forwarded.at(-1) || peerAddress;
}

export class LoginLimiter {
  constructor({
    maximumFailures = 10,
    windowMs = 10 * 60 * 1000,
    maximumClients = 10_000
  } = {}) {
    this.maximumFailures = maximumFailures;
    this.windowMs = windowMs;
    this.maximumClients = maximumClients;
    this.failures = new Map();
  }

  recentFailures(clientKey, now) {
    const recent = (this.failures.get(clientKey) || [])
      .filter((time) => now - time < this.windowMs);
    if (recent.length) {
      this.failures.set(clientKey, recent);
    } else {
      this.failures.delete(clientKey);
    }
    return recent;
  }

  canAttempt(clientKey, now = Date.now()) {
    return this.recentFailures(clientKey, now).length < this.maximumFailures;
  }

  recordFailure(clientKey, now = Date.now()) {
    if (!this.failures.has(clientKey) && this.failures.size >= this.maximumClients) {
      for (const key of this.failures.keys()) {
        this.recentFailures(key, now);
      }
      while (this.failures.size >= this.maximumClients) {
        this.failures.delete(this.failures.keys().next().value);
      }
    }

    const recent = this.recentFailures(clientKey, now);
    recent.push(now);
    this.failures.set(clientKey, recent);
  }

  clear(clientKey) {
    this.failures.delete(clientKey);
  }
}
