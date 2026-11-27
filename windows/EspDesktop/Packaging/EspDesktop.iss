#define AppMutexName "Local\EspDesktop.Windows"

[Setup]
AppId={{1D724D45-B90B-46A2-92AD-4ED719D766A1}
AppName=EspDesktop
AppVersion={#ProductVersion}
VersionInfoVersion={#ProductVersion}
VersionInfoProductName=EspDesktop
VersionInfoProductTextVersion={#ProductVersion}
InfoBeforeFile=Install-Information.txt
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

[Tasks]
Name: disableupdatechecks; Description: "Turn off automatic update checks"; Flags: unchecked; Check: NeedsUpdatePreference

[Files]
Source: "Disable-Update-Checks.json"; DestDir: "{localappdata}\EspDesktop"; DestName: "settings.json"; Tasks: disableupdatechecks; Flags: onlyifdoesntexist uninsneveruninstall
Source: "{#PublishDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "EspDesktop.ico"; DestDir: "{app}"; DestName: "EspDesktop-Fingerprint.ico"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\EspDesktop"; Filename: "{app}\EspDesktop.exe"; IconFilename: "{app}\EspDesktop-Fingerprint.ico"

[Run]
Filename: "{app}\EspDesktop.exe"; Description: "Open EspDesktop"; Flags: nowait postinstall skipifsilent

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "EspDesktop"; Flags: dontcreatekey uninsdeletevalue

[Code]
const
  SHCNE_UPDATEITEM = $00002000;
  SHCNF_PATHW = $0005;

procedure SHChangeNotify(Event: Longint; Flags: Cardinal; Path: String; Reserved: Integer);
  external 'SHChangeNotify@shell32.dll stdcall';

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    { Refresh the existing executable's shell icon as well as the new shortcut. }
    SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, ExpandConstant('{app}\EspDesktop.exe'), 0);
    SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, ExpandConstant('{autoprograms}\EspDesktop.lnk'), 0);
  end;
end;

function NeedsUpdatePreference(): Boolean;
begin
  Result := not FileExists(ExpandConstant('{localappdata}\EspDesktop\settings.json'));
end;

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
