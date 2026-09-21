#!/usr/bin/env bash
# macOS / Linux 用: 仮想環境を作って依存を入れ、アプリを起動する
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt
python run.py "$@"
