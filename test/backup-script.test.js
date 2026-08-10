import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("backup script targets R2 and applies the agreed retention policy", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-diary-backup-"));
  const binDirectory = path.join(root, "bin");
  const commandLog = path.join(root, "restic.log");
  await fs.mkdir(binDirectory);
  await fs.writeFile(
    path.join(binDirectory, "restic"),
    [
      "#!/bin/sh",
      "printf '%s|%s\\n' \"$RESTIC_REPOSITORY\" \"$*\" >> \"$RESTIC_TEST_LOG\""
    ].join("\n"),
    { mode: 0o700 }
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = spawnSync("sh", ["backup/diary-backup", "backup"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      RESTIC_TEST_LOG: commandLog,
      R2_ACCOUNT_ID: "account-id",
      R2_BUCKET: "diary-bucket",
      R2_PREFIX: "encrypted",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
      RESTIC_PASSWORD: "restic-secret"
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manual backup succeeded/);
  assert.doesNotMatch(result.stdout, /secret-key|restic-secret/);

  const calls = await fs.readFile(commandLog, "utf8");
  assert.match(
    calls,
    /s3:https:\/\/account-id\.r2\.cloudflarestorage\.com\/diary-bucket\/encrypted/
  );
  assert.match(calls, /backup \/instructions\/RESTORE\.md/);
  assert.match(calls, /--keep-daily 30/);
  assert.match(calls, /--keep-monthly 12/);
  assert.match(calls, /--keep-yearly unlimited/);
  assert.match(calls, /--prune/);
});

test("SMTP credentials are sent through stdin instead of process arguments", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-diary-backup-"));
  const binDirectory = path.join(root, "bin");
  const curlArguments = path.join(root, "curl-arguments.log");
  const curlConfig = path.join(root, "curl-config.log");
  await fs.mkdir(binDirectory);
  await fs.writeFile(
    path.join(binDirectory, "restic"),
    "#!/bin/sh\nexit 9\n",
    { mode: 0o700 }
  );
  await fs.writeFile(
    path.join(binDirectory, "curl"),
    [
      "#!/bin/sh",
      "printf '%s\\n' \"$*\" > \"$CURL_ARGUMENTS_LOG\"",
      "cat > \"$CURL_CONFIG_LOG\""
    ].join("\n"),
    { mode: 0o700 }
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = spawnSync("sh", ["backup/diary-backup", "backup"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      CURL_ARGUMENTS_LOG: curlArguments,
      CURL_CONFIG_LOG: curlConfig,
      R2_ACCOUNT_ID: "account-id",
      R2_BUCKET: "diary-bucket",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "r2-secret",
      RESTIC_PASSWORD: "restic-secret",
      SMTP_URL: "smtps://smtp.example.com:465",
      SMTP_USERNAME: "diary-user",
      SMTP_PASSWORD: "smtp-secret",
      SMTP_FROM: "diary@example.com",
      SMTP_TO: "owner@example.com"
    }
  });

  assert.equal(result.status, 9);
  assert.doesNotMatch(result.stdout + result.stderr, /smtp-secret|r2-secret|restic-secret/);
  assert.doesNotMatch(await fs.readFile(curlArguments, "utf8"), /smtp-secret/);
  assert.match(await fs.readFile(curlConfig, "utf8"), /smtp-secret/);
});

test("failed backups do not require SMTP when alerts are disabled", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-diary-backup-"));
  const binDirectory = path.join(root, "bin");
  const curlMarker = path.join(root, "curl-called");
  await fs.mkdir(binDirectory);
  await fs.writeFile(path.join(binDirectory, "restic"), "#!/bin/sh\nexit 9\n", {
    mode: 0o700
  });
  await fs.writeFile(
    path.join(binDirectory, "curl"),
    `#!/bin/sh\ntouch "${curlMarker}"\n`,
    { mode: 0o700 }
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = spawnSync("sh", ["backup/diary-backup", "backup"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      R2_ACCOUNT_ID: "account-id",
      R2_BUCKET: "diary-bucket",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "r2-secret",
      RESTIC_PASSWORD: "restic-secret",
      SMTP_URL: "",
      SMTP_USERNAME: "",
      SMTP_PASSWORD: "",
      SMTP_FROM: "",
      SMTP_TO: ""
    }
  });

  assert.equal(result.status, 9);
  assert.match(result.stdout, /email alerts are disabled/);
  await assert.rejects(fs.access(curlMarker));
});
