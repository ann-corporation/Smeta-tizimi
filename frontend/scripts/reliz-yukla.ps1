# Reliz faylini R2 ga joylash (L0 qo'lda ishga tushiradi). ASCII only, PowerShell 5.1.
#   .\scripts\reliz-yukla.ps1 -Platform android -File C:\path\smeta-1.2.3-debug.apk -Signed $false -MinSdk 24
#   .\scripts\reliz-yukla.ps1 -Platform macos   -File C:\path\Smeta_1.2.3.dmg -Notarized $false
#   .\scripts\reliz-yukla.ps1 -Platform windows -File C:\path\INSTALL_RU.md   (windows .exe: desktop-release-r2.ps1 ishlating)
# -DryRun: faqat hisoblaydi va buyruqni chop etadi, hech narsa yuklamaydi.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('android', 'macos', 'windows')][string] $Platform,
    [Parameter(Mandatory)][string] $File,
    [string] $Version,
    [bool] $Signed = $false,
    [bool] $Notarized = $false,
    [int] $MinSdk = 24,
    [string] $Bucket = 'smeta-tizimi-canonical',
    [switch] $DryRun
)
$ErrorActionPreference = 'Stop'
$item = Get-Item -LiteralPath $File
if ($item.PSIsContainer) { throw 'File must be a file.' }
if (-not $Version) {
    $conf = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot '..\src-tauri\tauri.conf.json') | ConvertFrom-Json
    $Version = $conf.version
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must be x.y.z.' }
$name = $item.Name
$patterns = @{
    android = '^[\w][\w .-]*\.apk$'
    macos   = '^[\w][\w .-]*\.dmg$'
    windows = '^([\w -]+[\w .-]*\.exe|INSTALL_RU\.md)$'
}
if ($name -notmatch $patterns[$Platform] -or $name.Contains('..')) { throw "File name is not accepted for $Platform." }
$types = @{ '.apk' = 'application/vnd.android.package-archive'; '.dmg' = 'application/x-apple-diskimage'; '.exe' = 'application/vnd.microsoft.portable-executable'; '.md' = 'text/markdown; charset=utf-8' }
$contentType = $types[$item.Extension.ToLowerInvariant()]
$sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant()
if ($Platform -eq 'windows') { $key = "windows/$Version/$sha/$name" } else { $key = "reliz/$Platform/$Version/$sha/$name" }
Write-Host "R2 key: $Bucket/$key"
Write-Host "bytes:  $($item.Length)"
Write-Host "sha256: $sha"
if ($DryRun) {
    Write-Host 'Dry run: nothing uploaded.'
} else {
    # cmd /c: PowerShell 5.1 with ErrorActionPreference=Stop treats npm/wrangler stderr warnings as fatal.
    $cmd = 'npx --yes wrangler@4 r2 object put "' + $Bucket + '/' + $key + '" --file "' + $item.FullName + '" --content-type ' + $contentType + ' --remote 2>&1'
    cmd /c $cmd | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'wrangler upload failed.' }
}
$manifest = [ordered]@{
    version        = $Version
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    file           = $name
    bytes          = $item.Length
    sha256         = $sha
    signed         = $Signed
}
if ($Platform -eq 'android') { $manifest['minSdk'] = $MinSdk }
if ($Platform -eq 'macos') { $manifest['notarized'] = $Notarized }
Write-Host ''
Write-Host "Manifest input for scripts/generate-mobile-release.mjs ($Platform):"
$manifest | ConvertTo-Json
Write-Host "Public URL path: /$Platform/$Version/$sha/$([uri]::EscapeDataString($name))"
