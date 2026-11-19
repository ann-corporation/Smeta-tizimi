# PoC: SAYTNING AYNAN O'ZI (frontend build) Windows qobig'ida lokal assetlardan ochiladi; /api so'rovlari Rust orqali serverga ketadi.
# Mavjud "local-bff" rejimidan foydalanadi (src/desktop + src-tauri). Imzo kaliti FAQAT PoC uchun tasodifiy: oflayn lease tasdiqlanmaydi.
# Ishlatish (frontend papkasidan):  powershell -File src-tauri/poc/build-poc.ps1 [-Origin https://qurai.uz]
param([string] $Origin = 'https://qurai.uz')
$ErrorActionPreference = 'Stop'
if ($Origin -notmatch '\Ahttps://') { throw 'Origin HTTPS bo''lishi kerak.' }
if (-not (Test-Path node_modules)) { npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm ci' } }
do {
  $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $pk = [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_')
} until ($pk -cmatch '\A[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]\z')
$env:VITE_DESKTOP_LEASE_PK = $pk; $env:VITE_DESKTOP_LEASE_KID = 'poc'
$env:SMETA_DESKTOP_BFF_ORIGIN = $Origin
$env:NODE_OPTIONS = '--max-old-space-size=8192'
$sw = [Diagnostics.Stopwatch]::StartNew()
npx --yes '@tauri-apps/cli@2.12.4' build --no-bundle --features local-bff --config src-tauri/tauri.local-bff.conf.json
if ($LASTEXITCODE) { throw 'tauri build' }
"BUILD_SECONDS=$([int]$sw.Elapsed.TotalSeconds)"
Get-Item src-tauri/target/release/smeta-desktop.exe | Select-Object FullName, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
