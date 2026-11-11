[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('x64','arm64')][string]$Architecture,
    [Parameter(Mandatory)][string]$UnsignedInstaller
)

$ErrorActionPreference = 'Stop'
if ($env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Run the signing test on a disposable GitHub-hosted Windows runner.'
}
$testDir = Join-Path $env:RUNNER_TEMP ("EspDesktopSigning-" + [guid]::NewGuid())
$installDir = Join-Path $testDir 'installed'
$uninstaller = Join-Path $installDir 'unins000.exe'
$packaging = Join-Path $PSScriptRoot '..\EspDesktop\Packaging'
$certificates = @()

New-Item -ItemType Directory -Path $testDir | Out-Null
try {
    # The local-machine store avoids a desktop confirmation dialog when a
    # self-signed certificate is added to the current user's trust store.
    Write-Host 'Creating and trusting temporary code signing certificates.'
    foreach ($publisher in @('EspDesktop CI Test', 'Other CI Publisher')) {
        $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=$publisher" `
            -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(1)
        $certificates += $cert
        $publicCert = Join-Path $testDir ($cert.Thumbprint + '.cer')
        Export-Certificate -Cert $cert -FilePath $publicCert | Out-Null
        certutil.exe -f -addstore Root $publicCert
        if ($LASTEXITCODE) { throw 'Could not trust the temporary test certificate.' }
    }

    Write-Host 'Building and installing the signed test package.'
    & (Join-Path $packaging 'Build-Installer.ps1') -Architecture $Architecture -Version '0.1.1' `
        -OutputDirectory $testDir -SigningThumbprint $certificates[0].Thumbprint -TimestampUrl ''
    $installer = Join-Path $testDir "EspDesktop-Windows-0.1.1-$Architecture-Setup.exe"
    $directoryArgument = '/DIR="' + $installDir + '"'
    $setup = Start-Process $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',$directoryArgument -Wait -PassThru
    if ($setup.ExitCode -ne 0) { throw "Signed setup exit code: $($setup.ExitCode)" }

    $otherInstaller = Join-Path $testDir 'other-publisher.exe'
    Copy-Item -LiteralPath $UnsignedInstaller -Destination $otherInstaller
    $otherSignature = Set-AuthenticodeSignature -FilePath $otherInstaller -Certificate $certificates[1] -HashAlgorithm SHA256
    if ($otherSignature.Status -ne 'Valid') { throw 'Could not create the alternate signed installer.' }

    $changedInstaller = Join-Path $testDir 'modified-setup.exe'
    Copy-Item -LiteralPath $installer -Destination $changedInstaller
    $file = [IO.File]::Open($changedInstaller, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite)
    try {
        # This byte in the PE DOS stub is covered by the Authenticode digest.
        $file.Position = 0x50
        $original = $file.ReadByte()
        if ($original -lt 0) { throw 'The installer executable is too small.' }
        $file.Position = 0x50
        $file.WriteByte([byte]($original -bxor 1))
    }
    finally { $file.Dispose() }

    Write-Host 'Checking how the updater handles each installer.'
    dotnet run -c Release --project (Join-Path $PSScriptRoot 'EspDesktop.Tests.csproj') -- `
        --verify-windows-signatures (Join-Path $installDir 'EspDesktop.exe') $installer $uninstaller `
        $UnsignedInstaller $otherInstaller $changedInstaller
    if ($LASTEXITCODE) { throw 'Windows publisher verification failed.' }
}
finally {
    try {
        if (Test-Path -LiteralPath $uninstaller) {
            $uninstall = Start-Process $uninstaller -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait -PassThru
            if ($uninstall.ExitCode -ne 0) { throw "Signed uninstall exit code: $($uninstall.ExitCode)" }
        }
    }
    finally {
        foreach ($cert in $certificates) {
            Remove-Item -LiteralPath "Cert:\LocalMachine\Root\$($cert.Thumbprint)" -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($cert.Thumbprint)" -DeleteKey -ErrorAction SilentlyContinue
        }
        Remove-Item -LiteralPath $testDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
