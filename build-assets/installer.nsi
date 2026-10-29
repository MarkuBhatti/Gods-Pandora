; God's Pandora installer — dark, cinematic, DaVinci-Resolve-style.
; One big rounded borderless card: splash → install progress → the app opens with a welcome sheet.
Unicode true
ManifestDPIAware true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!define APPNAME "God's Pandora"
!define EXENAME "God's Pandora.exe"
!define VERSION "0.6.0"
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
ShowInstDetails nevershow
AutoCloseWindow true
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
!define MUI_CUSTOMFUNCTION_GUIINIT BigGuiInit
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.DarkGuiInit

; ── pages: one big, rounded, borderless card (like Resolve / modern app installers) ──
Page custom LocationsPage LocationsLeave
!define MUI_PAGE_CUSTOMFUNCTION_SHOW BigShow
!insertmacro MUI_PAGE_INSTFILES

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


; ── splash (like Resolve's launch card) ──
Var DataDir
Function .onInit
  ReadRegStr $DataDir HKCU "Software\God's Pandora" "DataDir"
  ${If} $DataDir == ""
    ${If} ${FileExists} "$APPDATA\God's Eye\db.json"
      StrCpy $DataDir "$APPDATA\God's Eye"
    ${ElseIf} ${FileExists} "$APPDATA\God's Eye\keys.enc.json"
      StrCpy $DataDir "$APPDATA\God's Eye"
    ${Else}
      StrCpy $DataDir "$APPDATA\God's Pandora"
    ${EndIf}
  ${EndIf}
  ${IfNot} ${Silent}
    InitPluginsDir
    File "/oname=$PLUGINSDIR\splash.bmp" "${ART}/splash.bmp"
    advsplash::show 2200 450 350 -1 "$PLUGINSDIR\splash"
    Pop $0
  ${EndIf}
FunctionEnd

; ── big card window ──
Var Dpi
Var CardW
Var CardH
!macro HIDE_ITEM ID
  GetDlgItem $9 $HWNDPARENT ${ID}
  ShowWindow $9 ${SW_HIDE}
!macroend
!macro SCALE OUT V
  IntOp ${OUT} ${V} * $Dpi
  IntOp ${OUT} ${OUT} / 96
!macroend

Function BigGuiInit
  Call DarkGuiInit
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .r0'
  ${If} $0 < 96
    StrCpy $0 96
  ${EndIf}
  StrCpy $Dpi $0
  !insertmacro SCALE $CardW 960
  !insertmacro SCALE $CardH 600
  ; pick the sharpest artwork for this display scale
  InitPluginsDir
  ${If} $Dpi >= 180
    File "/oname=$PLUGINSDIR\bg.bmp" "${ART}/bg200.bmp"
    File "/oname=$PLUGINSDIR\loc.bmp" "${ART}/loc200.bmp"
  ${ElseIf} $Dpi >= 132
    File "/oname=$PLUGINSDIR\bg.bmp" "${ART}/bg150.bmp"
    File "/oname=$PLUGINSDIR\loc.bmp" "${ART}/loc150.bmp"
  ${ElseIf} $Dpi >= 110
    File "/oname=$PLUGINSDIR\bg.bmp" "${ART}/bg125.bmp"
    File "/oname=$PLUGINSDIR\loc.bmp" "${ART}/loc125.bmp"
  ${Else}
    File "/oname=$PLUGINSDIR\bg.bmp" "${ART}/bg100.bmp"
    File "/oname=$PLUGINSDIR\loc.bmp" "${ART}/loc100.bmp"
  ${EndIf}
  ; borderless popup, rounded corners (Windows 11), centred
  System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -16, i 0x96000000)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 33, *i 2, i 4)'
  System::Call 'user32::GetSystemMetrics(i 0) i .r3'
  System::Call 'user32::GetSystemMetrics(i 1) i .r4'
  IntOp $3 $3 - $CardW
  IntOp $3 $3 / 2
  IntOp $4 $4 - $CardH
  IntOp $4 $4 / 2
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r3, i r4, i $CardW, i $CardH, i 0x0034)'
  !insertmacro HIDE_ITEM 1
  !insertmacro HIDE_ITEM 2
  !insertmacro HIDE_ITEM 3
  !insertmacro HIDE_ITEM 1028
  !insertmacro HIDE_ITEM 1256
  !insertmacro HIDE_ITEM 1035
  !insertmacro HIDE_ITEM 1034
  !insertmacro HIDE_ITEM 1036
  !insertmacro HIDE_ITEM 1037
  !insertmacro HIDE_ITEM 1038
  !insertmacro HIDE_ITEM 1039
  !insertmacro HIDE_ITEM 1045
FunctionEnd

!macro PLACE ID X Y W H
  GetDlgItem $8 $5 ${ID}
  !insertmacro SCALE $R1 ${X}
  !insertmacro SCALE $R2 ${Y}
  !insertmacro SCALE $R3 ${W}
  !insertmacro SCALE $R4 ${H}
  System::Call 'user32::SetWindowPos(p r8, p 0, i R1, i R2, i R3, i R4, i 0x0010)'
  System::Call 'user32::GetWindowLongW(p r8, i -16) i .R5'
  IntOp $R5 $R5 | 0x04000000
  System::Call 'user32::SetWindowLongW(p r8, i -16, i R5)'
!macroend

Function BigShow
  FindWindow $5 "#32770" "" $HWNDPARENT
  System::Call 'user32::SetWindowPos(p r5, p 0, i 0, i 0, i $CardW, i $CardH, i 0x0014)'
  SetCtlColors $5 E9E9EF 0D0C14
  ; artwork behind everything
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x5000000E, i 0, i 0, i $CardW, i $CardH, p r5, p 0, p 0, p 0) p .r6'
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\bg.bmp", i 0, i 0, i 0, i 0x10) p .r7'
  SendMessage $6 0x0172 0 $7
  System::Call 'user32::SetWindowPos(p r6, p 1, i 0, i 0, i 0, i 0, i 0x0013)'
  ; live status line + progress bar sit inside the drawn squircle track
  !insertmacro PLACE 1006 486 432 398 24
  SetCtlColors $8 E9E9EF 1B1926
  CreateFont $9 "Segoe UI" 11 600
  SendMessage $8 ${WM_SETFONT} $9 1
  !insertmacro PLACE 1004 489 468 389 6
  System::Call 'uxtheme::SetWindowTheme(p r8, w " ", w " ")'
  SendMessage $8 0x2001 0 0x180F10
  SendMessage $8 0x0409 0 0xFF6B8B
  GetDlgItem $8 $5 1016
  ShowWindow $8 ${SW_HIDE}
  GetDlgItem $8 $5 1027
  ShowWindow $8 ${SW_HIDE}
FunctionEnd


; ── locations: where the app goes, and where the library + AI models go (they can be tens of GB) ──
; artwork (loc*.bmp) has the labels, field boxes and button shapes; live controls sit exactly inside them
Var hInst
Var hData
!define CLIPSIB 0x04000000
!macro LOC_CTL OUT CLASS STYLE TEXT X Y W H FG BG
  !insertmacro SCALE $R1 ${X}
  !insertmacro SCALE $R2 ${Y}
  !insertmacro SCALE $R3 ${W}
  !insertmacro SCALE $R4 ${H}
  nsDialogs::CreateControl ${CLASS} ${STYLE}|${WS_CHILD}|${WS_VISIBLE}|${CLIPSIB} 0 $R1 $R2 $R3 $R4 "${TEXT}"
  Pop ${OUT}
  SendMessage ${OUT} ${WM_SETFONT} $R9 1
  SetCtlColors ${OUT} ${FG} ${BG}
!macroend
!define SS_BTN 0x00000301 ; SS_CENTER | SS_CENTERIMAGE | SS_NOTIFY

Function LocationsPage
  nsDialogs::Create 1018
  Pop $5
  ${If} $5 == error
    Abort
  ${EndIf}
  System::Call 'user32::SetWindowPos(p r5, p 0, i 0, i 0, i $CardW, i $CardH, i 0x0014)'
  System::Call 'user32::GetWindowLongW(p r5, i -16) i .r0'
  IntOp $0 $0 | 0x02000000 ; WS_CLIPCHILDREN
  System::Call 'user32::SetWindowLongW(p r5, i -16, i r0)'
  SetCtlColors $5 E9E9EF 0D0C14
  CreateFont $R9 "Segoe UI" 10 400
  CreateFont $R8 "Segoe UI" 10 700
  ; live controls (positions match loc.py)
  !insertmacro LOC_CTL $hInst EDIT ${WS_TABSTOP}|${ES_AUTOHSCROLL} "$INSTDIR" 494 327 284 18 E9E9EF 100F18
  !insertmacro LOC_CTL $0 STATIC ${SS_BTN} "Browse" 800 323 78 26 E9E9EF 2A2735
  ${NSD_OnClick} $0 BrowseInst
  !insertmacro LOC_CTL $hData EDIT ${WS_TABSTOP}|${ES_AUTOHSCROLL} "$DataDir" 494 391 284 18 E9E9EF 100F18
  !insertmacro LOC_CTL $0 STATIC ${SS_BTN} "Browse" 800 387 78 26 E9E9EF 2A2735
  ${NSD_OnClick} $0 BrowseData
  !insertmacro LOC_CTL $0 STATIC ${SS_BTN} "Cancel" 668 458 88 28 E9E9EF 2A2735
  ${NSD_OnClick} $0 DoCancel
  !insertmacro LOC_CTL $0 STATIC ${SS_BTN} "Install" 780 458 96 28 FFFFFF 8B6BFF
  SendMessage $0 ${WM_SETFONT} $R8 1
  ${NSD_OnClick} $0 DoInstall
  ; artwork last, sent to the bottom
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x5400000E, i 0, i 0, i $CardW, i $CardH, p r5, p 0, p 0, p 0) p .r6'
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\loc.bmp", i 0, i 0, i 0, i 0x10) p .r7'
  SendMessage $6 0x0172 0 $7
  System::Call 'user32::SetWindowPos(p r6, p 1, i 0, i 0, i 0, i 0, i 0x0013)'
  ${NSD_SetFocus} $hInst
  SendMessage $hInst ${EM_SETSEL} -1 -1
  nsDialogs::Show
FunctionEnd

Function BrowseInst
  Pop $0
  ${NSD_GetText} $hInst $1
  nsDialogs::SelectFolderDialog "Where should God's Pandora be installed?" "$1"
  Pop $1
  ${If} $1 != error
    ${NSD_SetText} $hInst "$1\God's Pandora"
  ${EndIf}
FunctionEnd

Function BrowseData
  Pop $0
  ${NSD_GetText} $hData $1
  nsDialogs::SelectFolderDialog "Where should your library and AI models be stored?" "$1"
  Pop $1
  ${If} $1 != error
    ${NSD_SetText} $hData "$1\God's Pandora Data"
  ${EndIf}
FunctionEnd

Function DoInstall
  Pop $0
  SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
FunctionEnd

Function DoCancel
  Pop $0
  SendMessage $HWNDPARENT ${WM_COMMAND} 2 0
FunctionEnd

Function LocationsLeave
  ${NSD_GetText} $hInst $0
  ${NSD_GetText} $hData $1
  ${If} $0 == ""
  ${OrIf} $1 == ""
    MessageBox MB_ICONEXCLAMATION "Please choose both folders."
    Abort
  ${EndIf}
  StrCpy $INSTDIR $0
  StrCpy $DataDir $1
FunctionEnd

Function .onInstSuccess
  ${IfNot} ${Silent}
    Exec "$\"$INSTDIR\${EXENAME}$\" --installed=${VERSION}"
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
  WriteRegStr HKCU "Software\God's Pandora" "DataDir" "$DataDir"
  CreateDirectory "$DataDir"
  FileOpen $0 "$INSTDIR\pandora-data.txt" w
  FileWriteUTF16LE /BOM $0 "$DataDir"
  FileClose $0
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "URLInfoAbout" "https://github.com/"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall God$\'s Pandora.exe" _?=$INSTDIR'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall God$\'s Pandora.exe" /S _?=$INSTDIR'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
  DetailPrint "Done."
SectionEnd

Section "-Desktop shortcut" SecDesktop
  CreateShortCut "$DESKTOP\God's Pandora.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
SectionEnd

Section "-Start menu shortcuts" SecStart
  CreateDirectory "$SMPROGRAMS\God's Pandora"
  CreateShortCut "$SMPROGRAMS\God's Pandora\God's Pandora.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortCut "$SMPROGRAMS\God's Pandora\Uninstall God's Pandora.lnk" "$INSTDIR\Uninstall God's Pandora.exe" "_?=$INSTDIR"
SectionEnd

Section /o "-Start at sign-in" SecLogin
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "God's Pandora" "$\"$INSTDIR\${EXENAME}$\""
SectionEnd



; ── uninstall ──
Var UnDataDir
Function un.onInit
  ReadRegStr $UnDataDir HKCU "Software\God's Pandora" "DataDir"
FunctionEnd

Section "un.God's Pandora (app)" UnSecMain
  SectionIn RO
  nsExec::Exec 'taskkill /F /IM "God$\'s Pandora.exe"'
  Pop $0
  Delete "$DESKTOP\God's Pandora.lnk"
  RMDir /r "$SMPROGRAMS\God's Pandora"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "God's Pandora"
  RMDir /r "$INSTDIR"
  ; the uninstaller runs in place, so it removes its own file a moment after it closes (hidden, no console window)
  ExecShell "open" "$SYSDIR\cmd.exe" '/c ping -n 3 127.0.0.1 >nul & del /f /q "$INSTDIR\Uninstall God$\'s Pandora.exe" & rmdir /s /q "$INSTDIR"' SW_HIDE
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\God's Pandora"
SectionEnd

Section /o "un.Also delete my library, keys and downloaded models" UnSecData
  ${If} $UnDataDir != ""
    RMDir /r "$UnDataDir"
  ${EndIf}
  RMDir /r "$APPDATA\God's Eye"
  RMDir /r "$APPDATA\God's Pandora"
  DeleteRegValue HKCU "Software\God's Pandora" "DataDir"
SectionEnd

!insertmacro MUI_UNFUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${UnSecMain} "Removes the God's Pandora app, shortcuts and settings."
  !insertmacro MUI_DESCRIPTION_TEXT ${UnSecData} "Leave unticked to keep your creations, API keys and models for a future reinstall."
!insertmacro MUI_UNFUNCTION_DESCRIPTION_END
