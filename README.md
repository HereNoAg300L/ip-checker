# IP Lens

一个面向个人自托管的 IP 检测网站：运行在 Cloudflare Workers，无数据库，默认不调用第三方 IP 查询服务，也不需要 API Key。网页、详细 JSON API 和苹果快捷指令接口一次部署全部可用；如需更丰富的网络信息，可选择启用 IPinfo。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/HereNoAg300L/ip-checker)

> 点击上方按钮即可从 `HereNoAg300L/ip-checker` 部署。如果你将项目复制到自己的仓库，请把按钮链接替换为新的公开仓库 URL。

![IP Lens 桌面端预览](docs/preview.png)

<details>
<summary>查看移动端长页面预览</summary>

<img src="docs/preview-mobile.png" width="390" alt="IP Lens 移动端预览">
</details>

## 功能

- 自动识别公网 IPv4 / IPv6，并规范化 IPv4-mapped IPv6。
- 首页简洁呈现当前 IP、地理归属、网络身份、网络特征和连接质量。
- 显示国家、地区、城市、邮编、时区、经纬度和当地时间。
- 显示 ASN、网络组织、HTTP / TLS 协议、边缘延迟、Cloudflare 节点和 Ray ID。
- 可选接入 IPinfo，按实际套餐补充 ASN 域名、网络类型、主机名、运营商及代理 / VPN / Tor 等网络特征。
- 提供详细 JSON、中文纯文本和仅 IP 三类稳定接口。
- 适配 iPhone、iPad 和 Mac 的“快捷指令”。
- 响应禁止共享缓存，不回显 Cookie、Authorization 或任意转发头。
- 自动深浅色、键盘焦点、加载状态、移动端单列和减少动态效果。

默认情况下，所有 IP 地理信息都来自当前请求的 Cloudflare `request.cf` 元数据，不会把访客 IP 发送给第三方。配置 IPinfo 后，Worker 会在服务端查询补充信息。位置始终是网络数据库的近似结果，不代表精确住址；ASN 组织名也不一定等同于运营商品牌。

## 一键部署

### Cloudflare Deploy 按钮

1. 将 `ip-checker` 目录作为公开仓库推送到 GitHub。
2. 修改 README 顶部 Deploy 按钮的仓库 URL（如果仓库不是 `HereNoAg300L/ip-checker`）。
3. 点击 **Deploy to Cloudflare**。
4. 登录 Cloudflare，确认仓库名和 Worker 名，随后部署。

Cloudflare 会克隆仓库、配置 Workers Builds 并执行 `npx wrangler deploy`。本项目不依赖 KV、D1、R2；默认功能也不依赖 Secret，首次部署无需填写额外配置。

### 命令行部署

需要 Node.js 22 或更高版本：

```bash
corepack enable
pnpm install
pnpm deploy
```

首次执行时 Wrangler 会引导登录 Cloudflare。部署完成后会得到一个 `*.workers.dev` 地址，也可在 Cloudflare 控制台绑定自己的域名。

## 可选：启用 IPinfo 详细信息

不配置时，网站只使用 Cloudflare 自带数据，部署和全部基础接口都能正常使用。若希望补充更详细的网络身份，可以把自己的 IPinfo Token 保存为 Worker Secret：

1. 登录 IPinfo，在账户页面取得 Token。
2. 打开 Cloudflare Dashboard，进入 **Workers & Pages**，选择此 Worker。
3. 依次打开 **Settings → Variables and Secrets → Add**。
4. 类型选择 **Secret**，名称填写 `IPINFO_TOKEN`，值填写 Token，并保存。
5. 可选添加普通文本变量 `IPINFO_MODE`；不添加时默认为 `auto`。

`IPINFO_MODE` 支持以下值：

| 值 | 行为 |
| --- | --- |
| `auto` | 默认。先查询详细接口；当前套餐不能使用时自动尝试 Lite。 |
| `lite` | 只查询 IPinfo Lite。 |
| `lookup` | 只查询 Core / Plus / Max 的详细接口。 |
| `off` | 即使已配置 Token 也关闭 IPinfo 查询。 |

如果使用免费 Lite Token，建议直接设置 `IPINFO_MODE=lite`，可以少一次不支持的详细接口尝试并更快返回。

也可以在项目目录使用 Wrangler 配置 Secret：

```bash
npx wrangler secret put IPINFO_TOKEN
```

请在命令提示后粘贴 Token，不要把 Token 写进 `wrangler.jsonc`、Git 提交、网页代码或公开 Issue。`IPINFO_MODE` 可在 Cloudflare 控制台作为普通变量配置。

不同套餐可返回的字段不同：

- **IPinfo Lite** 免费且只提供 ASN、AS 名称 / 域名、国家和大洲等基础信息。
- **Core** 可补充城市、主机名、网络类型及匿名、托管、Anycast、移动 / 卫星网络等概括特征。
- **Plus / Max** 才会进一步提供 VPN、代理、Tor、Relay、移动运营商及定位精度等细分字段。

某个字段为 `null` 通常表示当前套餐或该 IP 没有这项数据。

IPinfo 请求由 Worker 在后端通过 `Authorization: Bearer …` 发起，Token 不会进入浏览器或 API 响应。启用后，访客 IP 会发送给 IPinfo；查询失败或约 2 秒内无响应时会自动降级为 Cloudflare 数据，页面仍可使用。项目本身不会存储查询结果。使用 Lite 时请保留页面中的 IPinfo 数据来源标识，并遵守其[数据署名要求](https://ipinfo.io/attribution)。

### 本地开发

```bash
corepack enable
pnpm install
pnpm dev
```

Cloudflare 的 `request.cf` 在 Dashboard / Playground 预览中可能不可用。若只想查看带模拟数据的完整界面：

```bash
pnpm preview:mock
```

然后访问 `http://127.0.0.1:8787`。

## API

所有访客信息响应都带有 `Cache-Control: private, no-store`。字段缺失时返回 `null`，不会省略字段或猜测结果。

| 接口 | 返回 | 用途 |
| --- | --- | --- |
| `GET /api/v1/ip` | JSON | 完整 IP、位置、网络与连接信息 |
| `GET /api/v1/ip?format=text` | `text/plain` | 排版好的中文摘要，适合快捷指令直接显示 |
| `GET /api/v1/ip?format=plain` | `text/plain` | 仅当前 IP |
| `GET /ip` | `text/plain` | 仅当前 IP 的短路径 |
| `GET /api/v1/ip.txt` | `text/plain` | 仅当前 IP，兼容 `.txt` 调用习惯 |
| `GET /healthz` | JSON | 最小健康检查，不返回访客信息 |

### JSON 示例

```json
{
  "schemaVersion": 2,
  "ok": true,
  "available": true,
  "ip": "203.0.113.42",
  "version": 4,
  "network": {
    "asn": 4134,
    "asnLabel": "AS4134",
    "organization": "CHINANET-BACKBONE",
    "domain": "chinatelecom.com.cn",
    "type": "isp"
  },
  "intelligence": {
    "provider": "ipinfo",
    "status": "available",
    "tier": "lookup",
    "hostname": "example.net",
    "network": {
      "asn": 4134,
      "name": "CHINANET-BACKBONE",
      "domain": "chinatelecom.com.cn",
      "type": "isp"
    },
    "traits": {
      "anonymous": false,
      "anycast": false,
      "hosting": false,
      "mobile": false,
      "satellite": false
    },
    "privacy": {
      "proxy": false,
      "relay": false,
      "tor": false,
      "vpn": false,
      "residentialProxy": null,
      "serviceName": null,
      "lastSeen": null,
      "percentDaysSeen": null
    },
    "carrier": {
      "name": null,
      "mcc": null,
      "mnc": null
    },
    "accuracy": {
      "radiusKm": 20,
      "geonameId": 1796236,
      "dmaCode": null,
      "geoLastChanged": "2026-07-01",
      "asnLastChanged": "2026-06-15"
    }
  },
  "location": {
    "country": "CN",
    "countryName": "中国",
    "region": "Shanghai",
    "regionCode": "SH",
    "city": "Shanghai",
    "postalCode": "200000",
    "continent": "AS",
    "continentName": "亚洲",
    "timezone": "Asia/Shanghai",
    "latitude": 31.22222,
    "longitude": 121.45806,
    "isEU": false
  },
  "connection": {
    "httpProtocol": "HTTP/3",
    "tlsVersion": "TLSv1.3",
    "tlsCipher": "AEAD-AES128-GCM-SHA256",
    "tcpRttMs": null,
    "quicRttMs": 22,
    "deliveryRateBps": 3280000
  },
  "edge": {
    "colo": "PVG",
    "rayId": "example-PVG"
  },
  "request": {
    "method": "GET",
    "scheme": "https"
  },
  "privacy": {
    "stored": false,
    "preciseLocation": false,
    "note": "IP 地理位置为网络数据库的近似结果，不代表精确住址。"
  },
  "source": ["cloudflare-edge", "ipinfo-lookup"],
  "timestamp": "2026-07-22T12:00:00.000Z"
}
```

`intelligence` 对象会固定存在：`status` 为 `available`、`not_configured` 或 `unavailable`，`tier` 为 `lookup`、`lite` 或 `null`。未启用、上游不可用、当前套餐不返回或无法确认的明细字段均为 `null`；不要把 `null` 当作否定结论。

## 苹果快捷指令

[下载并安装「查我的 IP」快捷指令](shortcuts/IP-Lens.shortcut?raw=1)

1. 先完成 Cloudflare 部署，并复制部署结果中以 `workers.dev` 结尾的网站首页地址。
2. 在 iPhone、iPad 或 Mac 上点击上方链接，下载后用“快捷指令”打开。
3. 添加快捷指令时，粘贴网站首页地址；不要填写 `/api` 路径。
4. 首次运行时允许它访问该网站。

快捷指令会自动清理地址、请求 `/api/v1/ip?format=text`，并显示完整中文 IP 信息。快捷指令本身不需要 API Key，也不读取通讯录、照片、定位或剪贴板；如果部署者启用了 IPinfo，它仍然只连接自己的 Worker，由 Worker 在后端查询。开启 VPN、iCloud 专用代理或切换蜂窝网络后，结果可能变化。

可安装文件由开源 [Cherri](https://github.com/electrikmilk/cherri) 生成，并在制作阶段通过 RoutineHub HubSign 签名；日常查询只连接你自己的 Worker，不经过签名服务。[查看可审计源码](shortcuts/IP-Lens.cherri)或[手动创建与高级用法](docs/apple-shortcuts.md)。

如果下载文件无法打开，可按照说明中的三步手动创建，功能完全相同。

## 隐私与安全边界

- 只读取 Cloudflare 提供的 `CF-Connecting-IP`，不会信任 `X-Forwarded-For`、`Forwarded` 或 `X-Real-IP`。
- 不返回 Cookie、Authorization、Referer、完整 User-Agent 或其他任意请求头。
- 默认不调用第三方 IP 服务，也不会把访客 IP 再发送给其他服务。
- 只有部署者配置 `IPINFO_TOKEN` 且未设置 `IPINFO_MODE=off` 时，Worker 才会把访客 IP 发送给 IPinfo；Token 仅用于后端 Bearer 请求，不会进入浏览器。
- IPinfo 查询失败或超时会降级使用 Cloudflare 数据；项目不主动存储第三方查询结果。
- API 默认不允许浏览器跨域读取；苹果快捷指令和命令行请求不受浏览器 CORS 限制。
- 所有访客响应禁止缓存，避免不同访客之间串号。
- 该 IP 结果仅用于展示，不能作为登录、授权、风控或计费依据。
- 项目代码不主动记录访问日志；Cloudflare 账户级别的标准分析和日志策略由部署者自行管理。

如果 Cloudflare Zone 开启了 **Pseudo IPv4**，建议选择 `Off` 或 `Add Header`，避免用伪 IPv4 覆盖真实 IPv6。

## 关于 VPN / 代理 / Tor 等网络特征

Cloudflare 基础请求元数据不能可靠给出这些结论，因此默认模式不会猜测。启用 IPinfo 后，网站只展示 IPinfo 当前套餐实际返回的特征；`false` 表示该数据源未标记，`null` 表示没有这项数据，两者都不等同于绝对安全。结果仅适合信息展示，不能替代登录验证、授权、风控或合规判断。

## 项目结构

```text
ip-checker/
├─ public/                 # 静态网页与 PWA 资源
├─ src/index.js            # Worker 路由、API 与安全响应头
├─ test/                   # Node 单元测试与模拟预览服务
├─ docs/apple-shortcuts.md # 快捷指令说明
├─ shortcuts/              # 已签名快捷指令与可审计源码
├─ wrangler.jsonc          # Cloudflare Workers 配置
└─ package.json
```

## 测试

```bash
pnpm check
pnpm test
```

测试覆盖 IPv4 / IPv6 规范化、伪造转发头、敏感头泄漏、输出格式、HEAD / OPTIONS / 405、无共享缓存和快捷指令文本返回。

## 参考

- [Cloudflare Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Cloudflare Request / `request.cf`](https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [IPinfo API 文档](https://ipinfo.io/developers)
- [IPinfo Lite API](https://ipinfo.io/developers/lite-api)
- [IPinfo 隐私检测字段](https://ipinfo.io/developers/ip-privacy-detection-api-data)
- [IPinfo 隐私政策](https://ipinfo.io/privacy-policy)
- [IPinfo 数据署名要求](https://ipinfo.io/attribution)
- [Apple：在“快捷指令”中提出第一个 API 请求](https://support.apple.com/zh-cn/guide/shortcuts/apd58d46713f/ios)
- [Apple：在 iPhone 或 iPad 上共享快捷指令](https://support.apple.com/zh-cn/guide/shortcuts/apdf01f8c054/ios)

## License

[MIT](LICENSE)
