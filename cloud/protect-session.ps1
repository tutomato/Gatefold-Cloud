param([ValidateSet('protect','unprotect')][string]$Operation)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $inputBytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
  $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
  if ($Operation -eq 'protect') {
    $result = [Security.Cryptography.ProtectedData]::Protect($inputBytes, $null, $scope)
  } else {
    $result = [Security.Cryptography.ProtectedData]::Unprotect($inputBytes, $null, $scope)
  }
  [Console]::Out.Write([Convert]::ToBase64String($result))
} catch { [Console]::Error.Write('Session protection failed.'); exit 1 }
