"""Private manual trades. Every database lookup is scoped to the JWT user."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import require_member_user
from app.db import get_db
from app.models import Trade

router = APIRouter(prefix="/trades", tags=["trades"])


class TradeInput(BaseModel):
    symbol: str = Field(min_length=1, max_length=64)
    market: Literal["crypto", "futures", "other"] = "crypto"
    currency: str = Field(default="USD", min_length=1, max_length=12)
    side: Literal["long", "short"]
    entry_at: datetime
    exit_at: datetime
    entry_price: Decimal = Field(gt=0, max_digits=24, decimal_places=8)
    exit_price: Decimal = Field(gt=0, max_digits=24, decimal_places=8)
    quantity: Decimal = Field(gt=0, max_digits=24, decimal_places=8)
    point_value: Decimal = Field(default=Decimal("1"), gt=0, max_digits=24, decimal_places=8)
    fees: Decimal = Field(default=Decimal("0"), ge=0, max_digits=24, decimal_places=8)
    strategy: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def valid_times(self):
        if self.entry_at.tzinfo is None or self.exit_at.tzinfo is None:
            raise ValueError("times_must_include_timezone")
        if self.exit_at < self.entry_at:
            raise ValueError("exit_before_entry")
        return self


def serialize(row: Trade) -> dict:
    def utc(value: datetime) -> str:
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()
    return {
        "id": row.id,
        "symbol": row.symbol,
        "market": row.market,
        "currency": row.currency,
        "side": row.side,
        "entry_at": utc(row.entry_at),
        "exit_at": utc(row.exit_at),
        "entry_price": str(row.entry_price),
        "exit_price": str(row.exit_price),
        "quantity": str(row.quantity),
        "point_value": str(row.point_value),
        "fees": str(row.fees),
        "net_pnl": str(row.net_pnl),
        "strategy": row.strategy,
        "note": row.note,
    }


def apply_input(row: Trade, data: TradeInput) -> None:
    for key in ("symbol", "market", "currency", "side", "entry_at", "exit_at", "entry_price", "exit_price", "quantity", "point_value", "fees", "strategy", "note"):
        setattr(row, key, getattr(data, key))
    row.entry_at = data.entry_at.astimezone(UTC)
    row.exit_at = data.exit_at.astimezone(UTC)
    row.symbol = row.symbol.strip().upper()
    row.currency = row.currency.strip().upper()
    if not row.symbol or not row.currency:
        raise HTTPException(status_code=422, detail="symbol_and_currency_required")
    sign = Decimal("1") if row.side == "long" else Decimal("-1")
    row.net_pnl = (row.exit_price - row.entry_price) * row.quantity * row.point_value * sign - row.fees
    if abs(row.net_pnl) >= Decimal("10000000000000000"):
        raise HTTPException(status_code=422, detail="pnl_out_of_range")


def own_trade(db: Session, trade_id: int, user_id: int) -> Trade:
    row = db.scalar(select(Trade).where(Trade.id == trade_id, Trade.owner_id == user_id))
    if row is None:
        raise HTTPException(status_code=404, detail="trade_not_found")
    return row


@router.get("")
def list_trades(user=Depends(require_member_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Trade).where(Trade.owner_id == user.id).order_by(Trade.exit_at.desc(), Trade.id.desc())).all()
    return [serialize(row) for row in rows]


@router.post("", status_code=201)
def create_trade(data: TradeInput, user=Depends(require_member_user), db: Session = Depends(get_db)) -> dict:
    row = Trade(owner_id=user.id)
    apply_input(row, data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return serialize(row)


@router.put("/{trade_id}")
def update_trade(trade_id: int, data: TradeInput, user=Depends(require_member_user), db: Session = Depends(get_db)) -> dict:
    row = own_trade(db, trade_id, user.id)
    apply_input(row, data)
    db.commit()
    return serialize(row)


@router.delete("/{trade_id}", status_code=204)
def delete_trade(trade_id: int, user=Depends(require_member_user), db: Session = Depends(get_db)) -> None:
    row = own_trade(db, trade_id, user.id)
    db.delete(row)
    db.commit()
