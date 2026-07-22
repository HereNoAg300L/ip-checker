import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("front-end element references match the simplified page", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const references = new Set([...script.matchAll(/\belements\.([A-Za-z][A-Za-z0-9_]*)/g)].map((match) => match[1]));

  for (const reference of references) {
    assert.ok(ids.has(reference), `app.js references missing element #${reference}`);
  }
});

test("anchors and accessible labels point to existing elements", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const targets = [
    ...[...html.matchAll(/\bhref="#([^"]+)"/g)].map((match) => match[1]),
    ...[...html.matchAll(/\baria-labelledby="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)),
  ];

  for (const target of targets) {
    assert.ok(ids.has(target), `page points to missing element #${target}`);
  }
});

test("home page contains only IP-focused information", () => {
  for (const required of ["ipAddress", "copyIp", "refreshData", "details", "locationPrimary", "asnLabel", "rttValue"]) {
    assert.match(html, new RegExp(`id="${required}"`));
  }

  for (const removed of [
    "shortcut-section",
    "api-section",
    "privacy-section",
    "jsonDialog",
    "data-api-format",
    "route-strip",
    "hero-grid",
    "hero-glow",
    "signal-bars",
    "当前设备",
    "快捷指令",
    "查看 JSON",
  ]) {
    assert.doesNotMatch(html, new RegExp(removed));
  }

  assert.match(script, /const API_PATH = "\/api\/v1\/ip"/);
});
