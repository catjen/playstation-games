# Run by Windows Task Scheduler on the first Thursday of the month, the day after
# the PS Plus mail, so the games claimed from it are in the library. Runs the
# monthly sync, which updates the game list page, and mails the games it added.
# A failed sync is mailed too.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
. (Join-Path $PSScriptRoot "send-mail.ps1")

& (Join-Path $PSScriptRoot "monthly-sync.ps1")
if ($LASTEXITCODE -ne 0) {
    $failed = $LASTEXITCODE
    Send-Reminder "Game list sync failed" ("The monthly sync in playstation-games failed; see .swamp/last-monthly-sync.json there. " +
        "If the PSN login expired, run scripts/renew-psn.ps1.") | Out-Null
    exit $failed
}

$mail = (& swamp data query 'behavior("gamelist") && name == "summary"' --select content --json | ConvertFrom-Json).results[0].mail
if (-not $mail) { exit 0 }
exit (Send-Reminder $mail.subject $mail.body)
