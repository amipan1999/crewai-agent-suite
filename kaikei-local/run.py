"""ローカルサーバーを起動してブラウザを開く.

    python run.py                # http://127.0.0.1:8765 を開く
    python run.py --port 9000    # ポート変更
    python run.py --no-browser   # ブラウザを自動で開かない
"""

from __future__ import annotations

import argparse
import os
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn

# どのディレクトリから実行しても app パッケージを見つけられるようにする
ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))


def main() -> None:
    parser = argparse.ArgumentParser(description="kaikei-local 個人事業主向け会計アプリ")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--reload", action="store_true", help="開発用: コード変更で自動再起動")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}/"
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"kaikei-local を起動します: {url}  (終了は Ctrl+C)")
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload, log_level="info")


if __name__ == "__main__":
    main()
