# 部署到 GitHub Pages

## 仓库

- 仓库：https://github.com/awa-123-cw/gun-craft
- 远端：`origin`（已配置；推送内容为干净的 gun-craft 文件，不含本地其他项目历史）
- 分支：`main`（游戏源码根目录）与 `gh-pages`（Pages 托管）

## 推送（实时同步）

以后每次修改后执行：

```powershell
powershell -File gun-craft/sync.ps1 "本次修改说明"
```

也可以在 `D:\ds4` 正常 `git commit`（在 `codex/gun-craft` 分支上），
post-commit 钩子会自动把干净的 gun-craft 内容推送到 `gh-pages` 与 `main`，
无需手动推送。

## 开启 Pages 托管

仓库已推送 `gh-pages` 分支（内容为游戏文件）。在 GitHub 仓库
Settings → Pages 里选择分支 `gh-pages` + 根目录 `/`，保存即可。

访问地址：`https://awa-123-cw.github.io/gun-craft/`

> 首次推送时，Windows 凭据管理器可能弹出 GitHub 登录窗口，按提示登录一次即可。

> 最后同步验证：2026-08-07（自动推送已生效）
