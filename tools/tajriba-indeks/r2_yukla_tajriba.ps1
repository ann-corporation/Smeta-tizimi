<#
.SYNOPSIS
  Uploads a LOCALLY BUILT experience index (frontend/src/lib/smeta-ai/tajriba-qur.local.test.ts output) to R2. DRY RUN BY DEFAULT.

.DESCRIPTION
  <Dir> holds the R2 tree (normativ/tajriba/v1/...). Every *.gz under it is hashed and listed; nothing is written unless -DryRun:$false.
  Idempotent: a ledger <Dir>\upload.done ("key<TAB>sha256") skips objects already uploaded with the same hash.
  Order: shards first (e/*, uzru, holat, state), manifest.json.gz files LAST (readers activate on the manifest and verify every shard).
  The private state (holat.json.gz, state.json.gz) is uploaded too: the nightly job (/api/tajriba-tick) continues incrementally from it.
  Uses: npx wrangler@4 r2 object put <bucket>/<key> --file <file> --remote.  L0 runs the real upload after review.

.EXAMPLE
  .\r2_yukla_tajriba.ps1 -Dir 'D:\...\TAJRIBA_R2_V1'                 # dry run (default)
  .\r2_yukla_tajriba.ps1 -Dir 'D:\...\TAJRIBA_R2_V1' -DryRun:$false  # real upload
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Dir,
  [string]$Bucket = 'smeta-tizimi-canonical',
  [bool]$DryRun = $true
)
$ErrorActionPreference = 'Stop'
$root = Join-Path $Dir 'normativ\tajriba\v1'
if (-not (Test-Path -LiteralPath $root)) { throw "R2 tree not found: $root" }
$ledgerPath = Join-Path $Dir 'upload.done'
$done = @{}
if (Test-Path -LiteralPath $ledgerPath) {
  foreach ($line in Get-Content -LiteralPath $ledgerPath -Encoding UTF8) { $p = $line -split "`t"; if ($p.Count -eq 2) { $done[$p[0]] = $p[1] } }
}
$base = (Resolve-Path -LiteralPath $Dir).Path.TrimEnd('\')
$objects = foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.gz') {
  $key = $f.FullName.Substring($base.Length + 1).Replace('\', '/')
  [pscustomobject]@{ key = $key; file = $f.FullName; bytes = $f.Length; sha256 = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); last = $key.EndsWith('manifest.json.gz') }
}
$objects = @($objects | Sort-Object @{ e = { $_.last } }, key)
$pending = @($objects | Where-Object { $done[$_.key] -ne $_.sha256 })
Write-Host ("Bucket: {0}" -f $Bucket)
Write-Host ("PLAN: {0} objects, {1:N1} KB; already done (ledger): {2}" -f $pending.Count, (($pending | Measure-Object -Property bytes -Sum).Sum / 1e3), ($objects.Count - $pending.Count))
$pending | ForEach-Object { Write-Host ("  {0,8} B  {1}" -f $_.bytes, $_.key) }
if ($DryRun) { Write-Host 'DRY RUN: nothing uploaded. Re-run with -DryRun:$false to upload.'; return }

$failed = 0
foreach ($o in $pending) {
  # cmd /c: PS 5.1 with ErrorActionPreference=Stop treats npm/wrangler stderr warnings as fatal.
  $cmd = 'npx --yes wrangler@4 r2 object put "' + $Bucket + '/' + $o.key + '" --file "' + $o.file + '" --content-type application/gzip --remote 2>&1'
  $null = cmd /c $cmd
  if ($LASTEXITCODE -ne 0) { Write-Warning "upload failed: $($o.key)"; $failed++; continue }
  Add-Content -LiteralPath $ledgerPath -Value ("{0}`t{1}" -f $o.key, $o.sha256) -Encoding UTF8
}
Write-Host ("Finished. Failed: {0}" -f $failed)
if ($failed -gt 0) { exit 1 }
