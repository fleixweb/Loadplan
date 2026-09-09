# 网页版与单机版发布

代码仓库： https://github.com/fleixweb/Loadplan

网页版： https://loadplan-fleix.vercel.app

首版 v0.2.0： https://github.com/fleixweb/Loadplan/releases/tag/v0.2.0

## 网页版

Vercel 导入该仓库，框架选择 Vite，构建命令 `npm run build`，输出目录 `dist`。仓库已有 `vercel.json`，无需数据库或环境密钥。发布时必须包含源码包与许可文件。下载页读取 GitHub 最新正式 Release 的三个固定名称附件，未发布时显示等待发布，不提供失效的下载链接。

下载页使用 `public/release.json` 保存最近一次已验证发布记录，在 GitHub API 无法访问时仍提供下载；发布新版后可同步该文件。当前 Vercel CLI 部署已成功，但 GitHub 自动关联需要在 Vercel 项目 Git 设置中授权连接，尚未启用自动网页部署。

## 桌面开发与构建

安装 Node.js 22、Rust stable；Windows 还需要 MSVC C++ 构建工具与 Windows SDK，macOS 需要 Xcode command line tools。终端执行：

```
npm ci
npm run desktop:dev
npm run desktop:build -- --bundles nsis
```

最后一条仅用于 Windows。Mac 通过 GitHub workflow 构建。桌面版使用系统 WebView，窗口名称为“柜算 LOADPLAN”；数据与计算在本机进行，文件保存使用系统另存为窗口，取消保存不会提示成功。Windows 安装包带 WebView2 离线安装器。用户无需安装开发依赖。

## 发布三种安装包

同步 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的版本，提交 Cargo.lock 与 package-lock.json。

推送形如 `v0.2.0` 的标签，或在 GitHub Actions 手动运行 `Build desktop release`。三个矩阵任务全部通过后才创建 Release，包含：

- `Loadplan-Windows-x64.exe`
- `Loadplan-macOS-Apple-Silicon.dmg`
- `Loadplan-macOS-Intel.dmg`
- `Loadplan-source.zip`、协议、第三方声明、SHA256SUMS.txt

Mac 使用 `signingIdentity: "-"` 临时签名，不需要 Apple 账户，但没有 Apple 公证。runner 会验证生成的 .app 签名。首次安装说明见 release-notes.md。不提供自动更新，用户下载新版覆盖安装。

版本号不可复用覆盖已有正式 Release；修改后发布新版本。GitHub token 由 Actions 自动提供，权限仅在发布任务为 contents:write，不将账户凭据提交到仓库。
