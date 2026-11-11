[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('x64','arm64')][string]$Architecture,
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version = '0.1.0',
    [string]$OutputDirectory,
    [ValidatePattern('^[A-Fa-f0-9]{40}$')][string]$SigningThumbprint,
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot '..\EspDesktop.csproj'
if (!$OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot '..\..\..\dist\windows' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$publish = Join-Path ([IO.Path]::GetTempPath()) ("espdesktop-windows-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

try {
    dotnet publish $project -c Release -r "win-$Architecture" --self-contained -o $publish "-p:Version=$Version" "-p:DebugType=None"
    if ($LASTEXITCODE) { throw 'Windows publish failed.' }
    $iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
    if (!$iscc) { $iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe' }
    if (!(Test-Path $iscc)) { throw 'Install Inno Setup 6.3 or newer before building the installer.' }
    $isccArgs = @("/DProductArch=$Architecture", "/DProductVersion=$Version",
                  "/DPublishDirectory=$publish", "/DOutputDirectory=$OutputDirectory")
    if ($SigningThumbprint) {
        $sign = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
        if (!$sign) {
            $sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
            $sign = Get-ChildItem $sdk -Filter signtool.exe -Recurse -File |
                Where-Object { $_.Directory.Name -eq 'x64' } |
                Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
        }
        if (!$sign) { throw 'SignTool was not found in the Windows SDK.' }
        $exe = Join-Path $publish 'EspDesktop.exe'
        & $sign sign /fd SHA256 /td SHA256 /tr $TimestampUrl /sha1 $SigningThumbprint $exe
        if ($LASTEXITCODE) { throw 'Windows app signing failed.' }
        $signCommand = '"{0}" sign /fd SHA256 /td SHA256 /tr "{1}" /sha1 {2} $f' -f $sign, $TimestampUrl, $SigningThumbprint
        $isccArgs += '/DSignedBuild=1', "/Sespdesktop=$signCommand"
    }
    & $iscc @isccArgs (Join-Path $PSScriptRoot 'EspDesktop.iss')
    if ($LASTEXITCODE) { throw 'Installer packaging failed.' }
    if ($SigningThumbprint) {
        $installer = Join-Path $OutputDirectory "EspDesktop-Windows-$Version-$Architecture-Setup.exe"
        foreach ($file in @($exe, $installer)) {
            $signature = Get-AuthenticodeSignature $file
            if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $SigningThumbprint) {
                throw 'Windows did not verify the requested publisher signature.'
            }
        }
    }
}
finally {
    Remove-Item -LiteralPath $publish -Recurse -Force -ErrorAction SilentlyContinue
}
