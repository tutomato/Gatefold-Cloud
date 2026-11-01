param([switch]$IncludeQQAdapter)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  & npm.cmd install --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Root dependency installation failed.' }
  Push-Location (Join-Path $PSScriptRoot 'cloud')
  try { & npm.cmd install --ignore-scripts; if ($LASTEXITCODE -ne 0) { throw 'Service dependency installation failed.' } } finally { Pop-Location }
  if ($IncludeQQAdapter) {
    $revision = 'b6d748bb63fc65b6a98a383d8974fe3f3fd75d5b'
    $vendor = Join-Path $PSScriptRoot 'cloud\vendor'
    $target = Join-Path $vendor 'qqmusic'
    if (-not (Test-Path -LiteralPath $target)) {
      New-Item -ItemType Directory -Force -Path $vendor | Out-Null
      $archive = Join-Path $vendor 'qqmusic.zip'
      Invoke-WebRequest "https://codeload.github.com/Suxiaoqinx/QQMusicapi/zip/$revision" -OutFile $archive
      Expand-Archive -LiteralPath $archive -DestinationPath $vendor
      Move-Item -LiteralPath (Join-Path $vendor "QQMusicapi-$revision") -Destination $target
      Remove-Item -LiteralPath $archive
    }
  }
  if (-not (Test-Path 'cloud/vendor/qqmusic/src/client.js')) { throw 'QQ adapter is not installed. See README licensing note and -IncludeQQAdapter.' }
  Write-Host 'Dependencies ready. Run Start-Cloud.cmd.'
} finally { Pop-Location }
