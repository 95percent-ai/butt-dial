@echo off
echo ============================================
echo  Claude Code Development Framework Installer
echo ============================================
echo.

:: Check if .claude folder exists
if not exist "%USERPROFILE%\.claude" (
    mkdir "%USERPROFILE%\.claude"
    echo Created .claude folder.
) else (
    echo .claude folder already exists.
)

:: Check for existing CLAUDE.md
if exist "%USERPROFILE%\.claude\CLAUDE.md" (
    echo.
    echo WARNING: CLAUDE.md already exists at %USERPROFILE%\.claude\CLAUDE.md
    set /p OVERWRITE="Overwrite? (y/n): "
    if /i not "%OVERWRITE%"=="y" (
        echo Skipping CLAUDE.md
        goto settings
    )
)
copy /y "CLAUDE.md" "%USERPROFILE%\.claude\CLAUDE.md"
echo Installed CLAUDE.md

:settings
:: Check for existing settings.json
if exist "%USERPROFILE%\.claude\settings.json" (
    echo.
    echo WARNING: settings.json already exists at %USERPROFILE%\.claude\settings.json
    echo You may want to manually merge the permissions and hooks.
    echo A copy has been saved as settings-framework.json for reference.
    copy /y "settings.json" "%USERPROFILE%\.claude\settings-framework.json"
) else (
    copy /y "settings.json" "%USERPROFILE%\.claude\settings.json"
    echo Installed settings.json
)

echo.
echo ============================================
echo  Installation complete!
echo ============================================
echo.
echo What was installed:
echo   %USERPROFILE%\.claude\CLAUDE.md    (framework rules)
echo   %USERPROFILE%\.claude\settings.json (permissions and hooks)
echo.
echo To start using it:
echo   1. Open a terminal in any project folder
echo   2. Run: claude
echo   3. Tell Claude what you want to build
echo   4. The framework kicks in automatically
echo.
echo Templates for docs files are in the templates/ folder.
echo.
pause
