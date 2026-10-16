; Reference NSIS script used to build the installer from win-unpacked in the sandbox (BUILD.bat / CI use electron-builder).
Unicode true
ManifestDPIAware true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APPNAME "God's Pandora"
!define EXENAME "God's Pandora.exe"
!define VERSION "0.4.0"
!define PUBLISHER "Haider Bhatti"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.haider.godspandora"

Name "${APPNAME}"
OutFile "/tmp/inst/out/Gods-Pandora-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\God's Pandora"
InstallDirRegKey HKCU "Software\God's Pandora" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID bzip2

BrandingText "${APPNAME} ${VERSION} — Every model. Every medium. One creative universe."
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright © 2026 ${PUBLISHER}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!define MUI_ICON "/tmp/inst/icon.ico"
!define MUI_UNICON "/tmp/inst/icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "/tmp/inst/sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "/tmp/inst/sidebar.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "/tmp/inst/header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to God's Pandora"
!define MUI_WELCOMEPAGE_TEXT "Every model. Every medium. One creative universe.$\r$\n$\r$\nImage, video, audio, 3D and live visuals — on your own API keys or free on your own GPU.$\r$\n$\r$\nYour keys, library and characters from God's Eye carry over automatically.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Open God's Pandora"
!define MUI_FINISHPAGE_LINK "Read the changelog"
!define MUI_FINISHPAGE_LINK_LOCATION "$INSTDIR\resources\CHANGELOG.txt"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "/tmp/inst/LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function CloseRunning
  ; close a running copy so files are not locked
  nsExec::Exec 'taskkill /F /IM "God$\'s Pandora.exe"'
  Pop $0
  Sleep 400
FunctionEnd

Section "God's Pandora" SecMain
  SectionIn RO
  Call CloseRunning
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"
  File /r "/tmp/ebuild/win-unpacked/*"
  File "/oname=$INSTDIR\resources\CHANGELOG.txt" "/tmp/inst/CHANGELOG.txt"
  WriteUninstaller "$INSTDIR\Uninstall God's Pandora.exe"
  CreateShortCut "$DESKTOP\God's Pandora.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateDirectory "$SMPROGRAMS\God's Pandora"
  CreateShortCut "$SMPROGRAMS\God's Pandora\God's Pandora.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortCut "$SMPROGRAMS\God's Pandora\Uninstall God's Pandora.lnk" "$INSTDIR\Uninstall God's Pandora.exe"
  WriteRegStr HKCU "Software\God's Pandora" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall God$\'s Pandora.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall God$\'s Pandora.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "God$\'s Pandora.exe"'
  Pop $0
  Delete "$DESKTOP\God's Pandora.lnk"
  RMDir /r "$SMPROGRAMS\God's Pandora"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\God's Pandora"
  ; your library, keys and models in %APPDATA%\God's Pandora are kept
SectionEnd
