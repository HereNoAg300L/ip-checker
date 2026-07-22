const API_PATH = "/api/v1/ip";
const EMPTY = "暂无数据";

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map((element) => [element.id, element]),
);

const state = {
  data: null,
};

let toastTimer;

initializeTheme();
initializeDetails();
wireActions();
loadIpDetails();

async function loadIpDetails() {
  document.body.classList.add("is-loading");
  document.body.classList.remove("load-error");
  elements.refreshData.classList.add("is-spinning");
  elements.ipStage.setAttribute("aria-busy", "true");
  elements.copyIp.disabled = true;
  setText("edgeStateText", "检测连接中…");

  try {
    const response = await fetch(`${API_PATH}?_=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok || !data.available || !data.ip) throw new Error("IP_UNAVAILABLE");

    state.data = data;
    renderIpDetails(data);
    setText("edgeStateText", "边缘检测在线");
    setText("footerStatusText", "服务正常");
    elements.copyIp.disabled = false;
  } catch {
    state.data = null;
    renderError();
  } finally {
    document.body.classList.remove("is-loading");
    elements.refreshData.classList.remove("is-spinning");
    elements.ipStage.setAttribute("aria-busy", "false");
  }
}

function renderIpDetails(data) {
  const locationParts = [data.location.city, data.location.region].filter(Boolean);
  const coordinate = formatCoordinate(data.location.latitude, data.location.longitude);
  const rtt = data.connection.quicRttMs ?? data.connection.tcpRttMs;

  renderIpAddress(data.ip, data.version);
  elements.ipAddress.classList.toggle("is-ipv6", data.version === 6);
  setText("ipVersion", data.version ? `IPv${data.version}` : EMPTY);
  setText("detectedAt", `检测于 ${formatTimestamp(data.timestamp)}`);
  setText("locationPrimary", locationParts.join(" · ") || data.location.countryName || EMPTY);
  setText("locationSecondary", [data.location.countryName, data.location.country].filter(Boolean).join(" / ") || EMPTY);
  setText("countryName", joinCode(data.location.countryName, data.location.country));
  setText("regionName", joinCode(data.location.region, data.location.regionCode));
  setText("cityName", data.location.city);
  setText("postalCode", data.location.postalCode);
  setText("timezone", data.location.timezone);
  setText("localTime", formatLocalTime(data.location.timezone));
  setText("coordinates", coordinate);
  setText("continent", joinCode(data.location.continentName, data.location.continent));
  setText("countryFlag", countryFlag(data.location.country));
  configureMapLink(data.location.latitude, data.location.longitude);

  setText("asnLabel", data.network.asnLabel);
  setText("organization", data.network.organization);
  setText("networkIp", data.ip);
  setText("networkVersion", data.version ? `IPv${data.version}` : null);
  renderIntelligence(data);

  setText("protocolBadge", compactProtocol(data.connection.httpProtocol));
  setText("rttValue", rtt);
  elements.rttUnit.textContent = rtt === null ? "" : "ms";
  setText("httpProtocol", data.connection.httpProtocol);
  setText("tlsVersion", data.connection.tlsVersion);
  setText("tlsCipher", data.connection.tlsCipher);
  setText("deliveryRate", formatBitrate(data.connection.deliveryRateBps));
  setText("colo", data.edge.colo);
  setText("rayId", data.edge.rayId);
}

function renderIntelligence(data) {
  const intelligence = data.intelligence ?? {};
  const intelligenceNetwork = intelligence.network ?? {};
  const traits = intelligence.traits ?? {};
  const privacy = intelligence.privacy ?? {};
  const carrier = intelligence.carrier ?? {};
  const accuracy = intelligence.accuracy ?? {};
  const status = intelligence.status ?? "not_configured";
  const tier = intelligence.tier ?? null;

  setText("networkDomain", intelligenceNetwork.domain ?? data.network?.domain);
  setText("networkType", formatNetworkType(intelligenceNetwork.type ?? data.network?.type));
  setText("dataSource", formatSources(data.source));
  setText(
    "networkSource",
    status === "available"
      ? (tier === "lite" ? "Cloudflare + Lite" : "Cloudflare + IPinfo")
      : "Cloudflare",
  );

  elements.intelligenceState.classList.toggle("is-active", status === "available");
  elements.intelligenceState.classList.toggle("is-unavailable", status === "unavailable");

  if (status === "available") {
    setText("intelligenceSource", tier === "lite" ? "IPinfo Lite" : "IPinfo");
    setText("intelligenceTitle", "网络情报增强已启用");
    setText(
      "intelligenceDescription",
      tier === "lite"
        ? "已补充 ASN 与网络域名；更多检测字段需要相应的 IPinfo 套餐。"
        : "已按当前 IPinfo 套餐返回可用的网络与隐私检测字段。",
    );
    setText("providerNote", "本次增强查询已将当前公网 IP 发送至 IPinfo；本站不保存查询结果。");
  } else if (status === "unavailable") {
    setText("intelligenceSource", "Cloudflare");
    setText("intelligenceTitle", "增强查询暂不可用");
    setText("intelligenceDescription", "已自动降级为 Cloudflare 基础信息，不影响当前 IP 检测。");
    setText("providerNote", "已配置 IPinfo，但本次查询失败或超时；不会向浏览器暴露访问令牌。");
  } else {
    setText("intelligenceSource", "Cloudflare");
    setText("intelligenceTitle", "仅显示基础信息");
    setText("intelligenceDescription", "部署者配置 IPinfo 后，可补充网络类型与隐私特征。");
    setText("providerNote", "未启用 IPinfo 时，不会向第三方发送当前 IP。");
  }

  renderTrait("traitAnonymous", traits.anonymous);
  renderTrait("traitVpn", privacy.vpn);
  renderTrait("traitProxy", privacy.proxy);
  renderTrait("traitTor", privacy.tor);
  renderTrait("traitRelay", privacy.relay);
  renderTrait("traitHosting", traits.hosting);
  renderTrait("traitAnycast", traits.anycast);
  renderTrait("traitMobile", traits.mobile);
  renderTrait("traitSatellite", traits.satellite);

  setText("hostname", intelligence.hostname);
  setText("privacyService", privacy.serviceName);
  setText("mobileCarrier", formatCarrier(carrier));
  setText("accuracyRadius", formatRadius(accuracy.radiusKm));
  setText("geonameId", accuracy.geonameId);
  setText("residentialProxy", formatBooleanFinding(privacy.residentialProxy));
  setText("privacyLastSeen", privacy.lastSeen);
  setText("privacyFrequency", formatPercentage(privacy.percentDaysSeen));
}

function renderError() {
  document.body.classList.add("load-error");
  clearRenderedDetails();
  setText("ipAddress", "暂时无法检测");
  elements.ipAddress.classList.remove("is-ipv6");
  setText("ipVersion", "错误");
  setText("detectedAt", "请检查网络连接后重试");
  setText("edgeStateText", "检测暂不可用");
  setText("footerStatusText", "服务异常");
  elements.intelligenceState.classList.remove("is-active");
  elements.intelligenceState.classList.add("is-unavailable");
  setText("intelligenceSource", "不可用");
  setText("intelligenceTitle", "暂时无法取得检测信息");
  setText("intelligenceDescription", "请检查网络连接后重新检测。");
  setText("providerNote", "本次检测失败，未显示上一次查询结果。");
  showToast("检测失败，请稍后重试", true);
}

function clearRenderedDetails() {
  [
    "locationPrimary",
    "locationSecondary",
    "countryName",
    "regionName",
    "cityName",
    "postalCode",
    "timezone",
    "localTime",
    "coordinates",
    "continent",
    "asnLabel",
    "organization",
    "networkIp",
    "networkVersion",
    "networkDomain",
    "networkType",
    "dataSource",
    "protocolBadge",
    "rttValue",
    "httpProtocol",
    "tlsVersion",
    "tlsCipher",
    "deliveryRate",
    "colo",
    "rayId",
    "hostname",
    "privacyService",
    "mobileCarrier",
    "accuracyRadius",
    "geonameId",
    "residentialProxy",
    "privacyLastSeen",
    "privacyFrequency",
  ].forEach((id) => setText(id, null));

  elements.rttUnit.textContent = "";
  setText("countryFlag", "◎");
  setText("networkSource", "不可用");
  configureMapLink(null, null);
  [
    "traitAnonymous",
    "traitVpn",
    "traitProxy",
    "traitTor",
    "traitRelay",
    "traitHosting",
    "traitAnycast",
    "traitMobile",
    "traitSatellite",
  ].forEach((id) => renderTrait(id, null));
}

function wireActions() {
  elements.refreshData.addEventListener("click", loadIpDetails);
  elements.copyIp.addEventListener("click", () => copyText(state.data?.ip, "IP 已复制"));
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.mapLink.addEventListener("click", (event) => {
    if (elements.mapLink.classList.contains("is-disabled")) event.preventDefault();
  });
}

async function copyText(value, message) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.className = "clipboard-proxy";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(message);
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.querySelector("span").textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2300);
}

function configureMapLink(latitude, longitude) {
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude);
  if (!valid) {
    elements.mapLink.classList.add("is-disabled");
    elements.mapLink.setAttribute("aria-disabled", "true");
    elements.mapLink.href = "#";
    return;
  }

  elements.mapLink.classList.remove("is-disabled");
  elements.mapLink.removeAttribute("aria-disabled");
  elements.mapLink.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=10/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;
}

function initializeTheme() {
  let saved = null;
  try { saved = localStorage.getItem("ip-lens-theme"); } catch { /* Storage can be unavailable. */ }
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = saved || (systemDark ? "dark" : "light");
}

function initializeDetails() {
  if (window.matchMedia("(max-width: 700px)").matches) {
    elements.moreDetails.removeAttribute("open");
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("ip-lens-theme", next); } catch { /* Storage can be unavailable. */ }
}

function setText(id, value) {
  const element = elements[id];
  if (!element) return;
  element.textContent = value === null || value === undefined || value === "" ? EMPTY : String(value);
}

function renderTrait(id, value) {
  const element = elements[id];
  if (!element) return;

  element.classList.remove("is-detected", "is-clear", "is-unknown");
  const result = element.querySelector("em");

  if (value === true) {
    element.classList.add("is-detected");
    result.textContent = "检测到";
  } else if (value === false) {
    element.classList.add("is-clear");
    result.textContent = "未发现";
  } else {
    element.classList.add("is-unknown");
    result.textContent = "未提供";
  }
}

function renderIpAddress(ip, version) {
  elements.ipAddress.textContent = "";
  elements.ipAddress.setAttribute("aria-label", ip);

  if (version !== 6) {
    elements.ipAddress.textContent = ip;
    return;
  }

  const groups = ip.split(":");
  groups.forEach((group, index) => {
    elements.ipAddress.append(document.createTextNode(group));
    if (index < groups.length - 1) {
      elements.ipAddress.append(document.createTextNode(":"));
      elements.ipAddress.append(document.createElement("wbr"));
    }
  });
}

function joinCode(name, code) {
  if (name && code) return `${name} (${code})`;
  return name || code || EMPTY;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return EMPTY;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

function formatLocalTime(timezone) {
  if (!timezone) return EMPTY;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return EMPTY;
  }
}

function formatCoordinate(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return EMPTY;
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function formatBitrate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond)) return EMPTY;
  const megabits = (bytesPerSecond * 8) / 1_000_000;
  return `≈ ${megabits.toFixed(megabits >= 10 ? 1 : 2)} Mbps`;
}

function compactProtocol(protocol) {
  if (!protocol) return EMPTY;
  return protocol.replace("HTTP/", "H");
}

function formatNetworkType(type) {
  const labels = {
    business: "企业网络",
    education: "教育网络",
    government: "政府网络",
    hosting: "托管 / 数据中心",
    isp: "互联网服务商",
  };
  return labels[type] || type || EMPTY;
}

function formatSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return "Cloudflare Edge";
  const labels = sources.map((source) => {
    if (source === "cloudflare-edge") return "Cloudflare Edge";
    if (source === "ipinfo-lite") return "IPinfo Lite";
    if (source === "ipinfo-lookup") return "IPinfo";
    return source;
  });
  return [...new Set(labels)].join(" + ");
}

function formatCarrier(carrier) {
  const code = [carrier.mcc, carrier.mnc].filter(Boolean).join("/");
  if (carrier.name && code) return `${carrier.name} (${code})`;
  return carrier.name || code || EMPTY;
}

function formatRadius(radiusKm) {
  return Number.isFinite(radiusKm) ? `约 ${radiusKm} 公里` : EMPTY;
}

function formatBooleanFinding(value) {
  if (value === true) return "检测到";
  if (value === false) return "未发现";
  return EMPTY;
}

function formatPercentage(value) {
  if (!Number.isFinite(value)) return EMPTY;
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function countryFlag(countryCode) {
  if (!/^[A-Z]{2}$/.test(countryCode || "")) return "◎";
  return [...countryCode].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}
