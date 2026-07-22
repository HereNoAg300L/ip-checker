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

  setText("protocolBadge", compactProtocol(data.connection.httpProtocol));
  setText("rttValue", rtt);
  setText("rttUnit", rtt === null ? "" : "ms");
  setText("httpProtocol", data.connection.httpProtocol);
  setText("tlsVersion", data.connection.tlsVersion);
  setText("tlsCipher", data.connection.tlsCipher);
  setText("deliveryRate", formatBitrate(data.connection.deliveryRateBps));
  setText("colo", data.edge.colo);
  setText("rayId", data.edge.rayId);

}

function renderError() {
  document.body.classList.add("load-error");
  setText("ipAddress", "暂时无法检测");
  elements.ipAddress.classList.remove("is-ipv6");
  setText("ipVersion", "错误");
  setText("detectedAt", "请检查网络连接后重试");
  setText("edgeStateText", "检测暂不可用");
  setText("footerStatusText", "服务异常");
  showToast("检测失败，请稍后重试", true);
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
