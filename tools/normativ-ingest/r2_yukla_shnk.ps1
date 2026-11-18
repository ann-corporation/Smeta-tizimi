<#
.SYNOPSIS
  Uploads the repacked ShNK set (shnk_repack.mjs output) and the originals to R2. DRY RUN BY DEFAULT.

.DESCRIPTION
  Reads <ReportDir>\phase3\r2v1\upload-manifest.json (key, file, sha256, bytes, kind). Every file is re-hashed before upload.
  Idempotent: a ledger <OutDir>\upload.done (lines "key<TAB>sha256") records finished objects; they are skipped.
  Order: docs bundles, index buckets, originals, corpus.json.gz LAST (the reader only activates once the corpus exists).
  Uses: npx wrangler@4 r2 object put <bucket>/<key> --file <file> --remote
  Without -DryRun:$false nothing is written anywhere; the script only prints the plan (objects, MB).

.EXAMPLE
  .\r2_yukla_shnk.ps1 -ReportDir 'D:\...\2026-11-15_SHNK_INVENTAR'                 # dry run
  .\r2_yukla_shnk.ps1 -ReportDir 'D:\...\2026-11-15_SHNK_INVENTAR' -DryRun:$false  # real upload (L0, after review)
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ReportDir,
  [string]$OutDir,
  [string]$Bucket = 'smeta-tizimi-canonical',
  [bool]$DryRun = $true,
  [ValidateSet('docs', 'index', 'original', 'corpus')][string[]]$Kinds = @('docs', 'index', 'original', 'corpus'),
  [int]$Limit = 0
)
$ErrorActionPreference = 'Stop'
if (-not $OutDir) { $OutDir = Join-Path $ReportDir 'phase3\r2v1' }
$manifestPath = Join-Path $OutDir 'upload-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "upload-manifest.json not found: $manifestPath (run shnk_repack.mjs first)" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$ledgerPath = Join-Path $OutDir 'upload.done'
$done = @{}
if (Test-Path -LiteralPath $ledgerPath) {
  foreach ($line in Get-Content -LiteralPath $ledgerPath -Encoding UTF8) {
    $parts = $line -split "`t"
    if ($parts.Count -eq 2) { $done[$parts[0]] = $parts[1] }
  }
}
$order = @{ docs = 0; index = 1; original = 2; corpus = 3 }
$objects = @($manifest.objects | Where-Object { $Kinds -contains $_.kind } | Sort-Object { $order[$_.kind] }, { $_.key })
$pending = @($objects | Where-Object { $done[$_.key] -ne $_.sha256 })
if ($Limit -gt 0) { $pending = @($pending | Select-Object -First $Limit) }

function Format-Mb([double]$bytes) { '{0:N1} MB' -f ($bytes / 1e6) }
Write-Host ("Bucket: {0}  prefix: {1}" -f $Bucket, $manifest.prefix)
foreach ($kind in $order.Keys | Sort-Object { $order[$_] }) {
  $all = @($objects | Where-Object { $_.kind -eq $kind })
  if ($all.Count -eq 0) { continue }
  $todo = @($pending | Where-Object { $_.kind -eq $kind })
  $sumAll = ($all | Measure-Object -Property bytes -Sum).Sum
  $sumTodo = ($todo | Measure-Object -Property bytes -Sum).Sum
  Write-Host ("  {0,-9} total {1,5} ({2})  to upload {3,5} ({4})" -f $kind, $all.Count, (Format-Mb $sumAll), $todo.Count, (Format-Mb $sumTodo))
}
$totalBytes = ($pending | Measure-Object -Property bytes -Sum).Sum
Write-Host ("PLAN: {0} objects, {1}; already done (ledger): {2}" -f $pending.Count, (Format-Mb $totalBytes), ($objects.Count - $pending.Count))
if ($DryRun) { Write-Host 'DRY RUN: nothing uploaded. Re-run with -DryRun:$false to upload.'; return }

$failed = 0
foreach ($o in $pending) {
  if (-not (Test-Path -LiteralPath $o.file)) { Write-Warning "missing file: $($o.key)"; $failed++; continue }
  $hash = (Get-FileHash -LiteralPath $o.file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $o.sha256) { Write-Warning "sha256 mismatch, skipped: $($o.key)"; $failed++; continue }
  $type = if ($o.key.EndsWith('.json.gz')) { 'application/gzip' } else { 'application/octet-stream' }
  # cmd /c: PS 5.1 with ErrorActionPreference=Stop treats npm/wrangler stderr warnings as fatal.
  $cmd = 'npx --yes wrangler@4 r2 object put "' + $Bucket + '/' + $o.key + '" --file "' + $o.file + '" --content-type ' + $type + ' --remote 2>&1'
  $null = cmd /c $cmd
  if ($LASTEXITCODE -ne 0) { Write-Warning "upload failed: $($o.key)"; $failed++; continue }
  Add-Content -LiteralPath $ledgerPath -Value ("{0}`t{1}" -f $o.key, $o.sha256) -Encoding UTF8
}
Write-Host ("Finished. Failed: {0}" -f $failed)
if ($failed -gt 0) { exit 1 }
