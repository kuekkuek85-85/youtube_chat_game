# Launcher helper for 생성시작.cmd: asks for the cutoff time, then runs the live generator.
Set-Location (Join-Path $PSScriptRoot "..")
$line = [Console]::In.ReadLine()
if ($null -eq $line) { $line = "" }
$line = $line.Trim()
if ($line -and $line -notmatch '^\d{1,2}:\d{2}$') {
    Write-Host "Wrong time format: $line (example: 20:40). Starting without a cutoff."
    $line = ""
}
Write-Host ""
if ($line) {
    npx tsx --env-file=.env.local scripts/live-generate.ts --until $line
} else {
    npx tsx --env-file=.env.local scripts/live-generate.ts
}
exit $LASTEXITCODE
