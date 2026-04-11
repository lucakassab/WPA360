@echo off
setlocal

set "PYTHON_SCRIPT=%~dp0serve_https.py"

python "%PYTHON_SCRIPT%"

endlocal
