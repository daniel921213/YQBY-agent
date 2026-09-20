# 回測系統與交易日誌

## 權限

- 已啟用會員可建立自己的交易紀錄與私人日誌。
- `plan = lifetime` 的帳號可將自己的日誌發布給站內已登入會員，亦可取消發布。
- 所有交易紀錄只允許擁有者讀取。日誌草稿只允許作者讀取；公開頁面只讀取最後一次按「發布」時的快照。
- 編輯已發布日誌的草稿不會更動公開文章，也不會產生更新通知；按「發布更新」才會同步快照並產生事件。

## 老師顯示名稱

啟動時會替既有 `users` 資料表補上可空的 `display_name` 欄位。此欄位只作為對外顯示名稱，UID 和登入方式不變。管理者可在 Railway 的 PostgreSQL 執行：

```sql
UPDATE users SET display_name = '吉吉' WHERE uid_key = '54025694';
```

也可以用現有的 `ADMIN_SECRET` 呼叫受保護的端點：

```http
PUT /api/v1/admin/users/54025694/display-name
X-Admin-Key: <ADMIN_SECRET>
Content-Type: application/json

{"display_name":"吉吉"}
```

網站會顯示「吉吉老師」和「吉吉老師已更新日誌」。未設定名稱時暫以 UID 顯示。

## 資料與計算

- 交易損益：`(出場價 - 進場價) × 數量 × 每點價值 × 方向 - 手續費`。期貨須填合約每點價值。
- 不同損益幣別在儀表板分開統計，不混算 USD、USDT 等貨幣。
- 日誌圖片以最大 5 MB 的 PNG、JPEG、WebP 或 GIF 存在 PostgreSQL；讀取圖片時仍檢查作者／發布快照的權限。
- 站內通知由網站約每 20 秒及視窗重新取得焦點時檢查，並依會員帳號記錄已讀游標。

## 上線

新資料表由應用程式啟動時的 `init_db()` 建立；既有帳號補欄位由 `run_journal_migration()` 處理。部署前先備份 Railway PostgreSQL，並確認 `DATABASE_URL`、`JWT_SECRET`、`ADMIN_SECRET` 已正確設定。新版前端與後端應一起發布。
