// Verifies that every public package ships a LICENSE identical to the root
// LICENSE and declares "MIT" in package.json. Packages are published from
// their own directory, so the root LICENSE alone never reaches the tarball.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootLicense = readFileSync(join(root, "LICENSE"));
const packagesDir = join(root, "packages");
const errors = [];
let checked = 0;

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(packagesDir, entry.name);
  const manifestPath = join(dir, "package.json");
  if (!existsSync(manifestPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.private === true) continue;
  checked += 1;

  const label = `packages/${entry.name}`;
  if (manifest.license !== "MIT") {
    errors.push(`${label}/package.json: "license" is ${JSON.stringify(manifest.license)}, expected "MIT"`);
  }

  const licensePath = join(dir, "LICENSE");
  if (!existsSync(licensePath)) {
    errors.push(`${label}/LICENSE: missing (copy the root LICENSE)`);
  } else if (!readFileSync(licensePath).equals(rootLicense)) {
    errors.push(`${label}/LICENSE: differs from the root LICENSE`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`LICENSE check passed for ${checked} public packages.`);
