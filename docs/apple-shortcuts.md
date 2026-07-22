# 用苹果快捷指令查询 IP Lens

IP Lens 提供两种适合“快捷指令”的返回方式：

- 中文摘要：`https://你的域名/api/v1/ip?format=text`
- 详细 JSON：`https://你的域名/api/v1/ip`

不需要 API Key，也不需要添加请求头。

## 直接安装

[下载「查我的 IP」快捷指令](../shortcuts/IP-Lens.shortcut?raw=1)

1. 先复制 Cloudflare 部署结果中以 `workers.dev` 结尾的网站首页地址。
2. 点击下载链接，并用“快捷指令”打开文件。
3. 添加时粘贴网站首页地址；不要填写 `/api` 路径。
4. 首次运行时允许它访问该网站。

快捷指令会清除地址两端空格和末尾 `/`，再请求 `/api/v1/ip?format=text` 并显示结果。快捷指令的动作和生成方式见[可审计源码](../shortcuts/SOURCE.md)。

## 手动创建：显示完整中文结果

在 iPhone、iPad 或 Mac 上打开“快捷指令”，新建快捷指令并依次添加：

1. **URL**
   - 内容填写 `https://你的域名/api/v1/ip?format=text`
2. **获取 URL 内容**
   - 方法选择 `GET`
3. **显示结果**

运行后会看到类似：

```text
IP 地址：203.0.113.42
IP 版本：IPv4
位置：Shanghai · Shanghai · 中国
坐标：31.22222, 121.45806
时区：Asia/Shanghai
网络：AS4134 · CHINANET-BACKBONE
连接：HTTP/3 · TLSv1.3
往返延迟：22 ms
Cloudflare 节点：PVG
检测时间：2026-07-22T12:00:00.000Z
```

## 手动创建：只显示 IP

把 URL 改成：

```text
https://你的域名/ip
```

其他步骤保持不变。

## 高级用法：从 JSON 读取指定字段

使用 `https://你的域名/api/v1/ip`，在“获取 URL 内容”之后添加“获取词典值”。

常用键：

| 键 | 含义 |
| --- | --- |
| `ip` | 公网 IP |
| `version` | IP 版本，值为 `4` 或 `6` |
| `network` → `organization` | 网络组织 |
| `network` → `asnLabel` | AS 编号 |
| `location` → `countryName` | 国家 / 地区 |
| `location` → `city` | 城市 |
| `location` → `timezone` | 时区 |
| `edge` → `colo` | Cloudflare 边缘节点 |

对于嵌套对象，可先取 `location` 词典，再从结果中取 `city`；或在支持点路径的操作中使用 `location.city`。

## 自动化建议

- 添加到主屏幕：在快捷指令详情中选择“添加到主屏幕”。
- Siri 调用：把快捷指令命名为“查我的 IP”，即可对 Siri 说出这个名称。
- 网络切换检测：可分别在 Wi-Fi 和蜂窝网络下运行，比较 IP、ASN 与位置。
- 不要把 IP 结果当作身份验证条件；代理、NAT、蜂窝网络和 Cloudflare Worker 子请求都可能改变可见 IP。

Apple 官方说明，“获取 URL 内容”可以发起 `GET` API 请求并接收 JSON：
[在 iPhone 或 iPad 上的“快捷指令”中提出第一个 API 请求](https://support.apple.com/zh-cn/guide/shortcuts/apd58d46713f/ios)。
