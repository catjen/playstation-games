# Run by Windows Task Scheduler once a month. The exit code is the workflow's,
# so the task's "Last Run Result" shows whether the sync worked.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
& swamp workflow run monthly-sync --json | Out-File -Encoding ascii (Join-Path ".swamp" "last-monthly-sync.json")
exit $LASTEXITCODE
