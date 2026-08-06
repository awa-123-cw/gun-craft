# 枪械工艺 GitHub 同步脚本
# 用法: powershell -File sync.ps1 "提交信息"
param([string]$msg = "sync: update gun-craft")
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
git add gun-craft
git commit -m $msg
git push
Pop-Location
Write-Host "已同步到 GitHub: $msg"
