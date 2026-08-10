const FINGERPRINT_PATTERN = /^([0-9a-f]{2}:){31}[0-9a-f]{2}$/i;

export function parseAndroidFingerprints(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map((fingerprint) => fingerprint.trim().toUpperCase())
      .filter((fingerprint) => FINGERPRINT_PATTERN.test(fingerprint))
  )];
}

export function createAssetLinks(fingerprints) {
  if (!fingerprints.length) {
    return [];
  }

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "fun.zhuying.diary",
        sha256_cert_fingerprints: fingerprints
      }
    }
  ];
}
