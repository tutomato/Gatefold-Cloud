# Gatefold Cloud

Windows 上基于 [Gatefold v1.4.5](https://github.com/DEVIROYrus/gatefold-foobar2000/releases/tag/v1.4.5) 的 foobar2000 在线音乐扩展。非网易云、腾讯或 Gatefold 官方发行版。

## 功能

- 原搜索页统一检索本地媒体库、网易云和 QQ 音乐，来源标签和关联度排序。
- 网易云官方网页登录、QQ/微信扫码登录，Windows DPAPI 加密保存会话。
- 使用当前账号可用音源，无损/320k；先查本地缓存，再下载并交给 foobar2000 播放。
- 歌曲标签、同源歌词及嵌入封面；歌手 - 歌名文件命名及重名保护。
- 设置页调整下载路径、命名和默认音质。

## 安装

需要 Windows 10/11、Node.js 22 或更新的 LTS、64 位 foobar2000、foo_ui_webview2，以及 Chrome 或 Edge（网易云网页登录）。

1. 下载本项目，保留目录位置。
2. 在 PowerShell 执行 ./Setup.ps1 -IncludeQQAdapter（见下方依赖授权说明）。
3. 双击 Start-Cloud.cmd；在 foobar2000 Preferences → Display → WebView2 UI 选择 gatefold-cloud 模板。
4. Preferences → Advanced → Tools → WebView UI 启用 Allow local network access，供主题连接本机服务。
5. 在设置 → 在线音乐与下载中配置目录；在线音乐页管理登录，顶部输入后按 Enter 搜索。

建议通过 Start-Player.ps1 启动，更新后可用 Repair-Theme.cmd 恢复模板。独占输出须自行在 foobar2000 中选择。首播完整下载后开始，再次点播命中缓存。

## 第三方依赖与许可

Gatefold 原始 MIT LICENSE 和第三方声明保留。QQ 适配依赖 [Suxiaoqinx/QQMusicapi](https://github.com/Suxiaoqinx/QQMusicapi)，其当前快照没有声明许可证，因此本仓库不分发该代码。Setup.ps1 的 IncludeQQAdapter 选项从其仓库下载固定提交到被 Git 忽略的 cloud/vendor/qqmusic。当前服务需要该适配器才能启动；安装者应自行确认其使用权限，勿将下载副本随本项目重新分发。其他依赖许可见各包；微信协议参考 L-1124/QQMusicApi，网页登录流程参考 imsyy/SPlayer。

## 隐私与限制

本机服务只监听 127.0.0.1:17863，接口使用随机连接密钥。cloud/private 与生成的 theme/js/cloud-config.js 均不提交。账号信息不应上传到 Issues、截图或日志；凭证只能由原 Windows 用户解密。非官方接口可能变化，平台仍可撤销登录。禁止绕过会员、试听、地区或平台验证。

搜索取本地最多 100 条、在线各前 30 条后排序。缓存按平台/歌曲编号/音质匹配，不自动识别其他个人文件；修改保存路径不搬动旧缓存。QQ 完整时长校验、Hi-Res 及更全面的格式支持仍待完善。旧网络播放列表不会自动迁移。

## 开发

运行 npm run check、npm run test:cloud、npm run test:ui。UI 测试采用独立无头 Chrome 和模拟原生桥，不等同于真实音频设备测试。

上游基线：v1.4.5，提交 cdd11b49d2732cbdf9c90ac135ee9ba43f233ff2。未来升级应三方合并并验证，不能直接覆盖定制主题。
