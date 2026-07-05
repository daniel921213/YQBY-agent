"""產啟用碼（呼叫正式後端的隱藏管理 API，本機不碰資料庫密碼）。

用法（PowerShell）：
    $env:NOVA_API_URL = "https://<你的 Railway 後端網址>"
    $env:NOVA_ADMIN_SECRET = "<ADMIN_SECRET 環境變數的值>"
    python scripts/gen_codes.py 30d 100      # 產 100 組 30 天碼
    python scripts/gen_codes.py lifetime 5   # 產 5 組永久碼

輸出：印在畫面上，並存成 codes_<tier>_<時間>.txt（存到手機記事本用）。
"""

from __future__ import annotations

import os
import sys
from datetime import datetime

import httpx


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in {"30d", "lifetime"}:
        print("用法：python scripts/gen_codes.py <30d|lifetime> <數量 1-500>")
        return 1
    tier = sys.argv[1]
    count = int(sys.argv[2])

    api_url = os.environ.get("NOVA_API_URL", "http://localhost:8000").rstrip("/")
    secret = os.environ.get("NOVA_ADMIN_SECRET")
    if not secret:
        print("請先設定 NOVA_ADMIN_SECRET 環境變數（= Railway 上的 ADMIN_SECRET）")
        return 1

    response = httpx.post(
        f"{api_url}/api/v1/admin/codes",
        json={"tier": tier, "count": count},
        headers={"X-Admin-Key": secret},
        timeout=30.0,
    )
    if response.status_code == 404:
        print("被拒絕（404）：ADMIN_SECRET 不正確，或後端尚未設定該環境變數")
        return 1
    response.raise_for_status()
    codes = response.json()["codes"]

    filename = f"codes_{tier}_{datetime.now():%Y%m%d_%H%M%S}.txt"
    with open(filename, "w", encoding="utf-8") as fh:
        fh.write("\n".join(codes) + "\n")

    label = "30 天" if tier == "30d" else "永久"
    print(f"已產 {len(codes)} 組{label}碼，存於 {filename}：\n")
    print("\n".join(codes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
