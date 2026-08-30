"""Optionally reserve one database reset code for a UID through the hidden API.

PowerShell example:
    $env:NOVA_API_URL = "https://<your-backend>.up.railway.app"
    $env:NOVA_ADMIN_SECRET = "<Railway ADMIN_SECRET>"
    python scripts/issue_password_reset.py <UID>
"""

from __future__ import annotations

import os
import sys

import httpx


def main() -> int:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("用法：python scripts/issue_password_reset.py <UID>")
        return 1

    api_url = os.environ.get("NOVA_API_URL", "http://localhost:8000").rstrip("/")
    secret = os.environ.get("NOVA_ADMIN_SECRET")
    if not secret:
        print("請先設定 NOVA_ADMIN_SECRET（與 Railway 的 ADMIN_SECRET 相同）")
        return 1

    response = httpx.post(
        f"{api_url}/api/v1/admin/password-resets/issue",
        json={"uid": sys.argv[1].strip()},
        headers={"X-Admin-Key": secret},
        timeout=30.0,
    )
    if response.status_code == 404:
        print("找不到帳號，或管理密鑰不正確")
        return 1
    response.raise_for_status()
    result = response.json()
    print(f"UID：{result['uid']}")
    print(f"重設碼：{result['code']}")
    print("有效期限：不會自動過期（使用後立即作廢）")
    print(f"Railway 預備庫存：{result['stock_remaining']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
