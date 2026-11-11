[Setup]
AppId={{1D724D45-B90B-46A2-92AD-4ED719D766A1}
AppName=EspDesktop
AppVersion={#ProductVersion}
AppPublisher=EspDesktop
AppPublisherURL=https://jtenniswood.github.io/espdesktop/
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
AppMutex=Local\EspDesktop.Windows
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
