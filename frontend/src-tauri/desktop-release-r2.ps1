[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string] $ReleaseDir,
    [switch] $Upload,
    [ValidatePattern('^[a-fA-F0-9]{40}$')][string] $ApprovedSignerThumbprint
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $ReleaseDir 'installer-manifest.json'
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'tauri.conf.json') | ConvertFrom-Json
$expectedName = "$($config.productName)_$($config.version)_x64-setup.exe"
if ($manifest.file -cne $expectedName) { throw 'Unexpected installer filename in manifest.' }
$installerPath = Join-Path $ReleaseDir $expectedName
$verified = & (Join-Path $PSScriptRoot 'desktop-release-manifest.ps1') -InstallerPath $installerPath -ExpectedSha256 $manifest.sha256 -ApprovedSignerThumbprint $ApprovedSignerThumbprint | ConvertFrom-Json
foreach ($field in 'version', 'arch', 'file', 'bytes', 'sha256', 'signature', 'signerThumbprint') {
    if ($manifest.$field -cne $verified.$field) { throw "Manifest mismatch: $field" }
}
if (-not $manifest.generatedAtUtc) { throw 'Missing manifest generation date.' }

$guidePath = Join-Path $ReleaseDir 'INSTALL_RU.md'
if (-not (Test-Path -LiteralPath $guidePath -PathType Leaf)) { throw 'INSTALL_RU.md is missing.' }

# Put the manifest last so a new release only advertises files already present.
$prefix = "windows/$($verified.version)/$($verified.sha256)"
foreach ($name in $verified.file, 'INSTALL_RU.md', 'installer-manifest.json') {
    Write-Host "R2 object: $prefix/$name"
}
if (-not $Upload) {
    Write-Host 'Dry run: local verification passed. No network requests.'
    return
}
if ($env:R2_ACCOUNT_ID -notmatch '^[0-9a-fA-F]{32}$' -or $env:R2_BUCKET -notmatch '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$') {
    throw 'Set R2_ACCOUNT_ID and R2_BUCKET.'
}
if (-not $env:AWS_ACCESS_KEY_ID -or -not $env:AWS_SECRET_ACCESS_KEY) {
    throw 'Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.'
}
if (-not $PSCmdlet.ShouldProcess("$env:R2_BUCKET/$prefix", 'Upload Windows release to R2')) { return }
$aws = Get-Command aws -CommandType Application
$endpoint = "https://$env:R2_ACCOUNT_ID.r2.cloudflarestorage.com"
foreach ($path in $installerPath, $guidePath, $manifestPath) {
    $file = Get-Item -LiteralPath $path
    & $aws.Source s3 cp $file.FullName "s3://$env:R2_BUCKET/$prefix/$($file.Name)" --endpoint-url $endpoint --region auto --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "R2 upload failed: $($file.Name)" }
}
