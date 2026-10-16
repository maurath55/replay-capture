' Launches start.cmd without a console window (used by the Startup shortcut).
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = Replace(WScript.ScriptFullName, "start-hidden.vbs", "")
sh.Run "cmd /c start.cmd", 0, False
