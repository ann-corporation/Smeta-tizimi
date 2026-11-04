[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstallerPath,
    [Parameter(Mandatory)][string] $ExpectedSha256,
    [string] $ApprovedSignerThumbprint
)

$ErrorActionPreference = 'Stop'
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'tauri.conf.json') | ConvertFrom-Json
$expectedName = "$($config.productName)_$($config.version)_x64-setup.exe"
$policy = @{ AllowUnsigned = $true }
if ($ApprovedSignerThumbprint) {
    $policy = @{ ApprovedSignerThumbprint = $ApprovedSignerThumbprint }
}
$receipt = & (Join-Path $PSScriptRoot 'desktop-release-verify.ps1') -InstallerPath $InstallerPath -ExpectedSha256 $ExpectedSha256 @policy | ConvertFrom-Json
if ($receipt.file -cne $expectedName) { throw "Expected installer filename: $expectedName" }

[ordered]@{
    version = $config.version
    arch = 'x64'
    file = $receipt.file
    bytes = $receipt.bytes
    sha256 = $receipt.sha256
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    signerThumbprint = $receipt.signerThumbprint
    signature = $receipt.signature
} | ConvertTo-Json
