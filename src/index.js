const API_ROUTES = new Set([
  "/api",
  "/api/ip",
  "/api/v1/ip",
  "/json",
]);

const PLAIN_IP_ROUTES = new Set(["/ip", "/api/v1/ip.txt"]);
const HEALTH_ROUTES = new Set(["/health", "/healthz", "/api/health"]);
const API_PREFIXES = ["/api/", "/ip", "/json", "/health"];
const IPINFO_BASE_URL = "https://api.ipinfo.io";
const IPINFO_TIMEOUT_MS = 2000;
const IPINFO_FALLBACK_STATUSES = new Set([402, 403, 404, 429]);
const VALID_FORMATS = new Set(["json", "text", "txt", "plain"]);

const CONTINENT_NAMES = {
  AF: { zh: "非洲", en: "Africa" },
  AN: { zh: "南极洲", en: "Antarctica" },
  AS: { zh: "亚洲", en: "Asia" },
  EU: { zh: "欧洲", en: "Europe" },
  NA: { zh: "北美洲", en: "North America" },
  OC: { zh: "大洋洲", en: "Oceania" },
  SA: { zh: "南美洲", en: "South America" },
};

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "upgrade-insecure-requests",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const API_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Language": "zh-CN",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "服务暂时不可用，请稍后重试。",
          },
          timestamp: new Date().toISOString(),
        },
        500,
        request,
      );
    }
  },
};

export async function routeRequest(request, env = {}, fetchImpl = fetch) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);
  const isApiRequest = isApiPath(pathname);

  if (request.method === "OPTIONS" && isApiRequest) {
    return new Response(null, {
      status: 204,
      headers: { ...API_HEADERS, Allow: "GET, HEAD, OPTIONS" },
    });
  }

  if (isApiRequest && request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "此接口仅支持 GET、HEAD 和 OPTIONS 请求。",
        },
        timestamp: new Date().toISOString(),
      },
      405,
      request,
      { Allow: "GET, HEAD, OPTIONS" },
    );
  }

  if (HEALTH_ROUTES.has(pathname)) {
    return jsonResponse(
      {
        ok: true,
        status: "healthy",
      },
      200,
      request,
    );
  }

  if (PLAIN_IP_ROUTES.has(pathname)) {
    const ip = getClientIp(request);
    return textResponse(ip.address ?? "unknown", 200, request);
  }

  if (API_ROUTES.has(pathname)) {
    const requestedFormat = url.searchParams.get("format");
    const format = (requestedFormat ?? (prefersText(request) ? "text" : "json")).toLowerCase();

    if (!VALID_FORMATS.has(format)) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "INVALID_FORMAT",
            message: "format 仅支持 json、text 或 plain。",
          },
          timestamp: new Date().toISOString(),
        },
        400,
        request,
      );
    }

    const baseResult = buildIpResult(request, url);

    if (format === "plain") {
      return textResponse(baseResult.ip ?? "unknown", 200, request);
    }

    // HEAD must stay fast and side-effect free: never send a visitor IP upstream.
    const result = request.method === "HEAD"
      ? baseResult
      : await enrichIpResult(baseResult, env, fetchImpl);

    if (format === "text" || format === "txt") {
      return textResponse(formatResultAsText(result), 200, request);
    }

    return jsonResponse(result, 200, request);
  }

  if (pathname.startsWith("/api/")) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "接口不存在。请使用 /api/v1/ip。",
        },
        timestamp: new Date().toISOString(),
      },
      404,
      request,
    );
  }

  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("Static asset binding is unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const assetResponse = await env.ASSETS.fetch(request);
  return withSecurityHeaders(assetResponse);
}

export function buildIpResult(request, url = new URL(request.url)) {
  const cf = request.cf ?? {};
  const clientIp = getClientIp(request);
  const locale = getLocale(url.searchParams.get("lang"), request.headers.get("Accept-Language"));
  const countryCode = nullableString(cf.country)?.toUpperCase() ?? null;
  const continentCode = nullableString(cf.continent)?.toUpperCase() ?? null;
  const latitude = nullableNumber(cf.latitude);
  const longitude = nullableNumber(cf.longitude);
  const tcpRtt = nullableNumber(cf.clientTcpRtt);
  const quicRtt = nullableNumber(cf.clientQuicRtt);
  const deliveryRate = nullableNumber(cf.edgeL4?.deliveryRate);
  const asn = nullableNumber(cf.asn);
  const detectedAt = new Date().toISOString();

  return {
    schemaVersion: 2,
    ok: true,
    available: clientIp.address !== null,
    ip: clientIp.address,
    version: clientIp.version,
    network: {
      asn,
      asnLabel: asn === null ? null : `AS${asn}`,
      organization: nullableString(cf.asOrganization),
      domain: null,
      type: null,
    },
    location: {
      country: countryCode,
      countryName: getRegionName(countryCode, locale),
      region: nullableString(cf.region),
      regionCode: nullableString(cf.regionCode),
      city: nullableString(cf.city),
      postalCode: nullableString(cf.postalCode),
      continent: continentCode,
      continentName: getContinentName(continentCode, locale),
      timezone: nullableString(cf.timezone),
      latitude: nullableCoordinate(latitude, -90, 90),
      longitude: nullableCoordinate(longitude, -180, 180),
      isEU: cf.isEUCountry === "1" || cf.isEUCountry === true,
    },
    connection: {
      httpProtocol: nullableString(cf.httpProtocol),
      tlsVersion: nullableString(cf.tlsVersion),
      tlsCipher: nullableString(cf.tlsCipher),
      tcpRttMs: tcpRtt,
      quicRttMs: quicRtt,
      deliveryRateBps: deliveryRate,
    },
    edge: {
      colo: nullableString(cf.colo),
      rayId: nullableString(request.headers.get("CF-Ray")),
    },
    request: {
      method: request.method,
      scheme: url.protocol.replace(":", ""),
    },
    privacy: {
      stored: false,
      preciseLocation: false,
      note: locale.startsWith("zh")
        ? "IP 地理位置为网络数据库的近似结果，不代表精确住址。"
        : "IP geolocation is approximate and does not reveal a precise address.",
    },
    intelligence: emptyIntelligence(),
    source: ["cloudflare-edge"],
    timestamp: detectedAt,
  };
}

export async function enrichIpResult(result, env = {}, fetchImpl = fetch) {
  const mode = getIpinfoMode(env.IPINFO_MODE);
  const token = getIpinfoToken(env.IPINFO_TOKEN);

  if (mode === "off" || token === null) return result;

  const unavailable = {
    ...result,
    intelligence: emptyIntelligence({
      provider: "ipinfo",
      status: "unavailable",
    }),
  };

  if (!result.ip || typeof fetchImpl !== "function") return unavailable;

  const fetched = await fetchIpinfoData(result.ip, token, mode, fetchImpl);
  if (!fetched) return unavailable;

  const mapped = mapIpinfoPayload(fetched.tier, fetched.data);
  const sameNetwork = result.network.asn === null
    || (mapped.intelligence.network.asn !== null
      && result.network.asn === mapped.intelligence.network.asn);
  const mergedNetwork = {
    ...result.network,
    asn: result.network.asn ?? mapped.intelligence.network.asn,
    asnLabel: result.network.asnLabel
      ?? (mapped.intelligence.network.asn === null ? null : `AS${mapped.intelligence.network.asn}`),
    organization: result.network.organization ?? mapped.intelligence.network.name,
    domain: sameNetwork
      ? (result.network.domain ?? mapped.intelligence.network.domain)
      : result.network.domain,
    type: sameNetwork
      ? (result.network.type ?? mapped.intelligence.network.type)
      : result.network.type,
  };

  return {
    ...result,
    network: mergedNetwork,
    location: mergeMissingFields(result.location, mapped.location),
    intelligence: mapped.intelligence,
    source: [...new Set([...result.source, `ipinfo-${fetched.tier}`])],
  };
}

export async function fetchIpinfoData(ip, token, mode = "auto", fetchImpl = fetch) {
  const normalizedIp = normalizeIp(ip);
  const normalizedToken = getIpinfoToken(token);
  const normalizedMode = getIpinfoMode(mode);

  if (!normalizedIp || !normalizedToken || normalizedMode === "off" || typeof fetchImpl !== "function") {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IPINFO_TIMEOUT_MS);

  try {
    if (normalizedMode !== "lite") {
      const lookup = await requestIpinfoTier(
        "lookup",
        normalizedIp,
        normalizedToken,
        fetchImpl,
        controller.signal,
      );
      if (lookup.ok) return { tier: "lookup", data: lookup.data };
      if (normalizedMode === "lookup" || !IPINFO_FALLBACK_STATUSES.has(lookup.status)) return null;
    }

    const lite = await requestIpinfoTier(
      "lite",
      normalizedIp,
      normalizedToken,
      fetchImpl,
      controller.signal,
    );
    return lite.ok ? { tier: "lite", data: lite.data } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestIpinfoTier(tier, ip, token, fetchImpl, signal) {
  const response = await fetchImpl(`${IPINFO_BASE_URL}/${tier}/${encodeURIComponent(ip)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    redirect: "error",
    signal,
  });

  if (!response || !response.ok) {
    return { ok: false, status: response?.status ?? 0, data: null };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, status: response.status, data: null };
  }

  if (!data || typeof data !== "object" || Array.isArray(data) || normalizeIp(data.ip) !== ip) {
    return { ok: false, status: response.status, data: null };
  }

  return { ok: true, status: response.status, data };
}

function mapIpinfoPayload(tier, data) {
  const lookup = tier === "lookup";
  const asData = lookup && data.as && typeof data.as === "object" ? data.as : {};
  const geo = lookup && data.geo && typeof data.geo === "object" ? data.geo : {};
  const anonymous = lookup && data.anonymous && typeof data.anonymous === "object"
    ? data.anonymous
    : {};
  const mobile = lookup && data.mobile && typeof data.mobile === "object" ? data.mobile : {};
  const asn = normalizeAsn(lookup ? asData.asn : data.asn);

  const intelligence = emptyIntelligence({
    provider: "ipinfo",
    status: "available",
    tier,
  });

  intelligence.hostname = lookup ? nullableString(data.hostname) : null;
  intelligence.network = {
    asn,
    name: nullableString(lookup ? asData.name : data.as_name),
    domain: nullableString(lookup ? asData.domain : data.as_domain),
    type: lookup ? nullableString(asData.type) : null,
  };
  intelligence.traits = {
    anonymous: lookup ? nullableBoolean(data.is_anonymous) : null,
    anycast: lookup ? nullableBoolean(data.is_anycast) : null,
    hosting: lookup ? nullableBoolean(data.is_hosting) : null,
    mobile: lookup ? nullableBoolean(data.is_mobile) : null,
    satellite: lookup ? nullableBoolean(data.is_satellite) : null,
  };
  intelligence.privacy = {
    proxy: lookup ? nullableBoolean(anonymous.is_proxy) : null,
    relay: lookup ? nullableBoolean(anonymous.is_relay) : null,
    tor: lookup ? nullableBoolean(anonymous.is_tor) : null,
    vpn: lookup ? nullableBoolean(anonymous.is_vpn) : null,
    residentialProxy: lookup ? nullableBoolean(anonymous.is_res_proxy) : null,
    serviceName: lookup ? nullableString(anonymous.name) : null,
    lastSeen: lookup ? nullableString(anonymous.last_seen) : null,
    percentDaysSeen: lookup ? nullablePercentage(anonymous.percent_days_seen) : null,
  };
  intelligence.carrier = {
    name: lookup ? nullableString(mobile.name) : null,
    mcc: lookup ? nullableScalarString(mobile.mcc) : null,
    mnc: lookup ? nullableScalarString(mobile.mnc) : null,
  };
  intelligence.accuracy = {
    radiusKm: lookup ? nullableNonNegativeNumber(geo.radius) : null,
    geonameId: lookup ? nullableNumber(geo.geoname_id) : null,
    dmaCode: lookup ? nullableNumber(geo.dma_code) : null,
    geoLastChanged: lookup ? nullableString(geo.last_changed) : null,
    asnLastChanged: lookup ? nullableString(asData.last_changed) : null,
  };

  return {
    intelligence,
    location: lookup
      ? {
        country: nullableUppercaseString(geo.country_code),
        countryName: nullableString(geo.country),
        region: nullableString(geo.region),
        regionCode: nullableString(geo.region_code),
        city: nullableString(geo.city),
        postalCode: nullableString(geo.postal_code),
        continent: nullableUppercaseString(geo.continent_code),
        continentName: nullableString(geo.continent),
        timezone: nullableString(geo.timezone),
        latitude: nullableCoordinate(nullableNumber(geo.latitude), -90, 90),
        longitude: nullableCoordinate(nullableNumber(geo.longitude), -180, 180),
      }
      : {
        country: nullableUppercaseString(data.country_code),
        countryName: nullableString(data.country),
        continent: nullableUppercaseString(data.continent_code),
        continentName: nullableString(data.continent),
      },
  };
}

function emptyIntelligence({ provider = null, status = "not_configured", tier = null } = {}) {
  return {
    provider,
    status,
    tier,
    hostname: null,
    network: {
      asn: null,
      name: null,
      domain: null,
      type: null,
    },
    traits: {
      anonymous: null,
      anycast: null,
      hosting: null,
      mobile: null,
      satellite: null,
    },
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
    carrier: {
      name: null,
      mcc: null,
      mnc: null,
    },
    accuracy: {
      radiusKm: null,
      geonameId: null,
      dmaCode: null,
      geoLastChanged: null,
      asnLastChanged: null,
    },
  };
}

export function getClientIp(request) {
  const raw = request.headers.get("CF-Connecting-IP");
  const normalized = normalizeIp(raw);

  if (!normalized) {
    return { address: null, version: null };
  }

  return {
    address: normalized,
    version: getIpVersion(normalized),
  };
}

export function normalizeIp(value) {
  if (typeof value !== "string") return null;

  const ip = value.trim();
  if (!ip || ip.length > 64 || ip.includes(",") || /[\r\n\0]/.test(ip)) return null;

  const mappedMatch = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mappedMatch && isValidIpv4(mappedMatch[1])) {
    return mappedMatch[1];
  }

  if (isValidIpv4(ip)) return ip;
  const ipv6Groups = parseIpv6(ip);
  if (ipv6Groups) return formatIpv6(ipv6Groups);
  return null;
}

export function getIpVersion(ip) {
  if (isValidIpv4(ip)) return 4;
  if (isValidIpv6(ip)) return 6;
  return null;
}

export function formatResultAsText(result) {
  const value = (input) => input ?? "未知";
  const location = [
    result.location.city,
    result.location.region,
    result.location.countryName,
  ].filter(Boolean).join(" · ") || "未知";
  const coordinate = result.location.latitude !== null && result.location.longitude !== null
    ? `${result.location.latitude}, ${result.location.longitude}`
    : "未知";
  const rtt = result.connection.quicRttMs ?? result.connection.tcpRttMs;
  const asn = [result.network.asnLabel, result.network.organization].filter(Boolean).join(" · ") || "未知";
  const intelligence = result.intelligence ?? emptyIntelligence();
  const traits = summarizeFlags(intelligence.traits, {
    anonymous: "匿名网络",
    anycast: "Anycast",
    hosting: "托管机房",
    mobile: "移动网络",
    satellite: "卫星网络",
  });
  const privacy = summarizeFlags(intelligence.privacy, {
    proxy: "代理",
    relay: "中继",
    tor: "Tor",
    vpn: "VPN",
    residentialProxy: "住宅代理",
  });
  const source = result.source.map((item) => ({
    "cloudflare-edge": "Cloudflare Edge",
    "ipinfo-lookup": "IPinfo Lookup",
    "ipinfo-lite": "IPinfo Lite",
  })[item] ?? item).join(" · ");

  const lines = [
    `IP 地址：${value(result.ip)}`,
    `IP 版本：${result.version ? `IPv${result.version}` : "未知"}`,
    `位置：${location}`,
    `坐标：${coordinate}`,
    `时区：${value(result.location.timezone)}`,
    `网络：${asn}`,
  ];

  if (intelligence.status === "available") {
    lines.push(
      `主机名：${value(intelligence.hostname)}`,
      `网络域名：${value(intelligence.network.domain)}`,
      `网络类型：${value(intelligence.network.type)}`,
      `网络特征：${traits}`,
      `隐私特征：${privacy}`,
    );

    if (intelligence.privacy.serviceName) {
      lines.push(`隐私服务：${intelligence.privacy.serviceName}`);
    }

    if (intelligence.carrier.name || intelligence.carrier.mcc || intelligence.carrier.mnc) {
      const carrier = [
        intelligence.carrier.name,
        intelligence.carrier.mcc ? `MCC ${intelligence.carrier.mcc}` : null,
        intelligence.carrier.mnc ? `MNC ${intelligence.carrier.mnc}` : null,
      ].filter(Boolean).join(" · ");
      lines.push(`移动运营商：${carrier}`);
    }

    if (intelligence.accuracy.radiusKm !== null) {
      lines.push(`定位半径：约 ${intelligence.accuracy.radiusKm} km`);
    }
  }

  lines.push(
    `连接：${[result.connection.httpProtocol, result.connection.tlsVersion].filter(Boolean).join(" · ") || "未知"}`,
    `往返延迟：${rtt === null ? "未知" : `${rtt} ms`}`,
    `Cloudflare 节点：${value(result.edge.colo)}`,
    `数据来源：${source || "未知"}`,
    `检测时间：${result.timestamp}`,
  );

  return lines.join("\n");
}

function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

function isApiPath(pathname) {
  return API_ROUTES.has(pathname)
    || PLAIN_IP_ROUTES.has(pathname)
    || HEALTH_ROUTES.has(pathname)
    || API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isValidIpv4(ip) {
  if (typeof ip !== "string" || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
  return ip.split(".").every((part) => {
    const number = Number(part);
    return number >= 0 && number <= 255 && String(number) === part;
  });
}

function isValidIpv6(ip) {
  return parseIpv6(ip) !== null;
}

function parseIpv6(ip) {
  if (typeof ip !== "string" || !ip.includes(":") || ip.includes("%")) return null;
  if (!/^[0-9a-f:.]+$/i.test(ip) || ip.includes(":::")) return null;

  let address = ip;
  const ipv4Tail = ip.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1] ?? null;
  if (ipv4Tail) {
    if (!isValidIpv4(ipv4Tail)) return null;
    const octets = ipv4Tail.split(".").map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${ip.slice(0, -ipv4Tail.length)}${high}:${low}`;
  }

  if ((address.match(/::/g) ?? []).length > 1) return null;
  const hasCompression = address.includes("::");
  const [leftRaw, rightRaw = ""] = address.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  const all = [...left, ...right];

  if (!all.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) return null;
  if (hasCompression) {
    const missing = 8 - all.length;
    if (missing < 1) return null;
    return [...left, ...Array(missing).fill("0"), ...right].map((part) => parseInt(part, 16));
  }

  return all.length === 8 ? all.map((part) => parseInt(part, 16)) : null;
}

function formatIpv6(groups) {
  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;

  for (let index = 0; index <= groups.length; index += 1) {
    if (index < groups.length && groups[index] === 0) {
      if (currentStart === -1) currentStart = index;
      continue;
    }

    if (currentStart !== -1) {
      const length = index - currentStart;
      if (length > bestLength && length >= 2) {
        bestStart = currentStart;
        bestLength = length;
      }
      currentStart = -1;
    }
  }

  const hex = groups.map((group) => group.toString(16));
  if (bestStart === -1) return hex.join(":");

  const left = hex.slice(0, bestStart).join(":");
  const right = hex.slice(bestStart + bestLength).join(":");
  return `${left}::${right}`;
}

function getIpinfoMode(value) {
  if (typeof value !== "string") return "auto";
  const mode = value.trim().toLowerCase();
  return new Set(["auto", "lite", "lookup", "off"]).has(mode) ? mode : "auto";
}

function getIpinfoToken(value) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token || token.length > 512 || /[\u0000-\u001f\u007f]/.test(token)) return null;
  return token;
}

function mergeMissingFields(base, fallback) {
  const merged = { ...base };
  Object.entries(fallback).forEach(([key, value]) => {
    if ((merged[key] === null || merged[key] === undefined) && value !== null && value !== undefined) {
      merged[key] = value;
    }
  });
  return merged;
}

function normalizeAsn(value) {
  if (typeof value === "string") {
    const match = value.trim().match(/^(?:AS)?(\d{1,10})$/i);
    if (!match) return null;
    value = Number(match[1]);
  }

  const asn = nullableNumber(value);
  return Number.isInteger(asn) && asn >= 0 && asn <= 4294967295 ? asn : null;
}

function nullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function nullableScalarString(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return nullableString(String(value));
}

function nullableUppercaseString(value) {
  return nullableString(value)?.toUpperCase() ?? null;
}

function nullableNonNegativeNumber(value) {
  const number = nullableNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function nullablePercentage(value) {
  const number = nullableNumber(value);
  return number !== null && number >= 0 && number <= 100 ? number : null;
}

function summarizeFlags(values, labels) {
  const entries = Object.entries(labels).map(([key, label]) => [values?.[key] ?? null, label]);
  const known = entries.filter(([value]) => value !== null);
  if (known.length === 0) return "数据源未提供";
  const detected = known.filter(([value]) => value === true).map(([, label]) => label);
  return detected.length > 0 ? detected.join(" · ") : "未发现";
}

function nullableString(value) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 512) : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableCoordinate(value, minimum, maximum) {
  return value !== null && value >= minimum && value <= maximum ? value : null;
}

function getLocale(queryLanguage, acceptLanguage) {
  const requested = nullableString(queryLanguage) ?? nullableString(acceptLanguage) ?? "zh-CN";
  return requested.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

function getRegionName(countryCode, locale) {
  if (!countryCode || countryCode === "XX" || countryCode === "T1") return null;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ?? null;
  } catch {
    return countryCode;
  }
}

function getContinentName(continentCode, locale) {
  if (!continentCode) return null;
  const names = CONTINENT_NAMES[continentCode];
  if (!names) return continentCode;
  return locale.startsWith("zh") ? names.zh : names.en;
}

function prefersText(request) {
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("text/plain") && !accept.includes("application/json");
}

function jsonResponse(payload, status, request, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  const headers = {
    ...API_HEADERS,
    ...extraHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "X-Request-ID": request.headers.get("CF-Ray") ?? crypto.randomUUID(),
  };
  return responseForMethod(body, status, headers, request.method);
}

function textResponse(payload, status, request) {
  const headers = {
    ...API_HEADERS,
    "Content-Type": "text/plain; charset=utf-8",
    "X-Request-ID": request.headers.get("CF-Ray") ?? crypto.randomUUID(),
  };
  return responseForMethod(`${payload}\n`, status, headers, request.method);
}

function responseForMethod(body, status, headers, method) {
  return new Response(method === "HEAD" ? null : body, { status, headers });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
