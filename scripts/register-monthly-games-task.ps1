# Registers the Task Scheduler task that runs monthly-games-mail.ps1 at 09:00 on
# the first Wednesday of each month, the day after Sony releases the PS Plus
# monthly games. A run missed while the machine was off starts when it is next on.
# Run once per machine, on a machine that has both the games vault (PSN login)
# and the mail-and-drive-organiser checkout with a working Hotmail sign-in.
$ErrorActionPreference = "Stop"
$name = "playstation-games monthly-games mail"
$pwsh = (Get-Command pwsh).Source
$script = Join-Path $PSScriptRoot "monthly-games-mail.ps1"
schtasks /Create /SC MONTHLY /MO FIRST /D WED /ST 09:00 /TN $name /TR "`"$pwsh`" -NoProfile -File `"$script`"" /F
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$task = Get-ScheduledTask -TaskName $name
$task.Settings.StartWhenAvailable = $true
$task.Settings.DisallowStartIfOnBatteries = $false
$task.Settings.StopIfGoingOnBatteries = $false
Set-ScheduledTask -InputObject $task | Out-Null
Write-Host "Next run: $((Get-ScheduledTaskInfo -TaskName $name).NextRunTime)"
