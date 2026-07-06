"""清理批次灌註冊的垃圾帳號（crk 前綴 + 從未啟用）。

安全設計：預設 dry-run，只印出將刪除的數量與樣本；加 --commit 才真的刪除。
只鎖定「uid 以 crk 開頭」且「plan = unactivated（從未兌換任何啟用碼）」的帳號——
已兌換的帳號 plan 會是 trial/member/lifetime，不在刪除範圍，雙重保險。

用法：
    python scripts/purge_junk_accounts.py            # dry-run，只看
    python scripts/purge_junk_accounts.py --commit   # 真的刪
    python scripts/purge_junk_accounts.py --prefix crk --commit
"""

import argparse
import sys
from pathlib import Path

# 讓腳本可獨立執行（python scripts/purge_junk_accounts.py），不必依賴 editable install。
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select

from app.db import SessionLocal, init_db
from app.models import User
from app.services.auth_service import PLAN_UNACTIVATED


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefix", default="crk", help="要清除的 uid 前綴（預設 crk）")
    parser.add_argument("--commit", action="store_true", help="真的刪除（省略則只 dry-run）")
    args = parser.parse_args()

    init_db()
    like = f"{args.prefix.lower()}%"
    with SessionLocal() as db:
        stmt = select(User).where(
            func.lower(User.uid_key).like(like),
            User.plan == PLAN_UNACTIVATED,
        )
        matched = list(db.scalars(stmt))
        total = len(matched)
        print(f"符合條件（{args.prefix}* 且未啟用）的帳號：{total} 個")
        for u in matched[:10]:
            print(f"  - {u.uid}  plan={u.plan}  created={u.created_at}")
        if total > 10:
            print(f"  …（其餘 {total - 10} 個略）")

        if not args.commit:
            print("\n[dry-run] 未刪除任何資料。確認無誤後加 --commit 執行刪除。")
            return

        for u in matched:
            db.delete(u)
        db.commit()
        print(f"\n已刪除 {total} 個帳號。")


if __name__ == "__main__":
    main()
