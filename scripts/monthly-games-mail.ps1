# Run by Windows Task Scheduler on the first Wednesday of the month, the day
# after Sony releases the PS Plus monthly games. Mails the ones not yet claimed,
# with store links, through the Hotmail sender in the mail-and-drive-organiser
# repo, to the Hotmail account itself. A failed check is mailed too, since the
# PSN login expires every 60 days and nothing else would tell.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
. (Join-Path $PSScriptRoot "send-mail.ps1")

& swamp workflow run monthly-games --json | Out-File -Encoding ascii (Join-Path ".swamp" "last-monthly-games.json")
if ($LASTEXITCODE -ne 0) {
    $failed = $LASTEXITCODE
    Send-Reminder "PS Plus check failed" ("The monthly PS Plus check in playstation-games failed. " +
        "Run 'swamp workflow run monthly-games' there to see why. If the PSN login expired, run scripts/renew-psn.ps1.") | Out-Null
    exit $failed
}

$reminder = (& swamp data query 'behavior("psn") && name == "monthly"' --select content --json | ConvertFrom-Json).results[0].reminder
if (-not $reminder) { exit 0 }
exit (Send-Reminder $reminder.subject $reminder.body)
