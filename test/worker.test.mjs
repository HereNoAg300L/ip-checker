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
  assert.equal(result.schemaVersion, 2);
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
  assert.deepEqual(result.intelligence, {
    provider: null,
    status: "not_configured",
    tier: null,
    hostname: null,
    network: { asn: null, name: null, domain: null, type: null },
    traits: { anonymous: null, anycast: null, hosting: null, mobile: null, satellite: null },
    privacy: {
      proxy: null,
      relay: null,
      tor: null,
      vpn: null,
      residentialProxy: null,
      serviceName: null,
      lastSeen: null,
      percentDaysSeen: null,
    },
    carrier: { name: null, mcc: null, mnc: null },
    accuracy: {
      radiusKm: null,
      geonameId: null,
      dmaCode: null,
      geoLastChanged: null,
      asnLastChanged: null,
    },
  });
});

test("enriches detailed JSON with IPinfo lookup while preserving false and Cloudflare priority", async () => {
  const calls = [];
  const response = await routeRequest(
    makeRequest(),
    { IPINFO_TOKEN: "SECRET_TOKEN", IPINFO_MODE: "auto" },
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        ip: "203.0.113.42",
        hostname: "host.example.net",
        geo: {
          city: "Different City",
          region: "Different Region",
          region_code: "DR",
          country: "Exampleland",
          country_code: "EX",
          continent: "Example Continent",
          continent_code: "EC",
          latitude: 10.5,
          longitude: 20.25,
          timezone: "Etc/UTC",
          postal_code: "12345",
          radius: 25,
          geoname_id: 123456,
          dma_code: 807,
          last_changed: "2026-07-01",
        },
        as: {
          asn: "AS64500",
          name: "Example Transit",
          domain: "example.net",
          type: "isp",
          last_changed: "2026-06-20",
        },
        mobile: { name: "Example Mobile", mcc: "460", mnc: 1 },
        anonymous: {
          name: "Example VPN",
          is_proxy: false,
          is_relay: true,
          is_tor: false,
          is_vpn: true,
          is_res_proxy: false,
          last_seen: "2026-07-21",
          percent_days_seen: 1,
        },
        is_anonymous: true,
        is_anycast: false,
        is_hosting: true,
        is_mobile: false,
        is_satellite: false,
      });
    },
  );

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.ipinfo.io/lookup/203.0.113.42");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer SECRET_TOKEN");
  assert.equal(calls[0].options.redirect, "error");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(result.intelligence.provider, "ipinfo");
  assert.equal(result.intelligence.status, "available");
  assert.equal(result.intelligence.tier, "lookup");
  assert.equal(result.intelligence.hostname, "host.example.net");
  assert.deepEqual(result.intelligence.network, {
    asn: 64500,
    name: "Example Transit",
    domain: "example.net",
    type: "isp",
  });
  assert.equal(result.intelligence.traits.anycast, false);
  assert.equal(result.intelligence.traits.hosting, true);
  assert.equal(result.intelligence.privacy.proxy, false);
  assert.equal(result.intelligence.privacy.relay, true);
  assert.equal(result.intelligence.privacy.vpn, true);
  assert.equal(result.intelligence.privacy.residentialProxy, false);
  assert.equal(result.intelligence.privacy.serviceName, "Example VPN");
  assert.equal(result.intelligence.privacy.percentDaysSeen, 1);
  assert.equal(result.intelligence.carrier.mnc, "1");
  assert.equal(result.intelligence.accuracy.radiusKm, 25);
  assert.equal(result.intelligence.accuracy.geoLastChanged, "2026-07-01");
  assert.equal(result.network.domain, null);
  assert.equal(result.network.type, null);
  assert.equal(result.location.city, "Shanghai");
  assert.deepEqual(result.source, ["cloudflare-edge", "ipinfo-lookup"]);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_TOKEN/);
});

test("auto mode falls back from an unavailable lookup plan to IPinfo Lite", async () => {
  const urls = [];
  const response = await routeRequest(
    makeRequest(),
    { IPINFO_TOKEN: "lite-token" },
    async (url) => {
      urls.push(url);
      if (url.includes("/lookup/")) return new Response("plan required", { status: 403 });
      return Response.json({
        ip: "203.0.113.42",
        asn: "AS64501",
        as_name: "Lite Network",
        as_domain: "lite.example",
        country_code: "CN",
        country: "China",
        continent_code: "AS",
        continent: "Asia",
      });
    },
  );

  const result = await response.json();
  assert.deepEqual(urls, [
    "https://api.ipinfo.io/lookup/203.0.113.42",
    "https://api.ipinfo.io/lite/203.0.113.42",
  ]);
  assert.equal(result.intelligence.status, "available");
  assert.equal(result.intelligence.tier, "lite");
  assert.equal(result.intelligence.network.asn, 64501);
  assert.equal(result.intelligence.network.domain, "lite.example");
  assert.equal(result.intelligence.traits.hosting, null);
  assert.equal(result.intelligence.privacy.vpn, null);
  assert.deepEqual(result.source, ["cloudflare-edge", "ipinfo-lite"]);
});

test("text responses also use enrichment and expose shortcut-friendly details", async () => {
  let calls = 0;
  const response = await routeRequest(
    makeRequest("/api/v1/ip?format=text"),
    { IPINFO_TOKEN: "text-token", IPINFO_MODE: "lookup" },
    async () => {
      calls += 1;
      return Response.json({
        ip: "203.0.113.42",
        hostname: "shortcut.example.net",
        geo: { radius: 10 },
        as: { asn: "AS64503", name: "Shortcut ISP", domain: "shortcut.example", type: "isp" },
        anonymous: { is_proxy: false, is_vpn: true },
        is_anycast: false,
        is_hosting: false,
        is_mobile: false,
        is_satellite: false,
      });
    },
  );

  const text = await response.text();
  assert.equal(calls, 1);
  assert.match(text, /主机名：shortcut\.example\.net/);
  assert.match(text, /网络域名：shortcut\.example/);
  assert.match(text, /隐私特征：VPN/);
  assert.match(text, /定位半径：约 10 km/);
  assert.match(text, /数据来源：Cloudflare Edge · IPinfo Lookup/);
});

test("lite mode supports IPv6 without trying lookup", async () => {
  const urls = [];
  const request = makeRequest("/api/v1/ip", { ip: "2001:0DB8::1", cf: {} });
  const response = await routeRequest(
    request,
    { IPINFO_TOKEN: "ipv6-token", IPINFO_MODE: "LiTe" },
    async (url) => {
      urls.push(url);
      return Response.json({
        ip: "2001:db8:0:0:0:0:0:1",
        asn: "AS64502",
        as_name: "IPv6 Network",
        as_domain: "v6.example",
        country_code: "US",
        country: "United States",
        continent_code: "NA",
        continent: "North America",
      });
    },
  );

  const result = await response.json();
  assert.deepEqual(urls, ["https://api.ipinfo.io/lite/2001%3Adb8%3A%3A1"]);
  assert.equal(result.ip, "2001:db8::1");
  assert.equal(result.version, 6);
  assert.equal(result.location.country, "US");
  assert.equal(result.location.countryName, "United States");
  assert.equal(result.network.asnLabel, "AS64502");
  assert.equal(result.network.domain, "v6.example");
});

test("lookup failures fail open without leaking the token or adding an IPinfo source", async () => {
  let calls = 0;
  const response = await routeRequest(
    makeRequest(),
    { IPINFO_TOKEN: "DO_NOT_LEAK", IPINFO_MODE: "lookup" },
    async () => {
      calls += 1;
      throw new Error("upstream failed with DO_NOT_LEAK");
    },
  );

  assert.equal(response.status, 200);
  const body = await response.text();
  const result = JSON.parse(body);
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.intelligence.provider, "ipinfo");
  assert.equal(result.intelligence.status, "unavailable");
  assert.equal(result.intelligence.tier, null);
  assert.equal(result.intelligence.privacy.vpn, null);
  assert.deepEqual(result.source, ["cloudflare-edge"]);
  assert.doesNotMatch(body, /DO_NOT_LEAK/);
});

test("plain IP, format=plain, HEAD, missing token and off mode never call IPinfo", async () => {
  let calls = 0;
  const shouldNotRun = async () => {
    calls += 1;
    throw new Error("unexpected upstream call");
  };
  const configured = { IPINFO_TOKEN: "configured-token" };

  await routeRequest(makeRequest("/ip"), configured, shouldNotRun);
  await routeRequest(makeRequest("/api/v1/ip?format=plain"), configured, shouldNotRun);
  await routeRequest(makeRequest("/api/v1/ip", { method: "HEAD" }), configured, shouldNotRun);
  const withoutToken = await routeRequest(makeRequest(), {}, shouldNotRun);
  const off = await routeRequest(
    makeRequest(),
    { IPINFO_TOKEN: "configured-token", IPINFO_MODE: "off" },
    shouldNotRun,
  );

  assert.equal(calls, 0);
  assert.equal((await withoutToken.json()).intelligence.status, "not_configured");
  assert.equal((await off.json()).intelligence.status, "not_configured");
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
