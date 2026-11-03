[CmdletBinding()]
param(
    [string] $ReleaseDir,
    [ValidatePattern('^[a-fA-F0-9]{40}$')][string] $SignerThumbprint
)

$ErrorActionPreference = 'Stop'
if ($SignerThumbprint -and -not $ReleaseDir) { throw 'Signing requires -ReleaseDir.' }
if ($ReleaseDir) {
    $ReleaseDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReleaseDir)
    if (Test-Path -LiteralPath $ReleaseDir) { throw 'Use a new release directory.' }
}
if ($SignerThumbprint) {
    $signTool = Get-Command signtool.exe -CommandType Application
    if ($env:SMETA_SIGN_TIMESTAMP_URL -notmatch '^https://[^\s]+$') {
        throw 'Set SMETA_SIGN_TIMESTAMP_URL to the approved HTTPS timestamp endpoint.'
    }
}

$desktopFrontend = Split-Path -Parent $PSScriptRoot
$target = 'x86_64-pc-windows-msvc'
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'tauri.conf.json') | ConvertFrom-Json
$name = "$($config.productName)_$($config.version)_x64-setup.exe"
$previousTargetDir = $env:CARGO_TARGET_DIR
$env:CARGO_TARGET_DIR = Join-Path $PSScriptRoot 'target'
$installer = Join-Path $env:CARGO_TARGET_DIR "$target/release/bundle/nsis/$name"

Push-Location $desktopFrontend
try {
    & (Join-Path $PSScriptRoot 'desktop-bootstrap.ps1')
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust MSVC toolchain is required.' }
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    if (Test-Path -LiteralPath $installer) { Remove-Item -LiteralPath $installer }
    & npx.cmd --yes '@tauri-apps/cli@2.12.4' build --target $target --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }

    $file = Get-Item -LiteralPath $installer
    if ($SignerThumbprint) {
        & $signTool.Source sign /sha1 $SignerThumbprint /fd SHA256 /tr $env:SMETA_SIGN_TIMESTAMP_URL /td SHA256 $file.FullName
        if ($LASTEXITCODE -ne 0) { throw 'SignTool failed.' }
    }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    $manifest = & (Join-Path $PSScriptRoot 'desktop-release-manifest.ps1') -InstallerPath $file.FullName -ExpectedSha256 $hash -ApprovedSignerThumbprint $SignerThumbprint

    if ($ReleaseDir) {
        New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
        Copy-Item -LiteralPath $file.FullName, (Join-Path $PSScriptRoot 'INSTALL_RU.md') -Destination $ReleaseDir
        $stagedInstaller = Join-Path $ReleaseDir $name
        if ((Get-FileHash -LiteralPath $stagedInstaller -Algorithm SHA256).Hash -ne $hash) {
            throw 'Staged installer hash mismatch.'
        }
        [IO.File]::WriteAllText((Join-Path $ReleaseDir 'installer-manifest.json'), $manifest)
    }
    $manifest
} finally {
    Pop-Location
    $env:CARGO_TARGET_DIR = $previousTargetDir
}
