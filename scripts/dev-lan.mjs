// Starts the dev server over HTTPS on the machine's LAN address, so the app
// can be opened from a phone or tablet on the same network.
//
// HTTPS rather than plain HTTP because iOS only exposes `navigator.geolocation`
// in a secure context: over http://<lan-ip>:3000 the "Use my location" button
// can never work on an iPhone/iPad, regardless of app code.
//
// Next's own `--experimental-https` isn't usable here — it runs `mkcert
// -install` (needs a sudo password) and issues a certificate for
// localhost/127.0.0.1/::1 only, so a tablet hitting the LAN address gets a
// name mismatch. This reuses the same mkcert binary Next downloads, but skips
// the CA install and includes the current LAN address in the certificate.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const certificateDirectory = "certificates";
const certificatePath = join(certificateDirectory, "lan.pem");
const keyPath = join(certificateDirectory, "lan-key.pem");
// Records which address the certificate was issued for, so a new one is
// generated automatically when the router hands out a different lease.
const stampPath = join(certificateDirectory, "lan-address.txt");

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return undefined;
}

function mkcertBinary() {
  const cacheDirectory = join(
    process.env.HOME ?? "",
    "Library/Caches/mkcert",
  );
  const candidate = join(
    cacheDirectory,
    `mkcert-v1.4.4-${process.platform}-${process.arch}`,
  );
  return existsSync(candidate) ? candidate : undefined;
}

const address = lanAddress();
if (!address) {
  console.error("No LAN address found — are you connected to a network?");
  process.exit(1);
}

const stamped = existsSync(stampPath) ? readFileSync(stampPath, "utf8").trim() : "";
if (!existsSync(certificatePath) || !existsSync(keyPath) || stamped !== address) {
  const mkcert = mkcertBinary();
  if (!mkcert) {
    console.error(
      "mkcert isn't cached yet. Run `npx next dev --experimental-https` once to download it, then retry.",
    );
    process.exit(1);
  }
  mkdirSync(certificateDirectory, { recursive: true });
  execFileSync(
    mkcert,
    ["-key-file", keyPath, "-cert-file", certificatePath, "localhost", "127.0.0.1", "::1", address],
    { stdio: "inherit" },
  );
  writeFileSync(stampPath, `${address}\n`);
}

const port = process.env.PORT ?? "3000";
console.log(`\n  On this Mac:  https://localhost:${port}`);
console.log(`  On your iPad: https://${address}:${port}`);
console.log(
  "\n  The certificate is self-signed, so Safari shows a warning the first time:",
);
console.log("  tap Show Details → visit this website. Geolocation works after that.\n");

spawn(
  "npx",
  [
    "next",
    "dev",
    // Turbopack has no native bindings on darwin/arm64 here; force the webpack dev server.
    "--webpack",
    "-H",
    "0.0.0.0",
    "-p",
    port,
    // `--experimental-https` is the switch that turns HTTPS on; passing a key
    // and cert alongside it makes Next use ours instead of running mkcert.
    "--experimental-https",
    "--experimental-https-key",
    keyPath,
    "--experimental-https-cert",
    certificatePath,
  ],
  { stdio: "inherit" },
).on("exit", (code) => process.exit(code ?? 0));
