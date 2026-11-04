[CmdletBinding()]
param(
    [Parameter(Position=0)][ValidateSet('stats','online','offline','abort','revoke')][string]$Action='stats',
    [ValidateSet(1,2)][int]$Actor=1
)
$ErrorActionPreference='Stop'
$localM5Origin='http://127.0.0.1:5214'
if($Action -eq 'stats') {
    Invoke-RestMethod -Uri "$localM5Origin/_test/stats" -TimeoutSec 5
    return
}
$localM5Body = if($Action -eq 'revoke') { @{actor=$Actor} } else { @{mode=(@{online='online';offline='503';abort='abort'})[$Action]} }
$localM5Endpoint = if($Action -eq 'revoke') {'revoke'} else {'offline'}
Invoke-RestMethod -Uri "$localM5Origin/_test/$localM5Endpoint" -Method Post -Headers @{'X-M5-Control'='local-synthetic'} -ContentType 'application/json' -Body ($localM5Body | ConvertTo-Json -Compress) -TimeoutSec 5
