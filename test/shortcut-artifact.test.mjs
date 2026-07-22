import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Apple Shortcut artifact is signed, reproducible, and linked", async () => {
  const [artifact, source, readme] = await Promise.all([
    readFile(resolve(root, "shortcuts", "IP-Lens.shortcut")),
    readFile(resolve(root, "shortcuts", "IP-Lens.cherri"), "utf8"),
    readFile(resolve(root, "README.md"), "utf8"),
  ]);

  assert.equal(artifact.subarray(0, 4).toString("ascii"), "AEA1");
  assert.ok(artifact.length > 10_000, "signed Shortcut artifact is unexpectedly small");
  assert.match(source, /#question website/);
  assert.match(source, /\/api\/v1\/ip\?format=text/);
  assert.match(readme, /\(shortcuts\/IP-Lens\.shortcut\?raw=1\)/);
});
