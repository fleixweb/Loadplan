# 柜算网页版与桌面版发布实施计划

目标：一套 React/Vite/Worker 算法，Vercel 静态网页版及 Tauri 2 桌面版。

用户已确认：Windows x64 EXE、macOS Apple Silicon DMG、macOS Intel DMG；Mac 使用 ad-hoc 临时签名，不进行 Apple 公证。安装包发布到 fleixweb/Loadplan 的 GitHub Releases。

- [ ] 接入 Tauri Rust 主程序、最小权限、应用图标、离线 Windows WebView2 安装环境。
- [ ] 网页/桌面统一下载接口：浏览器下载或系统另存为，外链交给默认浏览器。
- [ ] Vercel 配置及 GitHub Actions 三平台构建、版本一致性校验、源码附件与 SHA256 校验文件。
- [ ] 网站提供三种下载入口，正式版本发布前不指向不存在的安装包。
- [ ] Windows 本地构建与功能检查、网页版回归；Mac 在 GitHub runner 构建并验证临时签名。
- [ ] 上传代码并运行发布工作流；使用可用 Vercel 账户完成网页部署，记录真实 URL 和阻塞条件。

不增加账号、后端或自动更新。所有发布保留 AGPL 与对应源码。桌面版安装后不依赖在线网站；公开安装包注明 Windows 未签名、Mac 未公证。报告仍保留数字表格及当前视角图片。
