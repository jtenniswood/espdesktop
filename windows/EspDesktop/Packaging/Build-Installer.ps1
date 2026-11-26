[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('x64','arm64')][string]$Architecture,
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version = '0.1.0',
    [string]$OutputDirectory,
    [ValidatePattern('^[A-Fa-f0-9]{40}$')][string]$SigningThumbprint,
    [switch]$RequireSigning,
    [ValidatePattern('^(?:https?://[^\s"$]+)?$')][string]$TimestampUrl = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'
if (!$SigningThumbprint -and $env:ESPDESKTOP_WINDOWS_SIGNING_THUMBPRINT) {
    $SigningThumbprint = $env:ESPDESKTOP_WINDOWS_SIGNING_THUMBPRINT
}
if ($RequireSigning -and !$SigningThumbprint) {
    throw 'Set ESPDESKTOP_WINDOWS_SIGNING_THUMBPRINT or pass -SigningThumbprint to build a signed installer.'
}
if ($SigningThumbprint) {
    $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$SigningThumbprint" -ErrorAction SilentlyContinue
    if (!$certificate -or !$certificate.HasPrivateKey) {
        throw 'The selected code-signing certificate and its private key must be available under Current User > Personal.'
    }
    $sign = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
    if (!$sign) {
        $sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
        $sign = Get-ChildItem $sdk -Filter signtool.exe -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Directory.Name -eq 'x64' -and $_.Directory.Parent.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
            Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
            Select-Object -First 1 -ExpandProperty FullName
    }
    if (!$sign) { throw 'Install SignTool from the Windows SDK or put signtool.exe on PATH.' }
}

$project = Join-Path $PSScriptRoot '..\EspDesktop.csproj'
$repo = Join-Path $PSScriptRoot '..\..\..'
if (!$OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot '..\..\..\dist\windows' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$build = Join-Path $tempRoot ("espdesktop-windows-" + [guid]::NewGuid())
$publish = Join-Path $build 'app'
$staged = Join-Path $build 'installer'
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $staged -Force | Out-Null

try {
    $assetBuild = Join-Path $build 'editor'
    python -X utf8 (Join-Path $repo 'scripts/build.py') www --temporary-output $assetBuild
    if ($LASTEXITCODE) { throw 'USB editor build failed. Run npm ci from the repository root before building the installer.' }
    $asset = Join-Path $assetBuild 'embedded/www.js'
    if (!(Test-Path -LiteralPath $asset -PathType Leaf)) { throw 'The USB editor bundle was not generated.' }
    dotnet publish $project -c Release -r "win-$Architecture" --self-contained -o $publish "-p:Version=$Version" "-p:DebugType=None" "-p:UsbEditorAsset=$asset"
    if ($LASTEXITCODE) { throw 'Windows publish failed.' }
    $iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
    if (!$iscc) { $iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe' }
    if (!(Test-Path $iscc)) { throw 'Install Inno Setup 6.3 or newer before building the installer.' }
    $isccArgs = @("/DProductArch=$Architecture", "/DProductVersion=$Version",
                  "/DPublishDirectory=$publish", "/DOutputDirectory=$staged")
    if ($SigningThumbprint) {
        $exe = Join-Path $publish 'EspDesktop.exe'
        $timestampArgs = @()
        $timestampCommand = ''
        if ($TimestampUrl) {
            $timestampArgs = @('/td', 'SHA256', '/tr', $TimestampUrl)
            $timestampCommand = ' /td SHA256 /tr $q{0}$q' -f $TimestampUrl
        }
        & $sign sign /fd SHA256 /sha1 $SigningThumbprint @timestampArgs $exe
        if ($LASTEXITCODE) { throw 'Windows app signing failed.' }
        $signCommand = '$q{0}$q sign /fd SHA256 /sha1 {1}{2} $f' -f $sign, $SigningThumbprint, $timestampCommand
        $isccArgs += '/DSignedBuild=1', "/Sespdesktop=$signCommand"
    }
    & $iscc @isccArgs (Join-Path $PSScriptRoot 'EspDesktop.iss')
    if ($LASTEXITCODE) { throw 'Installer packaging failed.' }
    $fileName = "EspDesktop-Windows-$Version-$Architecture-Setup.exe"
    $installer = Join-Path $staged $fileName
    if ($SigningThumbprint) {
        foreach ($file in @($exe, $installer)) {
            $signature = Get-AuthenticodeSignature $file
            if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $SigningThumbprint) {
                throw 'Windows did not verify the requested publisher signature.'
            }
            if ($TimestampUrl -and !$signature.TimeStamperCertificate) {
                throw 'Windows did not find the requested timestamp.'
            }
        }
    }
    $destination = Join-Path $OutputDirectory $fileName
    Move-Item -LiteralPath $installer -Destination $destination -Force
    Write-Host "Installer ready at $destination"
}
finally {
    $resolved = (Resolve-Path -LiteralPath $build -ErrorAction SilentlyContinue).ProviderPath
    if ($resolved -and [IO.Path]::GetDirectoryName($resolved) -eq [IO.Path]::TrimEndingDirectorySeparator($tempRoot)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
    }
}
