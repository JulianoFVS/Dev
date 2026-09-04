# Captura a landing em execução no dev server, com o consentimento de cookies
# já registrado (via public/assets/dev-seed.html) para o banner não cobrir o layout.
param(
    [int]$Width = 1440,
    [int]$Height = 960,
    [string]$Out = "D:\Dev\ortus\.tmp-shots\landing.png"
)

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP "ortus-shot-profile"

New-Item -ItemType Directory -Force -Path (Split-Path $Out) | Out-Null

& $edge --headless=new --disable-gpu --hide-scrollbars `
    --user-data-dir="$profile" `
    --virtual-time-budget=9000 `
    --window-size="$Width,$Height" `
    --screenshot="$Out" `
    "http://localhost:3000/assets/dev-seed.html" 2>&1 | Out-Null

Get-Item $Out | Select-Object Name, Length, LastWriteTime
