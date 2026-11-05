[CmdletBinding()]
param(
    [Parameter(Position=0)][ValidateSet('stats','online','offline','abort')][string]$Action='stats'
)
$ErrorActionPreference='Stop'
$localM5Port=if($env:SMETA_M5_PORT){$env:SMETA_M5_PORT}else{'5216'}
$localM5Origin="http://127.0.0.1:$localM5Port"
if($Action -eq 'stats') {
    Invoke-RestMethod -Uri "$localM5Origin/_test/stats" -TimeoutSec 5
    return
}
Invoke-RestMethod -Uri "$localM5Origin/_test/offline" -Method Post -Headers @{'X-M5-Control'='local-synthetic'} -ContentType 'application/json' -Body (@{mode=(@{online='online';offline='503';abort='abort'})[$Action]} | ConvertTo-Json -Compress) -TimeoutSec 5
