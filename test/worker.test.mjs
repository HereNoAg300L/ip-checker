import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIpResult,
  formatResultAsText,
  getIpVersion,
  normalizeIp,
  routeRequest,
} from "../src/index.js";

const MOCK_CF = {
  asn: 13335,
  asOrganization: "Cloudflare, Inc.",
  city: "Shanghai",
  colo: "PVG",
  continent: "AS",
  country: "CN",
  edgeL4: { deliveryRate: 1250000 },
  httpProtocol: "HTTP/3",
  isEUCountry: "0",
  latitude: "31.22222",
  longitude: "121.45806",
  postalCode: "200000",
  quicRtt: 18,
  clientQuicRtt: 18,
  region: "Shanghai",
  regionCode: "SH",
  timezone: "Asia/Shanghai",
  tlsCipher: "AEAD-AES128-GCM-SHA256",
  tlsVersion: "TLSv1.3",
};

function makeRequest(path = "/api/v1/ip", options = {}) {
  const request = new Request(`https://ip.example.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: options.accept ?? "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "CF-Connecting-IP": options.ip ?? "203.0.113.42",
      "CF-Ray": "test-ray-PVG",
      "User-Agent": "Mozilla/5.0 Test Browser",
    },
  });
  Object.defineProperty(request, "cf", { value: options.cf ?? MOCK_CF });
  return request;
}

test("normalizes IPv4, IPv6 and IPv4-mapped IPv6", () => {
  assert.equal(normalizeIp("203.0.113.42"), "203.0.113.42");
  assert.equal(normalizeIp("2001:0DB8::1"), "2001:db8::1");
  assert.equal(normalizeIp("2001:0DB8:0:0:0:0:0:1"), "2001:db8::1");
  assert.equal(normalizeIp("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(getIpVersion("203.0.113.42"), 4);
  assert.equal(getIpVersion("2001:db8::1"), 6);
});

test("rejects spoofed lists and malformed addresses", () => {
  assert.equal(normalizeIp("203.0.113.1, 198.51.100.2"), null);
  assert.equal(normalizeIp("999.1.1.1"), null);
  assert.equal(normalizeIp("2001:::1"), null);
  assert.equal(normalizeIp("hello"), null);
  assert.equal(normalizeIp("[2001:db8::1]"), null);
  assert.equal(normalizeIp("fe80::1%en0"), null);
});

test("builds a stable detailed result with explicit null-friendly fields", () => {
  const result = buildIpResult(makeRequest());
  assert.equal(result.ok, true);
  assert.equal(result.ip, "203.0.113.42");
  assert.equal(result.version, 4);
  assert.equal(result.network.asnLabel, "AS13335");
  assert.equal(result.location.country, "CN");
  assert.equal(result.location.latitude, 31.22222);
  assert.equal(result.connection.quicRttMs, 18);
  assert.equal(result.edge.colo, "PVG");
  assert.deepEqual(result.source, ["cloudflare-edge"]);
  assert.equal(result.privacy.stored, false);
});

test("returns JSON, text and plain IP formats", async () => {
  const json = await routeRequest(makeRequest());
  assert.equal(json.status, 200);
  assert.match(json.headers.get("content-type"), /application\/json/);
  assert.equal((await json.json()).ip, "203.0.113.42");

  const text = await routeRequest(makeRequest("/api/v1/ip?format=text"));
  assert.match(await text.text(), /IP 地址：203\.0\.113\.42/);

  const plain = await routeRequest(makeRequest("/ip"));
  assert.equal((await plain.text()).trim(), "203.0.113.42");
});

test("honors text/plain Accept for Apple Shortcuts", async () => {
  const response = await routeRequest(makeRequest("/api/v1/ip", { accept: "text/plain" }));
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.match(await response.text(), /Cloudflare 节点：PVG/);
});

test("blocks browser cross-origin reads, disables caching and handles methods safely", async () => {
  const options = await routeRequest(makeRequest("/api/v1/ip", { method: "OPTIONS" }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), null);
  assert.equal(options.headers.get("allow"), "GET, HEAD, OPTIONS");

  const post = await routeRequest(makeRequest("/api/v1/ip", { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD, OPTIONS");
  assert.match(post.headers.get("cache-control"), /no-store/);
});

test("does not echo sensitive or spoofable request headers", () => {
  const request = makeRequest();
  request.headers.set("Authorization", "Bearer SECRET_CANARY");
  request.headers.set("Cookie", "token=SECRET_CANARY");
  request.headers.set("X-Forwarded-For", "198.51.100.99");
  const serialized = JSON.stringify(buildIpResult(request));
  assert.doesNotMatch(serialized, /SECRET_CANARY/);
  assert.doesNotMatch(serialized, /198\.51\.100\.99/);
  assert.match(serialized, /203\.0\.113\.42/);
});

test("handles missing edge metadata with an explicit unavailable result", async () => {
  const request = new Request("https://ip.example.com/api/v1/ip", {
    headers: { Accept: "application/json" },
  });
  const response = await routeRequest(request);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.available, false);
  assert.equal(result.ip, null);
  assert.equal(result.version, null);
  assert.equal(result.location.city, null);
});

test("HEAD mirrors API headers without returning a body", async () => {
  const response = await routeRequest(makeRequest("/api/v1/ip", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(await response.text(), "");
});

test("health response is fixed and unknown formats and APIs fail safely", async () => {
  const health = await routeRequest(makeRequest("/healthz"));
  assert.deepEqual(await health.json(), { ok: true, status: "healthy" });

  const format = await routeRequest(makeRequest("/api/v1/ip?format=xml"));
  assert.equal(format.status, 400);
  assert.equal((await format.json()).error.code, "INVALID_FORMAT");

  const missing = await routeRequest(makeRequest("/api/v1/missing"));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");
});

test("sanitizes edge strings and rejects out-of-range coordinates", () => {
  const cf = {
    ...MOCK_CF,
    city: "<script>alert(1)</script>\r\nInjected",
    asOrganization: "Example\u0000Network",
    latitude: "181",
    longitude: "-999",
  };
  const result = buildIpResult(makeRequest("/api/v1/ip", { cf }));
  assert.equal(result.location.city, "<script>alert(1)</script> Injected");
  assert.equal(result.network.organization, "Example Network");
  assert.equal(result.location.latitude, null);
  assert.equal(result.location.longitude, null);
});

test("adds restrictive browser headers to static assets", async () => {
  const request = makeRequest("/");
  const response = await routeRequest(request, {
    ASSETS: {
      fetch: async () => new Response("<h1>IP Lens</h1>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("plain text summary keeps every shortcut-friendly line", () => {
  const text = formatResultAsText(buildIpResult(makeRequest()));
  assert.match(text, /IP 版本：IPv4/);
  assert.match(text, /网络：AS13335 · Cloudflare, Inc\./);
  assert.match(text, /连接：HTTP\/3 · TLSv1\.3/);
  assert.match(text, /往返延迟：18 ms/);
});
