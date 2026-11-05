# Dot-sourced by the mail scripts. Sends through the Hotmail sender in the
# mail-and-drive-organiser repo next to this one, to the Hotmail account itself.
$mailRepo = Join-Path $PSScriptRoot "..\..\mail-and-drive-organiser"

function Send-Reminder($subject, $body) {
    # The address is read from the mail repo so this public repo never holds it.
    $to = (& swamp data query 'behavior("hotmail-writer") && name == "auth"' --select 'content.account' --json --repo-dir $mailRepo | ConvertFrom-Json).results[0]
    @{ to = @($to); subject = $subject; body = $body; apply = $true } | ConvertTo-Json -Compress |
        & swamp behavior run hotmail-writer send --repo-dir $mailRepo --stdin --literal-inputs | Out-Null
    return $LASTEXITCODE
}
