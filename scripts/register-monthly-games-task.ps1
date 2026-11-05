# Registers a Task Scheduler task that runs one of the mail scripts at 09:00 on
# the first given weekday of each month. By default: monthly-games-mail.ps1 on the
# first Wednesday, the day after Sony releases the PS Plus monthly games. The sync
# mail goes the day after:
#   pwsh -File scripts/register-monthly-games-task.ps1 -Name "playstation-games monthly-sync mail" -Script monthly-sync-mail.ps1 -Day THU
# A run missed while the machine was off starts when it is next on.
# Run once per machine, on a machine that has both the games vault (PSN login)
# and the mail-and-drive-organiser checkout with a working Hotmail sign-in.
param(
    [string]$Name = "playstation-games monthly-games mail",
    [string]$Script = "monthly-games-mail.ps1",
    [ValidateSet("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")][string]$Day = "WED"
)
$ErrorActionPreference = "Stop"
$pwsh = (Get-Command pwsh).Source
$script = Join-Path $PSScriptRoot $Script
if (-not (Test-Path $script)) { throw "No script $script" }
schtasks /Create /SC MONTHLY /MO FIRST /D $Day /ST 09:00 /TN $name /TR "`"$pwsh`" -NoProfile -File `"$script`"" /F
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Set-ScheduledTask cannot write back a first-Wednesday trigger ("The parameter
# is incorrect", 04.11.2026), so the settings go through the task's XML instead.
[xml]$xml = schtasks /Query /TN $name /XML
$settings = $xml.Task.Settings
# schtasks leaves out settings that hold their default, so add any that are missing.
foreach ($pair in @(@("StartWhenAvailable", "true"), @("DisallowStartIfOnBatteries", "false"), @("StopIfGoingOnBatteries", "false"))) {
    $node = $settings[$pair[0]]
    if (-not $node) { $node = $settings.AppendChild($xml.CreateElement($pair[0], $xml.Task.NamespaceURI)) }
    $node.InnerText = $pair[1]
}
$file = Join-Path "C:\project\temp" "monthly-games-task.xml"
New-Item -ItemType Directory -Force (Split-Path $file) | Out-Null
$xml.Save($file)
schtasks /Create /TN $name /XML $file /F
$created = $LASTEXITCODE
Remove-Item $file
if ($created -ne 0) { exit $created }
Write-Host "Next run: $((Get-ScheduledTaskInfo -TaskName $name).NextRunTime)"
