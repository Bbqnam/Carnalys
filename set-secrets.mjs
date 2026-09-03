// Sets DATABASE_URL and DIRECT_URL as GitHub Actions repo secrets.
// Reads values straight from .env, encrypts them with the repo public key,
// and PUTs them. Values are never printed. Run: node set-secrets.mjs
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import _sodium from "libsodium-wrappers";

const OWNER = "Bbqnam";
const REPO = "Carnalys";
const SECRETS = ["DATABASE_URL", "DIRECT_URL"];

// GitHub token from the local git credential helper
const token = execSync('printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill')
  .toString()
  .split("\n")
  .find((l) => l.startsWith("password="))
  ?.slice("password=".length);
if (!token) throw new Error("No GitHub token found via git credential fill");

// Parse .env into { KEY: value } (quotes stripped)
const env = Object.fromEntries(
  readFileSync(new URL(".env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    })
);

const api = (path, init = {}) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  }).then(async (r) => ({ status: r.status, body: await r.text() }));

await _sodium.ready;

const pkRes = await api(`/repos/${OWNER}/${REPO}/actions/secrets/public-key`);
if (pkRes.status !== 200) throw new Error(`public-key ${pkRes.status}: ${pkRes.body}`);
const pk = JSON.parse(pkRes.body);

for (const name of SECRETS) {
  if (!env[name]) {
    console.log(`${name}: SKIPPED (not in .env)`);
    continue;
  }
  const sealed = _sodium.crypto_box_seal(
    _sodium.from_string(env[name]),
    _sodium.from_base64(pk.key, _sodium.base64_variants.ORIGINAL)
  );
  const put = await api(`/repos/${OWNER}/${REPO}/actions/secrets/${name}`, {
    method: "PUT",
    body: JSON.stringify({
      encrypted_value: _sodium.to_base64(sealed, _sodium.base64_variants.ORIGINAL),
      key_id: pk.key_id,
    }),
  });
  console.log(`${name}: ${put.status === 201 ? "created" : put.status === 204 ? "updated" : `FAILED ${put.status} ${put.body}`}`);
}
