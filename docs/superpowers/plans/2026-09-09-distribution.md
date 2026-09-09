# 柜算网页版与桌面版发布实施计划

目标：一套 React/Vite/Worker 算法，Vercel 静态网页版及 Tauri 2 桌面版。

用户已确认：Windows x64 EXE、macOS Apple Silicon DMG、macOS Intel DMG；Mac 使用 ad-hoc 临时签名，不进行 Apple 公证。安装包发布到 fleixweb/Loadplan 的 GitHub Releases。

- [x] 接入 Tauri Rust 主程序、最小权限、应用图标、离线 Windows WebView2 安装环境。
- [x] 网页/桌面统一下载接口：浏览器下载或系统另存为，外链交给默认浏览器。
- [x] Vercel 配置及 GitHub Actions 三平台构建、版本一致性校验、源码附件与 SHA256 校验文件。
- [x] 网站提供三种下载入口，正式版本发布前不指向不存在的安装包。
- [x] Windows 本地构建与启动、3D、保存窗口检查；网页版 73 项单元测试及导出测试通过；Mac 在 GitHub runner 构建并验证 DMG 内应用临时签名。Mac 未进行人工实机测试。
- [x] 上传代码并发布 v0.2.0；网页版 https://loadplan-seven.vercel.app ，Release https://github.com/fleixweb/Loadplan/releases/tag/v0.2.0 。Vercel GitHub 自动关联被服务端拒绝，目前采用 CLI 部署，用户可在项目 Git 设置授权连接。

不增加账号、后端或自动更新。所有发布保留 AGPL 与对应源码。桌面版安装后不依赖在线网站；公开安装包注明 Windows 未签名、Mac 未公证。报告仍保留数字表格及当前视角图片。
