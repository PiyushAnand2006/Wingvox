#requires -Version 5.1
# Wingvox per-user installer — no admin required.
#
# Run it with one command:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/PiyushAnand2006/Wingvox/v1.0.0/install.ps1 | iex"
#
# What it does: downloads the release zip, installs to %LOCALAPPDATA%\Programs\Wingvox,
# creates Start Menu + Desktop shortcuts, registers an uninstall entry under
# HKCU (Settings > Apps), and launches Wingvox.

$ErrorActionPreference = 'Stop'

$Version = '1.0.0'
$Repo    = 'PiyushAnand2006/Wingvox'
$ZipUrl  = "https://github.com/$Repo/releases/download/v$Version/Wingvox-$Version-win-x64.zip"
$Dest    = Join-Path $env:LOCALAPPDATA 'Programs\Wingvox'
$Exe     = Join-Path $Dest 'Wingvox.exe'

Write-Host ''
Write-Host "Wingvox $Version - per-user installer" -ForegroundColor Cyan

# 1. a running instance would lock the files
Get-Process -Name 'Wingvox' -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. download the release zip
$zip = Join-Path $env:TEMP "Wingvox-$Version.zip"
Write-Host "Downloading Wingvox $Version ..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing

# 3. clean install directory, extract
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Path $Dest -Force | Out-Null
Write-Host 'Extracting ...'
Expand-Archive -Path $zip -DestinationPath $Dest -Force
Remove-Item $zip -Force

if (-not (Test-Path $Exe)) { throw 'Install failed: Wingvox.exe not found after extraction.' }

# 4. uninstaller (referenced by the Apps & Features entry)
$uninstallScript = @'
# Wingvox uninstaller - removes the app, shortcuts, and registry entry.
$ErrorActionPreference = 'SilentlyContinue'
Get-Process -Name 'Wingvox' | Stop-Process -Force
Set-Location $env:USERPROFILE   # step out of the folder we are deleting
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Programs\Wingvox"
Remove-Item -Force "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Wingvox.lnk"
Remove-Item -Force (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Wingvox.lnk')
Remove-Item -Recurse -Force 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Wingvox'
Write-Host 'Wingvox has been uninstalled.'
'@
Set-Content -Path (Join-Path $Dest 'uninstall.ps1') -Value $uninstallScript -Encoding UTF8

# 5. shortcuts: Start Menu + Desktop (like every installed app)
$shell = New-Object -ComObject WScript.Shell
$startMenuLnk = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Wingvox.lnk'
$desktopLnk   = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Wingvox.lnk'
foreach ($lnkPath in @($startMenuLnk, $desktopLnk)) {
  $lnk = $shell.CreateShortcut($lnkPath)
  $lnk.TargetPath = $Exe
  $lnk.WorkingDirectory = $Dest
  $lnk.IconLocation = "$Exe,0"
  $lnk.Description = 'Wingvox - real-time meeting copilot'
  $lnk.Save()
}

# 6. Apps & Features entry (HKCU, so no admin is needed)
$regKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Wingvox'
New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name 'DisplayName'    -Value 'Wingvox'
Set-ItemProperty -Path $regKey -Name 'DisplayVersion' -Value $Version
Set-ItemProperty -Path $regKey -Name 'Publisher'      -Value 'Piyush Anand'
Set-ItemProperty -Path $regKey -Name 'DisplayIcon'    -Value $Exe
Set-ItemProperty -Path $regKey -Name 'InstallLocation' -Value $Dest
Set-ItemProperty -Path $regKey -Name 'UninstallString' -Value "powershell -NoProfile -ExecutionPolicy Bypass -File `"$Dest\uninstall.ps1`""
Set-ItemProperty -Path $regKey -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $regKey -Name 'NoRepair' -Value 1 -Type DWord

# 7. launch
Start-Process -FilePath $Exe -WorkingDirectory $Dest

Write-Host ''
Write-Host "Wingvox $Version installed and launched." -ForegroundColor Green
Write-Host "  Installed to : $Dest"
Write-Host "  Shortcuts    : Desktop + Start Menu"
Write-Host "  Uninstall    : Settings > Apps > Wingvox (or $Dest\uninstall.ps1)"
