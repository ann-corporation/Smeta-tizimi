# ShNK Phase 1 (top-30, text PDFs). Default = OFFLINE dry-run (no DB, no R2). -Apply is L0-owner only.
# Prereq: uv (https://docs.astral.sh/uv/); -Inv = local private inventory folder (outside repo)
param(
  [Parameter(Mandatory)][string]$Inv,
  [string]$Root = 'D:/ShNK',
  [switch]$Apply,
  [int]$Actor = 0
)
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$req = 'scripts/normativ/requirements.txt'
$run = { param($a) uv run --no-project --with-requirements $req python @a }
$out = Join-Path $Inv 'phase1'
# K4a: manifest from inventory + top30.csv (sha256 verified against disk)
& $run @('tools/normativ-ingest/shnk_phase1.py','manifest',"$Inv\inventar.csv","$Inv\top30.csv",$Root,"$out\reviewed.json")
# STOP here: review titles/tahrir ('REVIEW' values) in reviewed.json
# K1+K4: local extraction -> ingest-queue.json (OCR not needed for text PDFs)
& $run @('tools/normativ-ingest/prepare.py',$Root,"$out\reviewed.json","$out\k4")
# K2 dry-run: objects/chunks/bytes per document
& $run @('tools/normativ-ingest/shnk_phase1.py','dryrun',"$out\k4\ingest-queue.json","$out\dryrun-plan.json")
if (-not $Apply) { Write-Host 'Dry-run done. See dryrun-plan.json. Re-run with -Apply -Actor <DB superadmin id> after owner approval.'; return }
if ($Actor -lt 1) { throw 'Actor required' }
# K2 apply (needs env R2_ACCOUNT_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY already set; never echoed)
$q = Get-Content "$out\k4\ingest-queue.json" -Raw -Encoding utf8 | ConvertFrom-Json
foreach ($i in $q) {
  uv run --no-project --with-requirements scripts/normativ/requirements.txt --with-requirements scripts/normativ/requirements-r2.txt python scripts/normativ/r2_upload.py $i.job_dir $i.source $i.title --apply --actor $Actor
}
# Then: RPC t2_normativ_holat_v1 REVIEW_REQUIRED -> INDEXED -> PUBLISHED per scripts/normativ/K2.md (owner-approved list).

