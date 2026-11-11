[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$AppPath,
    [Parameter(Mandatory)][string]$StartMenuLink
)

$ErrorActionPreference = 'Stop'
if ($env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Run the installed launch test on a disposable GitHub-hosted Windows runner.'
}

function Wait-SettingsVisibility([bool]$Visible) {
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        $background.Refresh()
        if ($background.HasExited) { throw 'The original EspDesktop process exited.' }
        if (($background.MainWindowHandle -ne [IntPtr]::Zero) -eq $Visible) { return }
        Start-Sleep -Milliseconds 150
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "EspDesktop Settings did not reach the expected visibility: $Visible."
}

$background = Start-Process -FilePath $AppPath -ArgumentList '--background' -PassThru
try {
    if (!$background.WaitForInputIdle(15000)) { throw 'The installed app did not finish starting.' }
    $background.Refresh()
    if ($background.HasExited -or $background.MainWindowHandle -ne [IntPtr]::Zero) {
        throw 'Launching in the background should keep Settings hidden.'
    }

    Start-Process -FilePath $StartMenuLink
    Wait-SettingsVisibility -Visible $true
    if (!$background.CloseMainWindow()) { throw 'Could not close the Settings window.' }
    Wait-SettingsVisibility -Visible $false

    Start-Process -FilePath $StartMenuLink
    Wait-SettingsVisibility -Visible $true
    Write-Host 'Verified that the installed app starts hidden, stays running when Settings closes, and reopens Settings in the original process from Start.'
}
finally {
    if (!$background.HasExited) {
        $background.Kill()
        if (!$background.WaitForExit(10000)) { throw 'The test app did not exit.' }
    }
    $background.Dispose()
}
