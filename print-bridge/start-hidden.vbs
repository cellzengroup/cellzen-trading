' Starts the Cellzen print bridge with NO visible window (runs run-forever.bat hidden).
Dim fso, sh, here
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
sh.Run "cmd /c """ & here & "\run-forever.bat""", 0, False
