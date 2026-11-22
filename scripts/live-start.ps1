# Launcher helper for the live character generator.
#  - 생성시작.cmd: no arguments -> asks for the cutoff time on the console.
#  - collect-forever.ps1 -GenerateUntil: opens this in its own window with -Until and -Video (no questions).
param([string]$Until = "", [string]$Video = "")
Set-Location (Join-Path $PSScriptRoot "..")
$auto = [bool]$Video.Trim()
if ($auto) {
    $Host.UI.RawUI.WindowTitle = "Character generator - do not close"
    Write-Host "============================================================"
    Write-Host "  Character generator (started by the collector)"
    Write-Host "  Every 5 minutes it makes characters for new chatters."
    Write-Host "  Cutoff: $Until   Video: $Video"
    Write-Host "  Do not close this window. Ctrl+C twice to stop."
    Write-Host "============================================================"
    $line = $Until.Trim()
} else {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { $line = "" }
    $line = $line.Trim()
}
if ($line -and $line -notmatch '^\d{1,2}:\d{2}$') {
    Write-Host "Wrong time format: $line (example: 20:40). Starting without a cutoff."
    $line = ""
}
Write-Host ""
$genArgs = @()
if ($line) { $genArgs += @("--until", $line) }
if ($auto) { $genArgs += @("--video", ($Video.Trim() -split '&')[0]) }
npx tsx --env-file=.env.local scripts/live-generate.ts @genArgs
$code = $LASTEXITCODE
if ($auto) {
    Write-Host ""
    Write-Host "Generator ended (exit $code). Press Enter to close this window."
    [void][Console]::In.ReadLine()
}
exit $code
