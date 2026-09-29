"""Preview/apply fixed member dates through the authenticated admin API.

Use Railway run to provide ADMIN_SECRET without printing credentials.
Expiry is exclusive. For Oct 1 through Oct 30 in Taiwan, pass:
--starts-at 2026-10-01T00:00:00+08:00 --expires-at 2026-10-31T00:00:00+08:00
"""

import argparse
import json
import os
import sys
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("uids", nargs="+")
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--starts-at", required=True)
    parser.add_argument("--expires-at", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path, help="Save the before/after audit response")
    args = parser.parse_args()
    secret = os.environ.get("NOVA_ADMIN_SECRET") or os.environ.get("ADMIN_SECRET")
    if not secret:
        parser.error("ADMIN_SECRET or NOVA_ADMIN_SECRET is required")
    body = {"uids": args.uids, "starts_at": args.starts_at, "expires_at": args.expires_at, "apply": args.apply}
    try:
        response = httpx.put(args.api_url.rstrip("/") + "/api/v1/admin/users/membership-window", json=body, headers={"X-Admin-Key": secret}, timeout=30)
    except httpx.HTTPError as exc:
        print(f"Request failed: {type(exc).__name__}", file=sys.stderr)
        return 1
    if response.status_code != 200:
        print(f"HTTP {response.status_code}: {response.text}", file=sys.stderr)
        return 1
    result = response.json()
    report = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        args.report.write_text(report + "\n", encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
