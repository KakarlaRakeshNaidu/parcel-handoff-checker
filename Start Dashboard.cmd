@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "$parcelNode = (Get-Command node -ErrorAction SilentlyContinue).Source; if (-not $parcelNode) { $parcelRuntime = Get-AppxPackage -Name '*CodexPrimaryRuntime*' | Select-Object -First 1; if ($parcelRuntime) { $parcelNode = Join-Path $parcelRuntime.InstallLocation 'dependencies\node\bin\node.exe' } }; if (-not $parcelNode -or -not (Test-Path -LiteralPath $parcelNode)) { Write-Host 'Install Node.js LTS from https://nodejs.org and reopen this launcher.'; exit 1 }; & $parcelNode server.mjs --open"
pause
