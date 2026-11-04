[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstallerPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256,
    [ValidatePattern('^[a-fA-F0-9]{40}$')][string] $ApprovedSignerThumbprint,
    [switch] $AllowUnsigned
)
$ErrorActionPreference = 'Stop'
if ([bool]$AllowUnsigned -eq [bool]$ApprovedSignerThumbprint) { throw 'WINDOWS_INSTALLER_SELECT_SIGNING_POLICY' }
$file = Get-Item -LiteralPath $InstallerPath
if ($file.PSIsContainer -or $file.Extension -ne '.exe' -or $file.Length -le 0) { throw 'WINDOWS_INSTALLER_INVALID' }
$hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
if ($hash -ne $ExpectedSha256) { throw 'WINDOWS_INSTALLER_HASH_MISMATCH' }
$sig = Get-AuthenticodeSignature -LiteralPath $file.FullName
if ($AllowUnsigned) {
    if ($sig.Status -ne 'NotSigned') { throw "WINDOWS_INSTALLER_EXPECTED_UNSIGNED: $($sig.Status)" }
} else {
    if ($sig.Status -ne 'Valid' -or -not $sig.SignerCertificate) { throw "WINDOWS_INSTALLER_SIGNATURE_INVALID: $($sig.Status)" }
    if ($sig.SignerCertificate.Thumbprint -ne $ApprovedSignerThumbprint) { throw 'WINDOWS_INSTALLER_SIGNER_MISMATCH' }
}
if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne $hash) { throw 'WINDOWS_INSTALLER_CHANGED_DURING_VERIFICATION' }
[ordered]@{
    file = $file.Name
    bytes = $file.Length
    sha256 = $hash.ToLowerInvariant()
    signerThumbprint = $sig.SignerCertificate.Thumbprint
    signature = [string]$sig.Status
} | ConvertTo-Json
