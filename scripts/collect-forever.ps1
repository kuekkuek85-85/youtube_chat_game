# Auto-restart wrapper for the chat collector. Resumes from the saved nextPageToken.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\collect-forever.ps1 <videoId or URL>
# Stop with Ctrl+C (twice).
# Exit codes from collect-chat.ts: 0 = finished, 2 = bad usage, 3 = fatal API error (quota/permission), 130 = Ctrl+C
param([Parameter(Mandatory = $true)][string]$Video)

Set-Location (Join-Path $PSScriptRoot "..")
while ($true) {
    npx tsx --env-file=.env.local scripts/collect-chat.ts $Video
    $code = $LASTEXITCODE
    if ($code -eq 0) { Write-Host "Collector finished normally."; break }
    if ($code -eq 2 -or $code -eq 3 -or $code -eq 130) { Write-Host "Collector stopped (exit $code). Not restarting."; break }
    Write-Host "Collector crashed (exit $code). Restarting in 10 seconds... (Ctrl+C to stop)"
    Start-Sleep -Seconds 10
}
