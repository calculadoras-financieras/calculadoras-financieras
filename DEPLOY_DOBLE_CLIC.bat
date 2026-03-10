@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  DEPLOY — Calculadoras Financieras ES   ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Buscar Git Bash automáticamente
set GITBASH=
if exist "C:\Program Files\Git\bin\bash.exe" set GITBASH=C:\Program Files\Git\bin\bash.exe
if exist "C:\Program Files (x86)\Git\bin\bash.exe" set GITBASH=C:\Program Files (x86)\Git\bin\bash.exe

if "%GITBASH%"=="" (
  echo  ERROR: No se encontro Git Bash.
  echo  Instala Git desde https://git-scm.com
  pause
  exit /b 1
)

:: Ejecutar deploy desde la carpeta del .bat
cd /d "%~dp0"
echo  Ejecutando deploy...
echo.
"%GITBASH%" --login -i -c "cd '%~dp0' && export PATH=\"$HOME/bin:$PATH\" && bash scripts/deploy.sh"

echo.
echo  Proceso finalizado. Pulsa cualquier tecla para cerrar.
pause >nul
