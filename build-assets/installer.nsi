; God's Pandora installer — dark, cinematic, DaVinci-Resolve-style.
; Splash → Welcome → License → Components → Folder → Install → Finish. Built from win-unpacked with makensis.
Unicode true
ManifestDPIAware true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!define APPNAME "God's Pandora"
!define EXENAME "God's Pandora.exe"
!define VERSION "0.4.0"
!define PUBLISHER "Haider Bhatti"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.haider.godspandora"
!define SRC "../release/win-unpacked"
!define ART "installer"
; palette
!define C_BG   "16161B"
!define C_FG   "E9E9EF"
!define C_DIM  "9A9AAD"
!define C_EDIT "22222A"

Name "${APPNAME}"
Caption "${APPNAME} ${VERSION} Setup"
OutFile "../release/Gods-Pandora-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\God's Pandora"
InstallDirRegKey HKCU "Software\God's Pandora" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID bzip2
BrandingText "God's Pandora ${VERSION}  ·  Every model. Every medium. One creative universe."
ShowInstDetails hide
ShowUninstDetails hide

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright © 2026 ${PUBLISHER}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

; ── look ──
!define MUI_ICON "${ART}/icon.ico"
!define MUI_UNICON "${ART}/icon.ico"
!define MUI_BGCOLOR "${C_BG}"
!define MUI_TEXTCOLOR "${C_FG}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${ART}/sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${ART}/sidebar.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP_STRETCH AspectFitHeight
!define MUI_UNWELCOMEFINISHPAGE_BITMAP_STRETCH AspectFitHeight
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "${ART}/header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "${ART}/header.bmp"
!define MUI_HEADERIMAGE_BITMAP_STRETCH AspectFitHeight
!define MUI_HEADERIMAGE_UNBITMAP_STRETCH AspectFitHeight
!define MUI_HEADER_TRANSPARENT_TEXT
!define MUI_LICENSEPAGE_BGCOLOR "${C_EDIT}"
!define MUI_INSTFILESPAGE_COLORS "${C_FG} ${C_EDIT}"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_COMPONENTSPAGE_SMALLDESC
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Stop installing God's Pandora? Nothing has been changed on your PC yet."
!define MUI_CUSTOMFUNCTION_GUIINIT DarkGuiInit
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.DarkGuiInit

; ── pages ──
!define MUI_WELCOMEPAGE_TITLE "Welcome to God's Pandora ${VERSION}"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "Every model. Every medium. One creative universe.$\r$\n$\r$\nImage, video, audio, 3D, TouchDesigner, marketing and app building — on your own API keys or free and offline on your own GPU.$\r$\n$\r$\nNew in ${VERSION}:$\r$\n  •  Pandora Cut — auto edit to the beat + auto colour grading$\r$\n  •  Live model status in every picker$\r$\n  •  Smaller downloads and a low-VRAM engine$\r$\n$\r$\nYour keys, library and characters carry over automatically.$\r$\n$\r$\nClick Next to continue."
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkWelcome
!insertmacro MUI_PAGE_WELCOME

!define MUI_PAGE_HEADER_TEXT "License Agreement"
!define MUI_PAGE_HEADER_SUBTEXT "God's Pandora is free and open-source software (MIT)."
!define MUI_LICENSEPAGE_TEXT_TOP "Please review the license terms before installing God's Pandora."
!define MUI_LICENSEPAGE_TEXT_BOTTOM "If you accept the terms, click I Agree to continue."
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkLicense
!insertmacro MUI_PAGE_LICENSE "${ART}/LICENSE.txt"

!define MUI_PAGE_HEADER_TEXT "Choose Components"
!define MUI_PAGE_HEADER_SUBTEXT "Pick the shortcuts and options you want."
!define MUI_COMPONENTSPAGE_TEXT_TOP "God's Pandora core is always installed. AI models download later, only when you choose them."
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkInner
!insertmacro MUI_PAGE_COMPONENTS

!define MUI_PAGE_HEADER_TEXT "Install Location"
!define MUI_PAGE_HEADER_SUBTEXT "No administrator rights needed — installs just for you."
!define MUI_DIRECTORYPAGE_TEXT_TOP "God's Pandora will be installed in the folder below. Downloaded models are stored separately in your user data folder, so you can reinstall or update without downloading them again."
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkInner
!insertmacro MUI_PAGE_DIRECTORY

!define MUI_PAGE_HEADER_TEXT "Installing God's Pandora"
!define MUI_PAGE_HEADER_SUBTEXT "Setting up Pandora Core, Studio and the local engine…"
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Installation complete"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "God's Pandora is ready."
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkInner
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "God's Pandora is ready"
!define MUI_FINISHPAGE_TEXT "God's Pandora ${VERSION} has been installed.$\r$\n$\r$\nFirst launch opens a short setup that checks your PC and recommends the best free models for your GPU. Cloud models just need your own API key.$\r$\n$\r$\nYour library, keys and models live in your user folder and are never removed by updates."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch God's Pandora"
!define MUI_FINISHPAGE_LINK "What's new in ${VERSION}"
!define MUI_FINISHPAGE_LINK_LOCATION "$INSTDIR\resources\CHANGELOG.txt"
!define MUI_FINISHPAGE_LINK_COLOR "B9A8FF"
!define MUI_PAGE_CUSTOMFUNCTION_SHOW DarkFinish
!insertmacro MUI_PAGE_FINISH

; uninstaller
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.DarkWelcome
!insertmacro MUI_UNPAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.DarkInner
!insertmacro MUI_UNPAGE_COMPONENTS
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.DarkInner
!insertmacro MUI_UNPAGE_INSTFILES
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.DarkFinish
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

; ── dark theme helpers (shared by installer and uninstaller) ──
; Colours every child of a dialog: labels/edits/lists dark; checkboxes & radios lose the light theme so
; their text can be coloured; push buttons keep the native Windows look.
!macro DARKEN_CHILDREN UN
Function ${UN}DarkenChildren ; $R0 = parent hwnd
  Push $R1
  Push $R2
  Push $R3
  StrCpy $R1 0
  loop:
    FindWindow $R1 "" "" $R0 $R1
    IntCmp $R1 0 done
    System::Call 'user32::GetClassNameW(p R1, w .R2, i 64)'
    ${If} $R2 == "Button"
      System::Call 'user32::GetWindowLongW(p R1, i -16) i .R3'
      IntOp $R3 $R3 & 0xF
      ${If} $R3 > 1
        System::Call 'uxtheme::SetWindowTheme(p R1, w " ", w " ")'
        SetCtlColors $R1 ${C_FG} ${C_BG}
      ${EndIf}
    ${ElseIf} $R2 == "Edit"
      SetCtlColors $R1 ${C_FG} ${C_EDIT}
    ${ElseIf} $R2 == "SysListView32"
      SendMessage $R1 0x1001 0 0x2A2222   ; LVM_SETBKCOLOR (BGR)
      SendMessage $R1 0x1026 0 0x2A2222   ; LVM_SETTEXTBKCOLOR
      SendMessage $R1 0x1024 0 0xEFE9E9   ; LVM_SETTEXTCOLOR
    ${ElseIf} $R2 == "SysTreeView32"
      System::Call 'uxtheme::SetWindowTheme(p R1, w "DarkMode_Explorer", n)'
      SendMessage $R1 0x111D 0 0x2A2222   ; TVM_SETBKCOLOR
      SendMessage $R1 0x111E 0 0xEFE9E9   ; TVM_SETTEXTCOLOR
    ${ElseIf} $R2 == "msctls_progress32"
      System::Call 'uxtheme::SetWindowTheme(p R1, w " ", w " ")'
      SendMessage $R1 0x2001 0 0x2A2222   ; PBM_SETBKCOLOR
      SendMessage $R1 0x0409 0 0xFF6B8B   ; PBM_SETBARCOLOR (violet, BGR)
    ${ElseIf} $R2 == "RichEdit20W"
      SendMessage $R1 0x0443 0 0x2A2222   ; EM_SETBKGNDCOLOR
      System::Call '*(i 92, i 0x40000000, i 0, i 0, i 0, i 0xEFE9E9, &l17 0) p .R3'
      SendMessage $R1 0x0444 4 $R3        ; EM_SETCHARFORMAT SCF_ALL — light text
      System::Free $R3
    ${Else}
      SetCtlColors $R1 ${C_FG} ${C_BG}
    ${EndIf}
    Goto loop
  done:
  Pop $R3
  Pop $R2
  Pop $R1
FunctionEnd

Function ${UN}DarkGuiInit
  ; the outer window (button bar, branding line) — Windows 11 dark title bar too
  SetCtlColors $HWNDPARENT ${C_FG} ${C_BG}
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
  GetDlgItem $0 $HWNDPARENT 1028
  SetCtlColors $0 ${C_DIM} transparent
  GetDlgItem $0 $HWNDPARENT 1256
  SetCtlColors $0 ${C_DIM} transparent
  GetDlgItem $0 $HWNDPARENT 1034
  SetCtlColors $0 ${C_FG} ${C_BG}
  GetDlgItem $0 $HWNDPARENT 1037
  SetCtlColors $0 ${C_FG} transparent
  GetDlgItem $0 $HWNDPARENT 1038
  SetCtlColors $0 ${C_DIM} transparent
FunctionEnd

Function ${UN}DarkInner
  FindWindow $R0 "#32770" "" $HWNDPARENT
  SetCtlColors $R0 ${C_FG} ${C_BG}
  Call ${UN}DarkenChildren
FunctionEnd

Function ${UN}DarkWelcome
  StrCpy $R0 $mui.WelcomePage
  Call ${UN}DarkenChildren
  SetCtlColors $mui.WelcomePage.Title FFFFFF ${C_BG}
FunctionEnd

Function ${UN}DarkFinish
  StrCpy $R0 $mui.FinishPage
  Call ${UN}DarkenChildren
  SetCtlColors $mui.FinishPage.Title FFFFFF ${C_BG}
FunctionEnd
!macroend
!insertmacro DARKEN_CHILDREN ""
!insertmacro DARKEN_CHILDREN "un."

Function DarkLicense
  Call DarkInner
FunctionEnd

; ── splash (like Resolve's launch card) ──
Function .onInit
  ${IfNot} ${Silent}
    InitPluginsDir
    File "/oname=$PLUGINSDIR\splash.bmp" "${ART}/splash.bmp"
    advsplash::show 2400 450 350 -1 "$PLUGINSDIR\splash"
    Pop $0
  ${EndIf}
FunctionEnd

Function CloseRunning
  nsExec::Exec 'taskkill /F /IM "God$\'s Pandora.exe"'
  Pop $0
  Sleep 400
FunctionEnd

; ── components ──
Section "God's Pandora (required)" SecMain
  SectionIn RO
  Call CloseRunning
  SetDetailsPrint both
  DetailPrint "Preparing…"
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"

  DetailPrint "Installing Pandora Core…"
  SetDetailsPrint listonly
  File "${SRC}/*.exe"
  File "${SRC}/*.dll"
  File "${SRC}/*.pak"
  File "${SRC}/*.dat"
  File "${SRC}/*.bin"
  File "${SRC}/*.json"
  File /nonfatal "${SRC}/*.txt"
  File /nonfatal "${SRC}/*.html"
  SetDetailsPrint both
  DetailPrint "Installing languages…"
  SetDetailsPrint listonly
  SetOutPath "$INSTDIR\locales"
  File /r "${SRC}/locales/*"
  SetDetailsPrint both
  DetailPrint "Installing Pandora Studio (interface)…"
  SetDetailsPrint listonly
  SetOutPath "$INSTDIR\resources"
  File "${SRC}/resources/app.asar"
  File "/oname=CHANGELOG.txt" "${ART}/CHANGELOG.txt"
  SetDetailsPrint both
  DetailPrint "Installing the local AI engine (Pandora Models)…"
  SetDetailsPrint listonly
  SetOutPath "$INSTDIR\resources\app.asar.unpacked"
  File /r "${SRC}/resources/app.asar.unpacked/*"
  SetDetailsPrint both

  DetailPrint "Registering God's Pandora…"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall God's Pandora.exe"
  WriteRegStr HKCU "Software\God's Pandora" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "URLInfoAbout" "https://github.com/"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall God$\'s Pandora.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall God$\'s Pandora.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
  DetailPrint "Done."
SectionEnd

Section "Desktop shortcut" SecDesktop
  CreateShortCut "$DESKTOP\God's Pandora.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
SectionEnd

Section "Start menu shortcuts" SecStart
  CreateDirectory "$SMPROGRAMS\God's Pandora"
  CreateShortCut "$SMPROGRAMS\God's Pandora\God's Pandora.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortCut "$SMPROGRAMS\God's Pandora\Uninstall God's Pandora.lnk" "$INSTDIR\Uninstall God's Pandora.exe"
SectionEnd

Section /o "Start God's Pandora when I sign in" SecLogin
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "God's Pandora" "$\"$INSTDIR\${EXENAME}$\""
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "The app: Pandora Core, Studio, Cut, Film, 3D and the local AI engine (~250 MB). Models download later, only when you choose them."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Put a God's Pandora icon on your desktop."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStart} "Add God's Pandora to the Start menu."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecLogin} "Open God's Pandora automatically when you sign in to Windows."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ── uninstall ──
Section "un.God's Pandora (app)" UnSecMain
  SectionIn RO
  nsExec::Exec 'taskkill /F /IM "God$\'s Pandora.exe"'
  Pop $0
  Delete "$DESKTOP\God's Pandora.lnk"
  RMDir /r "$SMPROGRAMS\God's Pandora"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "God's Pandora"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\God's Pandora"
SectionEnd

Section /o "un.Also delete my library, keys and downloaded models" UnSecData
  RMDir /r "$APPDATA\God's Pandora"
SectionEnd

!insertmacro MUI_UNFUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${UnSecMain} "Removes the God's Pandora app, shortcuts and settings."
  !insertmacro MUI_DESCRIPTION_TEXT ${UnSecData} "Leave unticked to keep your creations, API keys and models for a future reinstall."
!insertmacro MUI_UNFUNCTION_DESCRIPTION_END
