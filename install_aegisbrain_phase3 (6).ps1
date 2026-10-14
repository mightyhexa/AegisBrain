$ErrorActionPreference = 'Stop'

$projectRoot = 'C:\Users\fahad\OneDrive\Desktop\AegisBrain'
$active = Join-Path $projectRoot 'aegisbrain-backend'
$downloads = Join-Path $env:USERPROFILE 'Downloads'

if (-not (Test-Path -LiteralPath (Join-Path $active 'app\main.py'))) {
    throw "Active backend not found at '$active'. No files were changed."
}
if (-not (Test-Path -LiteralPath (Join-Path $active '.venv\Scripts\python.exe'))) {
    throw "Expected virtual environment not found at '$active\.venv'. No files were changed."
}

$zip = Get-ChildItem -LiteralPath $downloads -Filter 'aegisbrain-backend-phase3-hold-approvals*.zip' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $zip) {
    throw "Phase 3 ZIP not found in Downloads. Download aegisbrain-backend-phase3-hold-approvals.zip first."
}

$extractRoot = Join-Path $env:TEMP ("aegisbrain-phase3-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
try {
    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $extractRoot -Force
    $source = Join-Path $extractRoot 'aegisbrain-backend'

    $required = @(
        'app\api\v1\holds.py',
        'app\services\holds.py',
        'app\schemas\holds.py',
        'tests\test_holds.py',
        'scripts\verify_phase3_holds.py'
    )
    foreach ($relative in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $source $relative))) {
            throw "The downloaded Phase 3 archive is missing '$relative'. No active files were changed."
        }
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $projectRoot "aegisbrain-backend-before-phase3-$stamp"
    Write-Host "Creating source backup at: $backup" -ForegroundColor Cyan
    & robocopy $active $backup /E /R:1 /W:1 /XD '.venv' '__pycache__' '.pytest_cache' /XF '.env' 'aegisbrain.db' '*.db' '*.sqlite' '*.sqlite3' | Out-Host
    $backupCode = $LASTEXITCODE
    if ($backupCode -ge 8) {
        throw "Backup failed (robocopy exit code $backupCode). Active backend was not updated."
    }

    Write-Host 'Overlaying Phase 3 code into the active backend (no files are deleted)...' -ForegroundColor Cyan
    & robocopy $source $active /E /IS /IT /R:1 /W:1 /XD '.venv' '__pycache__' '.pytest_cache' /XF '.env' 'aegisbrain.db' '*.db' '*.sqlite' '*.sqlite3' | Out-Host
    $copyCode = $LASTEXITCODE
    if ($copyCode -ge 8) {
        throw "Copy encountered an error (robocopy exit code $copyCode). Backup is preserved at '$backup'."
    }

    foreach ($relative in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $active $relative))) {
            throw "Post-copy check failed for '$relative'. Backup preserved at '$backup'."
        }
    }

    Write-Host "`nRunning tests in the active backend..." -ForegroundColor Cyan
    Push-Location $active
    try {
        & (Join-Path $active '.venv\Scripts\python.exe') -m pytest -q
        $testCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($testCode -ne 0) {
        throw "Tests failed (exit code $testCode). Backup preserved at '$backup'. Stop and share the test output."
    }

    Write-Host "`nPHASE 3 INSTALLED; TEST SUITE PASSED." -ForegroundColor Green
    Write-Host "Backup: $backup" -ForegroundColor Green
    Write-Host 'Next: restart FastAPI, then run scripts\verify_phase3_holds.py from the backend folder.' -ForegroundColor Yellow
}
finally {
    if (Test-Path -LiteralPath $extractRoot) {
        Remove-Item -LiteralPath $extractRoot -Recurse -Force
    }
}
