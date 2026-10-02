# Renews the PSN login that the monthly sync uses, then runs the sync at once
# so the list catches up. Run it when the game list page shows the red
# "not updated" banner. One renewal normally covers about two monthly runs.
#
# Needs the "Kopier PSN token" bookmarklet; its code is in scripts/README.md.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Opening the Sony page that holds your login token."
Write-Host "If it shows an error, log in at https://www.playstation.com first, then reload it."
Start-Process "https://ca.account.sony.com/api/v1/ssocookie"
Write-Host ""
Read-Host "Click the 'Kopier PSN token' bookmark on that page, then press Enter here"

$token = (Get-Clipboard -Raw).Trim()
if ($token.Length -ne 64) {
    Write-Host "The clipboard does not hold a 64-character token (found $($token.Length) characters). Nothing was changed."
    exit 1
}

# Piped on stdin so the token never appears on a command line or in swamp's audit log.
$token | & swamp vault put games psn-npsso --yes | Out-Null
$stored = $LASTEXITCODE
$token = $null
Set-Clipboard -Value " "
if ($stored -ne 0) { Write-Host "Storing the token failed."; exit $stored }

Write-Host "Token stored. Checking the login..."
& swamp workflow run psn-check | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "The login check failed. Run 'swamp workflow run psn-check' to see why."
    exit $LASTEXITCODE
}

Write-Host "Login works. Running the sync now so the list catches up (a few minutes)..."
& swamp workflow run monthly-sync | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. The page updates within a minute or two."
} else {
    Write-Host "The sync failed. Run 'swamp workflow run monthly-sync' to see why."
}
exit $LASTEXITCODE
