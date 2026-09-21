@echo off
REM Windows 用: 仮想環境を作って依存を入れ、アプリを起動する
cd /d %~dp0
if not exist .venv (
  py -3 -m venv .venv || python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
python run.py %*
pause
