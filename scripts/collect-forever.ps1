# Auto-restart wrapper for the chat collector. Resumes from the saved nextPageToken.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\collect-forever.ps1 [videoId or URL]
#         (no argument: reads the URL from the console - used by the double-click launcher)
#         -GenerateUntil 20:50 : also opens the live character generator in its own window for the same video,
#                                and stops collecting at that time even if the stream is still live
# Stop with Ctrl+C (twice).
# Exit codes from collect-chat.ts: 0 = finished, 2 = bad usage, 3 = fatal API error (quota/permission), 130 = Ctrl+C
param([string]$Video = "", [string]$GenerateUntil = "")

Set-Location (Join-Path $PSScriptRoot "..")

while (-not $Video.Trim()) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { Write-Host "No video URL given."; exit 2 }
    $Video = $line
}
# The "&" in "watch?v=ID&t=1" would be read as a command separator by npx (.cmd); the video ID is before it.
$Video = ($Video.Trim() -split '&')[0]
Write-Host ""
Write-Host "Video: $Video"
Write-Host ""

if ($GenerateUntil) {
    # Same video ID as the collector, so rehearsal chatters are never mixed in even before the stream starts.
    $starter = Join-Path $PSScriptRoot "live-start.ps1"
    Start-Process powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$starter`"", "-Until", $GenerateUntil, "-Video", "`"$Video`"")
    Write-Host "Character generator opened in a new window (cutoff $GenerateUntil)."
    Write-Host ""
}

# The collector stops at the same cutoff, even if the live stream keeps running afterwards.
$untilArgs = @()
if ($GenerateUntil) { $untilArgs = @("--until", $GenerateUntil) }

while ($true) {
    npx tsx --env-file=.env.local scripts/collect-chat.ts $Video @untilArgs
    $code = $LASTEXITCODE
    if ($code -eq 0) { Write-Host "Collector finished normally."; break }
    if ($code -eq 2 -or $code -eq 3 -or $code -eq 130) { Write-Host "Collector stopped (exit $code). Not restarting."; break }
    Write-Host "Restarting in 10 seconds... (Ctrl+C to stop)"
    Start-Sleep -Seconds 10
}
