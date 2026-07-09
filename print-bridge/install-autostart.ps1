# Registers the Cellzen print bridge to start automatically (and invisibly) at
# every login, by dropping a shortcut into the user's Startup folder. No admin
# rights needed. Also starts it right now.
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs     = Join-Path $here 'start-hidden.vbs'
$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'Cellzen Print Bridge.lnk'

$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($lnkPath)
$s.TargetPath       = 'wscript.exe'
$s.Arguments        = '"' + $vbs + '"'
$s.WorkingDirectory = $here
$s.Description       = 'Cellzen thermal print bridge (Deli 720C)'
$s.Save()

Write-Host ''
Write-Host '  Done! The Cellzen print bridge will now start automatically and' -ForegroundColor Green
Write-Host '  invisibly every time this PC logs in - you never open anything.' -ForegroundColor Green
Write-Host '  Starting it now too...'
Start-Process wscript.exe -ArgumentList ('"' + $vbs + '"')
Write-Host ''
