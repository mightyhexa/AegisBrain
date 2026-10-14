$ErrorActionPreference = 'Stop'
$backend = 'C:\Users\fahad\OneDrive\Desktop\AegisBrain\aegisbrain-backend'
$base = 'http://127.0.0.1:8000'

if (-not (Test-Path (Join-Path $backend 'app\main.py'))) {
    throw "Backend not found at $backend. Update the `$backend path in this script before running."
}
Set-Location $backend

function Read-ApiToken([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-HttpStatus($ErrorRecord) {
    try { return [int]$ErrorRecord.Exception.Response.StatusCode }
    catch { return 0 }
}

$authorKey = Read-ApiToken 'Paste AUTHOR API key (input hidden)'
$reviewerKey = Read-ApiToken 'Paste REVIEWER API key (input hidden)'
if ([string]::IsNullOrWhiteSpace($authorKey) -or [string]::IsNullOrWhiteSpace($reviewerKey)) {
    throw 'Both API keys are required.'
}

# Verify both credentials against this exact running API/database before writes.
foreach ($entry in @(
    @{ Name = 'AUTHOR'; Key = $authorKey },
    @{ Name = 'REVIEWER'; Key = $reviewerKey }
)) {
    try {
        $null = Invoke-RestMethod -Uri "$base/v1/policies/drafts" -Method Get `
            -Headers @{ Authorization = "Bearer $($entry.Key)" } -ErrorAction Stop
        Write-Host "$($entry.Name): authentication OK" -ForegroundColor Green
    }
    catch {
        throw "$($entry.Name) authentication failed (HTTP $(Get-HttpStatus $_)). Make sure both keys were created from the active backend folder and the server was restarted from that same folder. Response: $($_.ErrorDetails.Message)"
    }
}

$policyKey = "qa.policy.lifecycle.$(Get-Date -Format 'yyyyMMddHHmmss')"
$body = @{
    policy_key = $policyKey
    action = 'orders.update_status'
    effect = 'HOLD'
    priority = 50
    conditions = @(@{ field = 'status'; operator = '=='; value = 'CANCELLED' })
    summary = 'Cancelled order updates require review'
    reason = 'A cancelled order must be reviewed before its status changes.'
    source_channel = '#qa-test'
    source_message_id = $null
    source_text = 'Local test fixture; not a real Slack message.'
} | ConvertTo-Json -Depth 8

Write-Host "`n1. Creating a draft..." -ForegroundColor Cyan
$draft = Invoke-RestMethod -Uri "$base/v1/policies/drafts" -Method Post `
    -Headers @{ Authorization = "Bearer $authorKey" } -ContentType 'application/json' -Body $body
if ($draft.status -ne 'draft' -or -not $draft.id) { throw "Draft creation returned unexpected response: $($draft | ConvertTo-Json -Depth 5)" }
$draftId = [int]$draft.id
Write-Host "Draft created: id=$draftId, status=$($draft.status), policy=$policyKey" -ForegroundColor Green

Write-Host "`n2. Confirming self-approval is blocked..." -ForegroundColor Cyan
$selfAccepted = $false
$selfStatus = 0
try {
    $null = Invoke-RestMethod -Uri "$base/v1/policies/drafts/$draftId/lock" -Method Post `
        -Headers @{ Authorization = "Bearer $authorKey" } -ErrorAction Stop
    $selfAccepted = $true
}
catch { $selfStatus = Get-HttpStatus $_ }
if ($selfAccepted) { throw 'SECURITY FAILURE: author was allowed to approve their own draft.' }
if ($selfStatus -ne 409) { throw "Expected HTTP 409 for self-approval; received HTTP $selfStatus." }
Write-Host 'Self-approval correctly rejected (HTTP 409).' -ForegroundColor Green

Write-Host "`n3. Locking with a different tenant_admin key..." -ForegroundColor Cyan
$locked = Invoke-RestMethod -Uri "$base/v1/policies/drafts/$draftId/lock" -Method Post `
    -Headers @{ Authorization = "Bearer $reviewerKey" }
if ($locked.status -ne 'active') { throw "Expected active status after review; got '$($locked.status)'" }
if ($locked.authored_by -eq $locked.approved_by) { throw 'Author and reviewer key IDs must differ.' }
Write-Host "Independent approval passed. author=$($locked.authored_by); reviewer=$($locked.approved_by)" -ForegroundColor Green

Write-Host "`n4. Checking version history..." -ForegroundColor Cyan
$history = Invoke-RestMethod -Uri "$base/v1/policies/history/$policyKey" -Method Get `
    -Headers @{ Authorization = "Bearer $reviewerKey" }
$history.revisions | Select-Object policy_key, version, status, authored_by, approved_by | Format-Table
if (-not $history.revisions -or $history.revisions[0].status -ne 'active') { throw 'Policy history does not show the new active revision.' }

Write-Host "`n5. Testing runtime enforcement..." -ForegroundColor Cyan
$evalBody = @{
    request_id = "qa-$([guid]::NewGuid().ToString('N'))"
    agent_id = 'qa_agent'
    action = 'orders.update_status'
    params = @{ order_id = 99123; status = 'CANCELLED' }
} | ConvertTo-Json -Depth 8
$evaluation = Invoke-RestMethod -Uri "$base/v1/evaluate" -Method Post `
    -Headers @{ Authorization = "Bearer $reviewerKey" } -ContentType 'application/json' -Body $evalBody
$evaluation | Select-Object decision, policy_key, reason, audit_hash | Format-List
if ($evaluation.decision -ne 'hold' -or $evaluation.policy_key -ne $policyKey) {
    throw "Expected HOLD from '$policyKey'; got decision='$($evaluation.decision)', policy_key='$($evaluation.policy_key)'."
}

Write-Host "`n6. Verifying policy lifecycle audit chain..." -ForegroundColor Cyan
$audit = Invoke-RestMethod -Uri "$base/v1/policies/audit/verify" -Method Get `
    -Headers @{ Authorization = "Bearer $reviewerKey" }
$audit | Format-List
if (-not $audit.valid) { throw "Policy lifecycle audit chain verification failed: $($audit.reason)" }

Write-Host "`nALL PHASE 2 LIFECYCLE CHECKS PASSED." -ForegroundColor Green
