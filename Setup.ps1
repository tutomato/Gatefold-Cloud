# QQ protocol client is included; no external adapter is required.
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  & npm.cmd install --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Root dependency installation failed.' }
  Push-Location (Join-Path $PSScriptRoot 'cloud')
  try { & npm.cmd install --ignore-scripts; if ($LASTEXITCODE -ne 0) { throw 'Service dependency installation failed.' } } finally { Pop-Location }
  Write-Host 'Dependencies ready. Run Start-Cloud.cmd.'
} finally { Pop-Location }
