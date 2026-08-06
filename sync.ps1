# 枪械工艺 GitHub 同步脚本（提交并把干净的 gun-craft 内容推送到 Pages）
# 用法: powershell -File sync.ps1 "提交信息"
param([string]$msg = "sync: update gun-craft")
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
git add gun-craft
git commit -m $msg
git subtree split --prefix=gun-craft -b sync-gh
git push -f origin sync-gh:gh-pages
git push origin sync-gh:main
git branch -D sync-gh
Pop-Location
Write-Host "已同步到 GitHub: $msg"
