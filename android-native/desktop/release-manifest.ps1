# Prepares (does NOT upload) the Windows release manifest for the QURAI MSI.
# Usage: pwsh android-native/desktop/release-manifest.ps1 -Msi <path\to\QURAI-0.2.0.msi> -Out <manifest.json>
# Next steps (manual, owner): stage the MSI + INSTALL_RU.md in R2 under windows/<version>/<sha256>/, then
#   node frontend/scripts/generate-desktop-release.mjs <manifest.json>   (writes frontend/public/desktop-release.json)
# NOTE: frontend/src/components/public-entry/desktop-release.ts currently accepts only *.exe installer names; allow *.msi there first.
param(
  [Parameter(Mandatory = $true)][string]$Msi,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'
$f = Get-Item -LiteralPath $Msi
if ($f.Extension -ne '.msi') { throw 'Expected an .msi file' }
if ($f.Name -notmatch '(\d+\.\d+\.\d+)') { throw 'Cannot read the version from the file name' }
$sig = Get-AuthenticodeSignature -LiteralPath $f.FullName
$signed = $sig.Status -eq 'Valid'
$manifest = [ordered]@{
  version          = $Matches[1]
  arch             = 'x64'
  generatedAtUtc   = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  file             = $f.Name
  bytes            = [int64]$f.Length
  sha256           = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLower()
  signature        = if ($signed) { 'Valid' } else { 'NotSigned' }
  signerThumbprint = if ($signed) { $sig.SignerCertificate.Thumbprint.ToLower() } else { $null }
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath $Out -Encoding UTF8
Write-Host "manifest written: $Out (sha256 $($manifest.sha256))"
