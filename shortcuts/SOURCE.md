# 「查我的 IP」快捷指令源码

`IP-Lens.cherri` 是可审计源码，`IP-Lens.shortcut` 是供 iPhone、iPad 和 Mac 安装的签名文件。

快捷指令仅执行以下操作：

1. 安装时询问一次已部署的 IP Lens 网站首页地址。
2. 清除地址两端空格和末尾 `/`。
3. 请求同一网站的 `/api/v1/ip?format=text`。
4. 直接显示服务器返回的中文 IP 详情。

它不读取通讯录、照片、定位或剪贴板，也不包含 API Key。首次运行时，苹果系统会询问是否允许访问你填写的网站。

## 重新生成

源码使用 [Cherri](https://github.com/electrikmilk/cherri) 编译。可安装的 `.shortcut` 文件必须经过 Apple 接受的签名流程；本仓库提供的文件由 Cherri 调用 RoutineHub HubSign 完成签名。HubSign 只在生成文件时接收上述快捷指令定义，不参与日常 IP 查询。

在安装了 Cherri 的环境中运行：

```bash
cherri IP-Lens.cherri --hubsign --output IP-Lens.shortcut
```

如有已登录 iCloud 的 Mac，也可使用 Apple 自带的 `shortcuts sign --mode anyone` 对未签名文件重新签名。
