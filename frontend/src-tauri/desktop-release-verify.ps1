[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstallerPath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string] $ExpectedSha256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string] $ApprovedSignerThumbprint
)

$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $InstallerPath
if ($file.PSIsContainer -or $file.Extension -ne '.exe' -or $file.Length -le 0) {
    throw 'WINDOWS_INSTALLER_INVALID'
}

$hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
if ($hash -ne $ExpectedSha256) { throw 'WINDOWS_INSTALLER_HASH_MISMATCH' }

$signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate) {
    throw "WINDOWS_INSTALLER_SIGNATURE_INVALID: $($signature.Status)"
}
if ($signature.SignerCertificate.Thumbprint -ne $ApprovedSignerThumbprint) {
    throw 'WINDOWS_INSTALLER_SIGNER_MISMATCH'
}
if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne $hash) {
    throw 'WINDOWS_INSTALLER_CHANGED_DURING_VERIFICATION'
}

[ordered]@{
    file = $file.Name
    bytes = $file.Length
    sha256 = $hash.ToLowerInvariant()
    signerThumbprint = $signature.SignerCertificate.Thumbprint
    signature = 'Valid'
} | ConvertTo-Json
