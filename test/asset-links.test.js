import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssetLinks,
  parseAndroidFingerprints
} from "../src/asset-links.js";

const fingerprint =
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:" +
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";

test("normalizes valid Android signing fingerprints", () => {
  assert.deepEqual(
    parseAndroidFingerprints(` ${fingerprint.toLowerCase()},invalid,${fingerprint}`),
    [fingerprint]
  );
});

test("generates Digital Asset Links for the Android package", () => {
  assert.deepEqual(createAssetLinks([fingerprint]), [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "fun.zhuying.diary",
        sha256_cert_fingerprints: [fingerprint]
      }
    }
  ]);
});

test("returns no declarations before a signing fingerprint is configured", () => {
  assert.deepEqual(createAssetLinks([]), []);
});
