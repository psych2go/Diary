import { createPasswordHash } from "../src/auth.js";

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const password = Buffer.concat(chunks).toString("utf8");
if (!password) {
  throw new Error("Password cannot be empty");
}

console.log(createPasswordHash(password));
