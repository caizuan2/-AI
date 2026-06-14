[Setup]
AppId={{8D8F7FEF-32F4-4E7D-B8E3-A10800000108}
AppName=AI知识库助手
AppVersion=1.0.8
AppPublisher=AI Knowledge
DefaultDirName={autopf}\AI知识库助手
DefaultGroupName=AI知识库助手
DisableProgramGroupPage=yes
OutputDir=D:\XT\releases\1.0.8
OutputBaseFilename=ai-knowledge-chat-latest
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\ai_knowledge_flutter_app.exe

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "D:\XT\releases\1.0.8\windows-runtime\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AI知识库助手"; Filename: "{app}\ai_knowledge_flutter_app.exe"
Name: "{autodesktop}\AI知识库助手"; Filename: "{app}\ai_knowledge_flutter_app.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ai_knowledge_flutter_app.exe"; Description: "{cm:LaunchProgram,AI知识库助手}"; Flags: nowait postinstall skipifsilent
