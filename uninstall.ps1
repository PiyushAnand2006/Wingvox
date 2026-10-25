#requires -Version 5.1
# Wingvox standalone uninstaller - also installed to %LOCALAPPDATA%\Programs\Wingvox
# and registered in Settings > Apps. Safe to run directly.
$ErrorActionPreference = 'SilentlyContinue'
Get-Process -Name 'Wingvox' | Stop-Process -Force
Set-Location $env:USERPROFILE   # step out of the folder we are deleting
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Programs\Wingvox"
Remove-Item -Force "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Wingvox.lnk"
Remove-Item -Force (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Wingvox.lnk')
Remove-Item -Recurse -Force 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Wingvox'
Write-Host 'Wingvox has been uninstalled.'
