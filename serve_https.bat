@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "PYTHON_SCRIPT=%PROJECT_ROOT%Start_https_Server\serve_https.py"

python "%PYTHON_SCRIPT%"

endlocal
