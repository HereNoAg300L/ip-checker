const API_ROUTES = new Set([
  "/api",
  "/api/ip",
  "/api/v1/ip",
  "/json",
]);

const PLAIN_IP_ROUTES = new Set(["/ip", "/api/v1/ip.txt"]);
const HEALTH_ROUTES = new Set(["/health", "/healthz", "/api/health"]);
const API_PREFIXES = ["/api/", "/ip", "/json", "/health"];

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

export async function routeRequest(request, env = {}) {
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
    const result = buildIpResult(request, url);
    const format = pathname === "/api/v1/ip.txt"
      ? "text"
      : (url.searchParams.get("format") ?? "json").toLowerCase();

    if (format === "text" || format === "txt" || prefersText(request)) {
      return textResponse(formatResultAsText(result), 200, request);
    }

    if (format === "plain") {
      return textResponse(result.ip ?? "unknown", 200, request);
    }

    if (format !== "json") {
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
    schemaVersion: 1,
    ok: true,
    available: clientIp.address !== null,
    ip: clientIp.address,
    version: clientIp.version,
    network: {
      asn,
      asnLabel: asn === null ? null : `AS${asn}`,
      organization: nullableString(cf.asOrganization),
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
    source: ["cloudflare-edge"],
    timestamp: detectedAt,
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

  return [
    `IP 地址：${value(result.ip)}`,
    `IP 版本：${result.version ? `IPv${result.version}` : "未知"}`,
    `位置：${location}`,
    `坐标：${coordinate}`,
    `时区：${value(result.location.timezone)}`,
    `网络：${asn}`,
    `连接：${[result.connection.httpProtocol, result.connection.tlsVersion].filter(Boolean).join(" · ") || "未知"}`,
    `往返延迟：${rtt === null ? "未知" : `${rtt} ms`}`,
    `Cloudflare 节点：${value(result.edge.colo)}`,
    `检测时间：${result.timestamp}`,
  ].join("\n");
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
