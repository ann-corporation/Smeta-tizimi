$ErrorActionPreference = 'Stop'
# Faqat ishlab chiqarish frontend build'i. Vite dev auth stub ishlatilmaydi.
$desktopFrontend = Split-Path -Parent $PSScriptRoot
Push-Location $desktopFrontend
try {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust MSVC toolchain kerak.' }
    if (-not (Test-Path -LiteralPath 'node_modules/typescript/bin/tsc')) {
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci bajarilmadi.' }
    }
    & npx --yes '@tauri-apps/cli@2.12.4' build --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw 'Windows build bajarilmadi; logni tekshiring.' }
} finally {
    Pop-Location
}
