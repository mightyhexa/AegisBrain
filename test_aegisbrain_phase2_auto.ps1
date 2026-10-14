$ErrorActionPreference = 'Stop'

# All paths are resolved explicitly so the CLI and API use the backend's local config.
$backend = 'C:\Users\fahad\OneDrive\Desktop\AegisBrain\aegisbrain-backend'
$python = Join-Path $backend '.venv\Scripts\python.exe'
$base = 'http://127.0.0.1:8000'

if (-not (Test-Path (Join-Path $backend 'app\main.py'))) {
    throw "Backend source not found at: $backend"
}
if (-not (Test-Path (Join-Path $backend 'app\api\v1\policy_lifecycle.py'))) {
    throw 'Phase 2 policy lifecycle route is missing from the active backend. Stop and verify the Phase 2 copy.'
}
if (-not (Test-Path $python)) {
    throw "Backend virtual-environment Python not found at: $python"
}
Set-Location $backend

function Get-HttpStatus($ErrorRecord) {
    try { return [int]$ErrorRecord.Exception.Response.StatusCode }
    catch { return 0 }
}

function Invoke-BackendCli([string[]]$Arguments) {
    $output = @(& $python -m app.cli @Arguments 2>&1 | ForEach-Object { $_.ToString() })
    $code = $LASTEXITCODE
    $text = $output -join "`n"
    if ($code -ne 0) {
        throw "Backend CLI failed (exit $code):`n$text"
    }
    return $text
}

function New-LocalApiKey([string]$Name) {
    $text = Invoke-BackendCli @(
        'create-api-key', '--tenant-id', 'demo-tenant', '--name', $Name,
        '--role', 'tenant_admin', '--expires-days', '7'
    )
    $match = [regex]::Match($text, '(?m)^API key:\s*(abk_[0-9a-f]{16}\.[A-Za-z0-9_-]{43})\s*$')
    if (-not $match.Success) {
        throw "Key creation succeeded but the one-time key could not be parsed. CLI output:`n$text"
    }
    return $match.Groups[1].Value
}

Write-Host 'AegisBrain Phase 2 lifecycle verification' -ForegroundColor Cyan
Write-Host "Backend: $backend"

# The two keys previously pasted into chat are treated as exposed. Revoke them if present
# in this database. Missing IDs are reported; nothing else is deleted.
foreach ($exposedId in @('a57d677bf5af452a', 'c5bb64eeeef2a63b')) {
    $output = @(& $python -m app.cli revoke-api-key --key-id $exposedId 2>&1 | ForEach-Object { $_.ToString() })
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Write-Host "Revoked previously exposed key ID $exposedId (or it was already revoked)." -ForegroundColor Yellow
    }
    else {
        Write-Host "Key ID $exposedId was not found/revoked in this local database; continuing with fresh keys." -ForegroundColor Yellow
    }
}

# Create keys in-memory; plaintext keys are not printed or written to disk.
$authorKey = New-LocalApiKey 'phase2-auto-author'
$reviewerKey = New-LocalApiKey 'phase2-auto-reviewer'
Write-Host 'Fresh author and reviewer credentials created locally (not displayed).' -ForegroundColor Green

# Confirm that the API currently running on port 8000 is using the same database.
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
        throw "$($entry.Name) key was created but the running API rejected it (HTTP $(Get-HttpStatus $_)). Stop FastAPI and restart it from '$backend' so CLI and API use the same .env and SQLite database. Details: $($_.ErrorDetails.Message)"
    }
}

$policyKey = "qa.policy.lifecycle.$(Get-Date -Format 'yyyyMMddHHmmssfff')"
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
} | ConvertTo-Json -Depth 10

Write-Host "`n1. Creating a draft..." -ForegroundColor Cyan
$draft = Invoke-RestMethod -Uri "$base/v1/policies/drafts" -Method Post `
    -Headers @{ Authorization = "Bearer $authorKey" } `
    -ContentType 'application/json' -Body $body
if ($draft.status -ne 'draft' -or -not $draft.id) {
    throw "Draft creation returned unexpected response: $($draft | ConvertTo-Json -Depth 6)"
}
$draftId = [int]$draft.id
Write-Host "PASS: draft id=$draftId, policy=$policyKey, status=$($draft.status)" -ForegroundColor Green

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
Write-Host 'PASS: self-approval rejected with HTTP 409.' -ForegroundColor Green

Write-Host "`n3. Locking with independent reviewer..." -ForegroundColor Cyan
$locked = Invoke-RestMethod -Uri "$base/v1/policies/drafts/$draftId/lock" -Method Post `
    -Headers @{ Authorization = "Bearer $reviewerKey" }
if ($locked.status -ne 'active') { throw "Expected active status; got '$($locked.status)'" }
if ($locked.authored_by -eq $locked.approved_by) { throw 'Author and reviewer key IDs must differ.' }
Write-Host "PASS: independent approval. author=$($locked.authored_by); reviewer=$($locked.approved_by)" -ForegroundColor Green

Write-Host "`n4. Checking version history..." -ForegroundColor Cyan
$history = Invoke-RestMethod -Uri "$base/v1/policies/history/$policyKey" -Method Get `
    -Headers @{ Authorization = "Bearer $reviewerKey" }
$history.revisions | Select-Object policy_key, version, status, authored_by, approved_by | Format-Table
if (-not $history.revisions -or $history.revisions[0].status -ne 'active') {
    throw 'Policy history does not show the new active revision first.'
}
Write-Host 'PASS: active revision appears in version history.' -ForegroundColor Green

Write-Host "`n5. Testing runtime enforcement..." -ForegroundColor Cyan
$evalBody = @{
    request_id = "qa-$([guid]::NewGuid().ToString('N'))"
    agent_id = 'qa_agent'
    action = 'orders.update_status'
    params = @{ order_id = 99123; status = 'CANCELLED' }
} | ConvertTo-Json -Depth 8
$evaluation = Invoke-RestMethod -Uri "$base/v1/evaluate" -Method Post `
    -Headers @{ Authorization = "Bearer $reviewerKey" } `
    -ContentType 'application/json' -Body $evalBody
$evaluation | Select-Object decision, policy_key, reason, audit_hash | Format-List
if ($evaluation.decision -ne 'hold' -or $evaluation.policy_key -ne $policyKey) {
    throw "Expected HOLD from '$policyKey'; got decision='$($evaluation.decision)', policy_key='$($evaluation.policy_key)'."
}
Write-Host 'PASS: runtime evaluator enforced the active custom policy.' -ForegroundColor Green

Write-Host "`n6. Verifying the policy lifecycle audit chain..." -ForegroundColor Cyan
$audit = Invoke-RestMethod -Uri "$base/v1/policies/audit/verify" -Method Get `
    -Headers @{ Authorization = "Bearer $reviewerKey" }
$audit | Format-List
if (-not $audit.valid) { throw "Policy lifecycle audit verification failed: $($audit.reason)" }
Write-Host 'PASS: policy lifecycle audit chain is valid.' -ForegroundColor Green

Write-Host "`nALL PHASE 2 LIFECYCLE CHECKS PASSED." -ForegroundColor Green
Write-Host 'Fresh key plaintext stayed in this PowerShell process and was not printed or saved.' -ForegroundColor Gray
