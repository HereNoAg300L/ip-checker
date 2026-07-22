const API_PATH = "/api/v1/ip";
const EMPTY = "暂无数据";

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map((element) => [element.id, element]),
);

const state = {
  data: null,
  apiFormat: "json",
  client: collectClientDetails(),
};

let toastTimer;

initializeTheme();
wireActions();
renderClientDetails();
setEndpointLabels();
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
  const fullLocation = [data.location.city, data.location.region, data.location.countryName]
    .filter(Boolean)
    .join(" · ");
  const coordinate = formatCoordinate(data.location.latitude, data.location.longitude);
  const rtt = data.connection.quicRttMs ?? data.connection.tcpRttMs;

  renderIpAddress(data.ip, data.version);
  elements.ipAddress.classList.toggle("is-ipv6", data.version === 6);
  setText("ipVersion", data.version ? `IPv${data.version}` : EMPTY);
  setText("detectedAt", `检测于 ${formatTimestamp(data.timestamp)}`);
  setText("heroLocation", fullLocation || EMPTY);
  setText("heroNetwork", data.network.organization || data.network.asnLabel || EMPTY);
  setText("heroColo", data.edge.colo || EMPTY);

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

  setText("protocolBadge", compactProtocol(data.connection.httpProtocol));
  setText("rttValue", rtt);
  setText("rttUnit", rtt === null ? "" : "ms");
  setText("httpProtocol", data.connection.httpProtocol);
  setText("tlsVersion", data.connection.tlsVersion);
  setText("tlsCipher", data.connection.tlsCipher);
  setText("deliveryRate", formatBitrate(data.connection.deliveryRateBps));
  setText("colo", data.edge.colo);
  setText("rayId", data.edge.rayId);

  updateJsonViews();
}

function renderError() {
  document.body.classList.add("load-error");
  setText("ipAddress", "暂时无法检测");
  elements.ipAddress.classList.remove("is-ipv6");
  setText("ipVersion", "错误");
  setText("detectedAt", "请确认网站已部署到 Cloudflare Workers 后重试");
  setText("edgeStateText", "检测暂不可用");
  setText("footerStatusText", "服务异常");
  setText("heroLocation", EMPTY);
  setText("heroNetwork", EMPTY);
  setText("heroColo", EMPTY);
  updateJsonViews();
  showToast("检测失败，请稍后重试", true);
}

function renderClientDetails() {
  const client = state.client;
  setText("browserName", client.browser);
  setText("osName", client.os);
  setText("deviceType", client.device);
  setText("browserLanguage", client.language);
  setText("screenSize", client.screen);
  setText("viewportSize", client.viewport);
  setText("effectiveType", client.connection);
  setText("colorScheme", client.colorScheme);
}

function collectClientDetails() {
  const ua = navigator.userAgent;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const connectionParts = [];

  if (connection?.effectiveType) connectionParts.push(connection.effectiveType.toUpperCase());
  if (typeof connection?.downlink === "number") connectionParts.push(`${connection.downlink} Mbps`);
  if (connection?.saveData) connectionParts.push("省流模式");

  return {
    browser: detectBrowser(ua),
    os: detectOperatingSystem(ua),
    device: detectDevice(ua),
    language: navigator.language || EMPTY,
    screen: `${window.screen.width} × ${window.screen.height} @${window.devicePixelRatio || 1}x`,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    connection: connectionParts.join(" · ") || "浏览器未提供",
    colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "深色" : "浅色",
  };
}

function detectBrowser(ua) {
  const rules = [
    [/EdgiOS\/([\d.]+)/, "Edge iOS"],
    [/EdgA\/([\d.]+)/, "Edge Android"],
    [/Edg\/([\d.]+)/, "Microsoft Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/CriOS\/([\d.]+)/, "Chrome iOS"],
    [/Chrome\/([\d.]+)/, "Google Chrome"],
    [/FxiOS\/([\d.]+)/, "Firefox iOS"],
    [/Firefox\/([\d.]+)/, "Mozilla Firefox"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];

  for (const [pattern, name] of rules) {
    const match = ua.match(pattern);
    if (match) return `${name} ${majorVersion(match[1])}`;
  }

  return "未知浏览器";
}

function detectOperatingSystem(ua) {
  const ios = ua.match(/(?:iPhone OS|CPU OS) ([\d_]+)/);
  if (ios) return `iOS ${majorVersion(ios[1].replaceAll("_", "."))}`;
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${majorVersion(android[1])}`;
  const windows = ua.match(/Windows NT ([\d.]+)/);
  if (windows) {
    const versions = { "10.0": "Windows 10 / 11", "6.3": "Windows 8.1", "6.1": "Windows 7" };
    return versions[windows[1]] || `Windows ${windows[1]}`;
  }
  const mac = ua.match(/Mac OS X ([\d_]+)/);
  if (mac) return `macOS ${majorVersion(mac[1].replaceAll("_", "."))}`;
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "未知系统";
}

function detectDevice(ua) {
  if (/iPad|Tablet|PlayBook/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "平板设备";
  if (/Mobi|iPhone|Android/i.test(ua)) return "移动设备";
  return "桌面设备";
}

function wireActions() {
  elements.refreshData.addEventListener("click", loadIpDetails);
  elements.copyIp.addEventListener("click", () => copyText(state.data?.ip, "IP 已复制"));
  elements.copyTextEndpoint.addEventListener("click", () => copyText(textEndpoint(), "文本接口已复制"));
  elements.copyJsonEndpoint.addEventListener("click", () => copyText(jsonEndpoint(), "JSON 接口已复制"));
  elements.copyApiResponse.addEventListener("click", () => copyText(elements.apiPreview.textContent, "接口内容已复制"));
  elements.dialogCopy.addEventListener("click", () => copyText(elements.dialogJson.textContent, "JSON 已复制"));
  elements.testTextEndpoint.addEventListener("click", () => window.open(textEndpoint(), "_blank", "noopener,noreferrer"));
  elements.shareResult.addEventListener("click", shareResult);
  elements.openJson.addEventListener("click", () => elements.jsonDialog.showModal());
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.closeDialog.addEventListener("click", () => elements.jsonDialog.close());
  elements.jsonDialog.addEventListener("click", (event) => {
    if (event.target === elements.jsonDialog) elements.jsonDialog.close();
  });
  elements.mapLink.addEventListener("click", (event) => {
    if (elements.mapLink.classList.contains("is-disabled")) event.preventDefault();
  });

  document.querySelectorAll("[data-api-format]").forEach((button) => {
    button.addEventListener("click", () => {
      state.apiFormat = button.dataset.apiFormat;
      document.querySelectorAll("[data-api-format]").forEach((row) => row.classList.toggle("is-active", row === button));
      updateJsonViews();
    });
  });

  window.addEventListener("resize", debounce(() => {
    state.client.viewport = `${window.innerWidth} × ${window.innerHeight}`;
    renderClientDetails();
  }, 150));
}

function updateJsonViews() {
  const json = state.data
    ? JSON.stringify(state.data, null, 2)
    : JSON.stringify({ ok: false, error: { code: "IP_UNAVAILABLE" } }, null, 2);
  const text = state.data ? formatAsClientText(state.data) : "IP 信息暂不可用";
  const plain = state.data?.ip || "unknown";
  const content = state.apiFormat === "text" ? text : state.apiFormat === "plain" ? plain : json;
  const label = state.apiFormat === "json" ? "response.json" : state.apiFormat === "text" ? "response.txt" : "ip.txt";

  elements.apiPreview.textContent = content;
  elements.dialogJson.textContent = json;
  setText("codePanelLabel", label);
}

function formatAsClientText(data) {
  const rtt = data.connection.quicRttMs ?? data.connection.tcpRttMs;
  return [
    `IP 地址：${data.ip || "未知"}`,
    `IP 版本：${data.version ? `IPv${data.version}` : "未知"}`,
    `位置：${[data.location.city, data.location.region, data.location.countryName].filter(Boolean).join(" · ") || "未知"}`,
    `网络：${[data.network.asnLabel, data.network.organization].filter(Boolean).join(" · ") || "未知"}`,
    `连接：${[data.connection.httpProtocol, data.connection.tlsVersion].filter(Boolean).join(" · ") || "未知"}`,
    `往返延迟：${rtt === null ? "未知" : `${rtt} ms`}`,
    `Cloudflare 节点：${data.edge.colo || "未知"}`,
  ].join("\n");
}

function setEndpointLabels() {
  elements.shortcutTextUrl.textContent = textEndpoint();
}

function jsonEndpoint() {
  return new URL(API_PATH, window.location.origin).href;
}

function textEndpoint() {
  const url = new URL(API_PATH, window.location.origin);
  url.searchParams.set("format", "text");
  return url.href;
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

async function shareResult() {
  if (!state.data) return;
  const shareData = {
    title: "IP Lens 检测结果",
    text: `我的公网 IP：${state.data.ip}（IPv${state.data.version}）`,
    url: window.location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  await copyText(`${shareData.text}\n${shareData.url}`, "结果已复制，可直接分享");
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

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("ip-lens-theme", next); } catch { /* Storage can be unavailable. */ }
  state.client.colorScheme = next === "dark" ? "深色" : "浅色";
  renderClientDetails();
}

function setText(id, value) {
  const element = elements[id];
  if (!element) return;
  element.textContent = value === null || value === undefined || value === "" ? EMPTY : String(value);
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

function countryFlag(countryCode) {
  if (!/^[A-Z]{2}$/.test(countryCode || "")) return "◎";
  return [...countryCode].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}

function majorVersion(version) {
  return version ? version.split(".")[0] : "";
}

function debounce(callback, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
