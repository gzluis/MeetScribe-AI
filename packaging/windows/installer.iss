#define AppName "MeetScribe AI Local"
#define AppVersion "0.3.0"
#define Executable "MeetScribeAILocal.exe"

[Setup]
AppId={{AE24D72A-299E-480C-991E-931AF5E0BB56}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=MeetScribe AI
AppPublisherURL=https://github.com/gzluis/MeetScribe-AI
AppSupportURL=https://github.com/gzluis/MeetScribe-AI/issues
DefaultDirName={localappdata}\Programs\MeetScribe AI Local
DefaultGroupName=MeetScribe AI
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=MeetScribe-AI-Local-Setup-v{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#Executable}
DisableProgramGroupPage=yes

[Files]
Source: "..\..\dist\MeetScribeAILocal\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\MeetScribe AI Local"; Filename: "{app}\{#Executable}"
Name: "{autodesktop}\MeetScribe AI Local"; Filename: "{app}\{#Executable}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; Flags: unchecked

[Run]
Filename: "{app}\{#Executable}"; Description: "Abrir MeetScribe AI Local"; Flags: nowait postinstall skipifsilent
