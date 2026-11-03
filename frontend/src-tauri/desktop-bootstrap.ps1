$ErrorActionPreference = 'Stop'
# Tauri downloader timeout bo'lsa ham bir xil Microsoft bootstrapper ishlatiladi.
$desktopTools = Join-Path $env:LOCALAPPDATA 'tauri'
$desktopBootstrapCache = Join-Path $desktopTools 'MicrosoftEdgeWebview2Setup.exe'
if (-not (Test-Path -LiteralPath $desktopBootstrapCache)) {
    $desktopDownloadDir = Join-Path $PSScriptRoot 'target/tool-downloads'
    New-Item -ItemType Directory -Path $desktopDownloadDir -Force | Out-Null
    $desktopDownloadFile = Join-Path $desktopDownloadDir 'MicrosoftEdgeWebview2Setup.exe'
    & curl.exe --location --fail --show-error --silent --connect-timeout 15 --max-time 60 --retry 2 --output $desktopDownloadFile 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
    if ($LASTEXITCODE -ne 0) { throw 'Microsoft WebView2 bootstrapper yuklanmadi.' }
    $desktopSignature = Get-AuthenticodeSignature -LiteralPath $desktopDownloadFile
    if ($desktopSignature.Status -ne 'Valid' -or $desktopSignature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
        throw 'WebView2 bootstrapper imzosi tasdiqlanmadi.'
    }
    New-Item -ItemType Directory -Path $desktopTools -Force | Out-Null
    Copy-Item -LiteralPath $desktopDownloadFile -Destination $desktopBootstrapCache
}
$desktopCachedSignature = Get-AuthenticodeSignature -LiteralPath $desktopBootstrapCache
if ($desktopCachedSignature.Status -ne 'Valid' -or $desktopCachedSignature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
    throw 'Keshlangan WebView2 bootstrapper imzosi tasdiqlanmadi.'
}
