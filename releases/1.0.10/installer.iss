[Setup]
AppId={{7E4F8B80-9C3C-4F7C-9F2C-AIKNOWLEDGE110}}
AppName=AI知识库助手
AppVersion=1.0.10
AppPublisher=AI Knowledge
DefaultDirName={autopf}\AI知识库助手
DefaultGroupName=AI知识库助手
OutputDir=D:\XT\releases\1.0.10
OutputBaseFilename=ai-knowledge-chat-latest
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\ai_knowledge_flutter_app.exe

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加图标："; Flags: unchecked

[Files]
Source: "D:\XT\releases\1.0.10\windows-runtime\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AI知识库助手"; Filename: "{app}\ai_knowledge_flutter_app.exe"
Name: "{autodesktop}\AI知识库助手"; Filename: "{app}\ai_knowledge_flutter_app.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ai_knowledge_flutter_app.exe"; Description: "启动 AI知识库助手"; Flags: nowait postinstall skipifsilent
