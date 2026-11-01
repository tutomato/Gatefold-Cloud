$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { '' }
$runtimeFile = Join-Path $taskRoot 'cloud\private\runtime.json'
if (-not $nodeExe -and (Test-Path -LiteralPath $runtimeFile)) { $nodeExe = (Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json).nodePath }
if (-not $nodeExe -or -not (Test-Path -LiteralPath $nodeExe)) { throw 'Node.js 18+ is required.' }
$cloudDir = Join-Path $taskRoot 'cloud'
if (-not (Test-Path (Join-Path $cloudDir 'node_modules'))) { throw 'Run pnpm install --ignore-scripts in the cloud folder first.' }
$running = $false
try { $h = Invoke-RestMethod 'http://127.0.0.1:17863/health' -TimeoutSec 2; $running = $h.service -eq 'Gatefold Cloud' } catch {}
if (-not $running) {
  $logDir = Join-Path $cloudDir 'private'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $proc = Start-Process -FilePath $nodeExe -ArgumentList @(('"' + (Join-Path $cloudDir 'server.mjs') + '"')) -WorkingDirectory $cloudDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'service.log') -RedirectStandardError (Join-Path $logDir 'service-error.log')
  Set-Content -LiteralPath (Join-Path $logDir 'service.pid') -Value $proc.Id
  for ($i=0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    try { $h = Invoke-RestMethod 'http://127.0.0.1:17863/health' -TimeoutSec 1; if ($h.service -eq 'Gatefold Cloud') { $running=$true; break } } catch {}
  }
  if (-not $running) { throw 'Cloud service did not start. Check cloud/private/service.log.' }
  Set-Content -LiteralPath (Join-Path $logDir 'service.pid') -Value $proc.Id
}
$themeRoot = Join-Path $env:APPDATA 'foobar2000-v2\webview-ui'
$target = Join-Path $themeRoot 'gatefold-cloud'
if (Test-Path $target) {
  if (-not (Test-Path (Join-Path $target '.gatefold-cloud-owned'))) { throw 'Theme folder already exists and is not managed by this prototype.' }
}
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $taskRoot 'theme\*') -Destination $target -Recurse -Force
Set-Content -LiteralPath (Join-Path $target '.gatefold-cloud-owned') -Value 'Gatefold Cloud local prototype'
Write-Host 'Gatefold Cloud is ready. Existing default theme was not modified.'
Write-Host 'foobar2000: Preferences > Display > WebView2 UI > Template: gatefold-cloud > Apply.'
Write-Host 'Then select the Online Music / Chinese cloud sidebar item and scan to sign in.'
