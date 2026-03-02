@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"

set "REPO_URL=https://github.com/lucakassab/WPA360.git"
set "BRANCH=main"

where git >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Git nao ta no PATH. Instala o Git e reinicia o terminal.
  exit /b 1
)

if not exist ".git\" (
  echo [*] Inicializando repo...
  git init || exit /b 1
)

rem --- garante remote origin certo
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [*] Setando remote origin...
  git remote add origin "%REPO_URL%" || exit /b 1
) else (
  for /f "delims=" %%U in ('git remote get-url origin') do set "CUR_ORIGIN=%%U"
  if /i not "!CUR_ORIGIN!"=="%REPO_URL%" (
    echo [!] origin tava apontando pra: !CUR_ORIGIN!
    echo [*] Atualizando origin pra: %REPO_URL%
    git remote set-url origin "%REPO_URL%" || exit /b 1
  )
)

rem --- garante branch main
for /f "delims=" %%B in ('git symbolic-ref --quiet --short HEAD 2^>nul') do set "CUR_BRANCH=%%B"
if not defined CUR_BRANCH (
  echo [*] Criando branch %BRANCH%...
  git checkout -b "%BRANCH%" || exit /b 1
) else (
  if /i not "!CUR_BRANCH!"=="%BRANCH%" (
    echo [*] Renomeando branch !CUR_BRANCH! -^> %BRANCH%...
    git branch -M "%BRANCH%" || exit /b 1
  )
  git checkout "%BRANCH%" >nul 2>&1
)

rem --- tenta alinhar com remoto antes (pra evitar push dando ruim)
git fetch origin >nul 2>&1
git rev-parse --verify "origin/%BRANCH%" >nul 2>&1
if not errorlevel 1 (
  echo [*] Pull --rebase de origin/%BRANCH%...
  git pull --rebase origin "%BRANCH%"
  if errorlevel 1 (
    echo [ERRO] Deu conflito no rebase. Resolve e roda o upload.bat de novo.
    exit /b 1
  )
)

echo [*] Staging...
git add -A || exit /b 1

git diff --cached --quiet
if not errorlevel 1 (
  echo [=] Nada pra commitar.
  exit /b 0
)

set "MSG=%*"
if "%MSG%"=="" set "MSG=update %date% %time%"

echo [*] Commit: %MSG%
git commit -m "%MSG%"
if errorlevel 1 (
  echo [ERRO] Commit falhou. Se for a primeira vez, configura:
  echo   git config --global user.name "Seu Nome"
  echo   git config --global user.email "seu@email.com"
  exit /b 1
)

echo [*] Push...
git push -u origin "%BRANCH%" || exit /b 1

echo [OK] Subiu pro GitHub.
exit /b 0