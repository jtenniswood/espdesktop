#define AppMutexName "Local\EspDesktop.Windows"

[Setup]
AppId={{1D724D45-B90B-46A2-92AD-4ED719D766A1}
AppName=EspDesktop
AppVersion={#ProductVersion}
AppPublisher=EspDesktop
AppPublisherURL=https://espdesktop.com/
AppSupportURL=https://github.com/jtenniswood/espdesktop/issues
AppUpdatesURL=https://github.com/jtenniswood/espdesktop/releases
DefaultDirName={localappdata}\Programs\EspDesktop
DefaultGroupName=EspDesktop
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\EspDesktop.exe
OutputDir={#OutputDirectory}
OutputBaseFilename=EspDesktop-Windows-{#ProductVersion}-{#ProductArch}-Setup
SetupIconFile=EspDesktop.ico
WizardStyle=modern
MinVersion=10.0.22000
PrivilegesRequired=lowest
AppMutex={#AppMutexName}
CloseApplications=yes
RestartApplications=no
#if ProductArch == "arm64"
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
#else
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#endif
#ifdef SignedBuild
SignTool=espdesktop
SignedUninstaller=yes
#endif

[Files]
Source: "{#PublishDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\EspDesktop"; Filename: "{app}\EspDesktop.exe"

[Run]
Filename: "{app}\EspDesktop.exe"; Description: "Open EspDesktop"; Flags: nowait postinstall skipifsilent

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "EspDesktop"; Flags: dontcreatekey uninsdeletevalue

[Code]
function InitializeSetup(): Boolean;
var
  Index, Attempt: Integer;
begin
  Result := True;
  for Index := 1 to ParamCount do
    if CompareText(ParamStr(Index), '/EspDesktopUpdate') = 0 then
    begin
      if CheckForMutexes('{#AppMutexName}') then
      begin
        Log('Waiting for EspDesktop to finish closing.');
        for Attempt := 1 to 100 do
        begin
          Sleep(200);
          if not CheckForMutexes('{#AppMutexName}') then
            Break;
        end;
      end;
      { Setup checks AppMutex again before it can replace any files. }
      Exit;
    end;
end;
