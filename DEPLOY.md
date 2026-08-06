# 部署到 GitHub Pages

## 准备

1. 在 GitHub 上创建/准备一个仓库（例如 `gun-craft`）。
2. 在本机执行一次（仓库地址替换成你的）：

```powershell
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
```

## 推送（实时同步）

以后每次修改后执行：

```powershell
powershell -File gun-craft/sync.ps1 "本次修改说明"
```

也可以在 `D:\ds4` 正常 `git commit`（在 `codex/gun-craft` 分支上），
post-commit 钩子会自动 `git push` 到 GitHub。

## 开启 Pages 托管

把游戏文件放到 Pages 要服务的根目录：

- 方式 A（推荐）：新建一个只放游戏的仓库，把 `gun-craft/index.html` 放到仓库根目录，
  推送后在仓库 Settings → Pages 选择分支为 `main`，根目录 `/`，保存即可，
  访问地址：`https://<用户名>.github.io/<仓库名>/`。
- 方式 B：用 `gh-pages` 分支。在 `D:\ds4` 执行：

```powershell
git subtree push --prefix gun-craft origin gh-pages
```

然后在 GitHub Settings → Pages 里选择 `gh-pages` 分支 + `/` 根目录。

> 注意：首次执行推送时，Windows 凭据管理器可能会弹出 GitHub 登录窗口，按提示登录一次即可。
