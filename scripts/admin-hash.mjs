#!/usr/bin/env node
// Prints the ADMIN_PASSWORD_HASH secret for a password, in the format the
// Worker checks (src/worker/lib/adminAuth.ts). The password is read from stdin
// so it never lands in shell history:
//   npm run admin:hash            (type the password, then Enter)
//   npx wrangler secret put ADMIN_PASSWORD_HASH   (paste the printed hash)
import { webcrypto as crypto } from "node:crypto";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ITERATIONS = 100_000; // the Workers PBKDF2 maximum

export async function hashPassword(password, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${Buffer.from(salt).toString("base64")}$${Buffer.from(bits).toString("base64")}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  process.stderr.write("Password admin: ");
  rl.once("line", async (line) => {
    rl.close();
    const password = line.replace(/\r$/, "");
    if (!password) {
      process.stderr.write("\nPassword kosong.\n");
      process.exit(1);
    }
    if (password.length < 10) process.stderr.write("\nPeringatan: password pendek mudah ditebak. Pakai minimal 10 karakter.\n");
    process.stdout.write(`${await hashPassword(password)}\n`);
  });
}
