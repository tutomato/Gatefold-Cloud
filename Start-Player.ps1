$ErrorActionPreference = 'Stop'
try {
  # Restore this project's separate template before launching the player.
  & (Join-Path $PSScriptRoot 'Start-Cloud.ps1')
  $player = Join-Path $env:ProgramFiles 'foobar2000\foobar2000.exe'
  if (-not (Test-Path -LiteralPath $player)) { throw 'foobar2000 was not found in Program Files.' }
  Start-Process -FilePath $player
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Gatefold Cloud startup') | Out-Null
  exit 1
}
