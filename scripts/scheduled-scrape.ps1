# Transparent Domain — Scheduled Daily Scrape
# Designed for Windows Task Scheduler
# Logs output to logs/scrape-*.txt

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Resolve-Path "$ScriptDir\.."
$Timestamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$LogDir = "$ProjectDir\logs"
$LogFile = "$LogDir\scrape-$Timestamp.txt"

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

Set-Location $ProjectDir

$header = @"
=== Transparent Domain — Scheduled Scrape ===
Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Project: $ProjectDir
==============================================

"@

Write-Output $header | Tee-Object -FilePath $LogFile

try {
    # Check that Next.js server is reachable
    $healthUrl = "http://localhost:3000/api/admin/scraping/stats"
    try {
        $null = Invoke-WebRequest -Uri $healthUrl -Method GET -TimeoutSec 10 -UseBasicParsing
    } catch {
        Write-Output "WARNING: Next.js server at http://localhost:3000 is not reachable." | Tee-Object -FilePath $LogFile -Append
        Write-Output "Make sure the server is running with: npm run dev" | Tee-Object -FilePath $LogFile -Append
        Write-Output "" | Tee-Object -FilePath $LogFile -Append
    }

    # Run the scrape
    npx tsx scripts/run-scrape.ts 2>&1 | Tee-Object -FilePath $LogFile -Append

    if ($LASTEXITCODE -ne 0) {
        Write-Output "" | Tee-Object -FilePath $LogFile -Append
        Write-Output "ERROR: Scrape failed with exit code $LASTEXITCODE" | Tee-Object -FilePath $LogFile -Append
    }
} catch {
    Write-Output "FATAL ERROR: $_" | Tee-Object -FilePath $LogFile -Append
}

Write-Output "" | Tee-Object -FilePath $LogFile -Append
Write-Output "Finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Tee-Object -FilePath $LogFile -Append
