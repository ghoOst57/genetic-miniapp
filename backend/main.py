"""
FastAPI Backend for Telegram Mini App — Genetic Doctor

Features:
- Auth: verify Telegram WebApp initData (HMAC SHA-256)
- REST:
  - GET  /doctor/{id}
  - GET  /doctor/{id}/awards
  - GET  /doctor/{id}/review-assets
  - GET  /doctor/{id}/availability?from=ISO&to=ISO&format=any|online|offline
  - POST /booking { availability_id, contact?, note?, name? } -> prevents double-booking
  - GET  /booking/{id}
- Storage: SQLite (SQLAlchemy) for bookings; awards & review-assets are in-memory seeds
- Time: availability slots stored/returned in UTC, 60 minutes each; displayed as MSK on frontend
- CORS enabled for local dev

Run locally:
  1) python -m venv .venv && source .venv/bin/activate
  2) pip install fastapi uvicorn[standard] python-dotenv sqlalchemy pydantic
  3) export BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"  # or create .env with BOT_TOKEN=...
  4) uvicorn main:app --reload --port 8000

Notes:
- In dev mode, if BOT_TOKEN is not provided, /auth/verify returns ok=True with warning.
- Availability is generated on the fly (weekdays 10:00–18:00 MSK, skip 12:00 and 15:00). Formats alternate by hour.
- Booking enforces uniqueness by availability_id. Concurrency-safe via UNIQUE constraint.
"""

from __future__ import annotations

import hmac
import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    create_engine,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# ===================== ENV / APP =====================
load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")

app = FastAPI(title="Genetic MiniApp API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================== DB (SQLite) =====================
from sqlalchemy import create_engine
import os, pathlib

def pick_writable_dir():
    for candidate in ["/data", "/var/data", "/tmp", os.getcwd()]:
        try:
            pathlib.Path(candidate).mkdir(parents=True, exist_ok=True)
            if os.access(candidate, os.W_OK):
                return candidate
        except Exception:
            continue
    return os.getcwd()

DB_DIR = pick_writable_dir()  # на Render без диска это будет /tmp
DB_PATH = os.path.join(DB_DIR, "genetic.db")
DB_URL  = f"sqlite:///{DB_PATH}"  # абсолютный путь -> 'sqlite:////...'

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})


class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    availability_id = Column(String, nullable=False)
    start_utc = Column(DateTime(timezone=True), nullable=False)
    end_utc = Column(DateTime(timezone=True), nullable=False)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("availability_id", name="uq_booking_availability"),
    )


Base.metadata.create_all(bind=engine)

# ===================== CONST / TIME HELPERS =====================
MSK_OFFSET = timedelta(hours=3)  # Europe/Moscow (no DST)


def to_utc_from_msk(dt: datetime) -> datetime:
    # Assume naive dt is MSK
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)  # temp set UTC then shift
        dt = dt - MSK_OFFSET
        return dt
    return (dt - MSK_OFFSET).astimezone(timezone.utc)


def to_msk_from_utc(dt: datetime) -> datetime:
    return (dt + MSK_OFFSET).astimezone(timezone.utc)


# ===================== TELEGRAM INITDATA VERIFICATION =====================
class VerifyRequest(BaseModel):
    initData: Optional[str] = Field(None, description="Telegram WebApp initData string")


class VerifyResponse(BaseModel):
    ok: bool
    dev_mode: bool = False
    user: Optional[Dict[str, Any]] = None
    warning: Optional[str] = None


def verify_init_data(init_data: str, bot_token: str) -> Dict[str, Any]:
    """Verify Telegram WebApp initData according to official docs.
    Steps:
      - parse query-string-like initData into dict
      - extract 'hash'; compute HMAC-SHA256 of data-check-string using secret key = HMAC_SHA256("WebAppData", bot_token)
      - compare with provided hash
    Returns parsed init data (including user) if valid, else raises.
    """
    # Parse like key=value&key2=value2
    import urllib.parse as up

    parts = init_data.split("&")
    kv: Dict[str, str] = {}
    for p in parts:
        if not p:
            continue
        if "=" not in p:
            continue
        k, v = p.split("=", 1)
        kv[k] = up.unquote_plus(v)

    provided_hash = kv.pop("hash", None)
    if not provided_hash:
        raise HTTPException(status_code=400, detail="hash is missing")

    # Build data-check-string
    data_check_pairs = [f"{k}={kv[k]}" for k in sorted(kv.keys())]
    data_check_string = "\n".join(data_check_pairs)

    secret_key = hmac.new("WebAppData".encode(), bot_token.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calc_hash, provided_hash):
        raise HTTPException(status_code=401, detail="initData verification failed")

    # decode JSON fields
    import json

    out: Dict[str, Any] = {}
    for k, v in kv.items():
        if k in {"user", "receiver", "chat", "can_send_after"}:
            try:
                out[k] = json.loads(v)
            except Exception:
                out[k] = v
        else:
            out[k] = v
    return out


@app.post("/auth/verify", response_model=VerifyResponse)
def auth_verify(body: VerifyRequest):
    if not BOT_TOKEN:
        return VerifyResponse(ok=True, dev_mode=True, user=None, warning="BOT_TOKEN not set — dev mode")
    if not body.initData:
        raise HTTPException(status_code=400, detail="initData required")
    data = verify_init_data(body.initData, BOT_TOKEN)
    return VerifyResponse(ok=True, user=data.get("user"))


# ===================== DOCTOR / CONTENT =====================
class DoctorOut(BaseModel):
    id: str
    name: str
    title: str
    years_experience: int
    city: str
    formats: List[Literal["online", "offline"]]
    languages: List[str]
    photo_url: str
    bio: str


DOCTOR = DoctorOut(
    id="doc-1",
    name="Екатерина Иванова",
    title="Врач-генетик",
    years_experience=12,
    city="Москва",
    formats=["online", "offline"],
    languages=["ru", "en"],
    photo_url="https://images.unsplash.com/photo-1550831107-1553da8c8464?q=80&w=800&auto=format&fit=crop",
    bio="Клинический генетик, консультирование семейных рисков, интерпретация NGS-данных, пренатальная диагностика.",
)


class AwardOut(BaseModel):
    id: str
    type: Literal["diploma", "certificate", "award", "publication"]
    title: str
    issuer: str
    date: str
    image_url: str
    description: Optional[str] = None


AWARDS: List[AwardOut] = [
    AwardOut(
        id="aw1",
        type="certificate",
        title="Сертификат: Клиническая генетика",
        issuer="РМАПО",
        date="2023-05-12",
        image_url="https://images.unsplash.com/photo-1454165205744-3b78555e5572?q=80&w=1600&auto=format&fit=crop",
        description="Повышение квалификации по клинической генетике",
    ),
    AwardOut(
        id="aw2",
        type="award",
        title="Премия за вклад в пренатальную диагностику",
        issuer="Ассоциация генетиков",
        date="2022-11-03",
        image_url="https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?q=80&w=1600&auto=format&fit=crop",
        description="Награда за научно-практические достижения",
    ),
]


class ReviewAssetOut(BaseModel):
    id: str
    image_url: str
    source: Optional[str] = None
    date: Optional[str] = None
    caption: Optional[str] = None


REVIEWS: List[ReviewAssetOut] = [
    ReviewAssetOut(id="rev1", image_url="https://images.unsplash.com/photo-1526366003456-2c7c28bf1c66?w=1200&auto=format&fit=crop", source="instagram"),
    ReviewAssetOut(id="rev2", image_url="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&auto=format&fit=crop", source="whatsapp"),
    ReviewAssetOut(id="rev3", image_url="https://images.unsplash.com/photo-1515165562835-c3b8c5a55dca?w=1200&auto=format&fit=crop"),
    ReviewAssetOut(id="rev4", image_url="https://images.unsplash.com/photo-1557426272-fc759fdf7a8d?w=1200&auto=format&fit=crop"),
]


@app.get("/doctor/{doctor_id}", response_model=DoctorOut)
def get_doctor(doctor_id: str):
    if doctor_id != DOCTOR.id:
        raise HTTPException(status_code=404, detail="doctor not found")
    return DOCTOR


@app.get("/doctor/{doctor_id}/awards", response_model=List[AwardOut])
def get_awards(doctor_id: str, type: Optional[str] = Query(None)):
    if doctor_id != DOCTOR.id:
        raise HTTPException(status_code=404, detail="doctor not found")
    items = AWARDS
    if type:
        items = [a for a in items if a.type == type]
    return items


class ReviewListResponse(BaseModel):
    items: List[ReviewAssetOut]
    total: int


@app.get("/doctor/{doctor_id}/review-assets", response_model=ReviewListResponse)
def get_reviews(doctor_id: str, offset: int = 0, limit: int = 12):
    if doctor_id != DOCTOR.id:
        raise HTTPException(status_code=404, detail="doctor not found")
    total = len(REVIEWS)
    return ReviewListResponse(items=REVIEWS[offset : offset + limit], total=total)


# ===================== AVAILABILITY =====================
class AvailabilityOut(BaseModel):
    id: str
    startUtcISO: str
    endUtcISO: str
    format: Literal["online", "offline"]


@app.get("/doctor/{doctor_id}/availability", response_model=List[AvailabilityOut])
def get_availability(
    doctor_id: str,
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    format: Literal["any", "online", "offline"] = "any",
):
    if doctor_id != DOCTOR.id:
        raise HTTPException(status_code=404, detail="doctor not found")

    try:
        from_dt_utc = datetime.fromisoformat(from_.replace("Z", "+00:00"))
        to_dt_utc = datetime.fromisoformat(to.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid date range")

    # Generate weekday slots between from..to (inclusive of days)
    slots: List[AvailabilityOut] = []
    day = from_dt_utc
    while day.date() <= to_dt_utc.date():
        # consider local MSK date for weekday/weekend logic
        msk_day = day + MSK_OFFSET
        if msk_day.weekday() < 5:  # 0..4 Mon-Fri
            for hour in range(10, 18):
                if hour in (12, 15):
                    continue  # blocked hours
                start_msk = datetime(msk_day.year, msk_day.month, msk_day.day, hour, 0, 0, tzinfo=timezone.utc) - MSK_OFFSET
                end_msk = start_msk + timedelta(hours=1)
                f = "online" if (hour % 2 == 0) else "offline"
                if format != "any" and f != format:
                    continue
                slot_id = f"{start_msk.date()}-{hour:02d}-{f}"
                slots.append(
                    AvailabilityOut(
                        id=slot_id,
                        startUtcISO=start_msk.isoformat().replace("+00:00", "Z"),
                        endUtcISO=end_msk.isoformat().replace("+00:00", "Z"),
                        format=f,  
                    )
                )
        day = (day + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return slots


# ===================== BOOKING =====================
class BookingIn(BaseModel):
    availability_id: str
    contact: Optional[Dict[str, Optional[str]]] = None
    note: Optional[str] = None
    name: Optional[str] = None


class BookingOut(BaseModel):
    booking_id: int
    start_utc: str
    end_utc: str


@app.post("/booking", response_model=BookingOut)
def create_booking(payload: BookingIn):
    # Parse slot id back to datetime for consistency
    try:
        # slot_id pattern: YYYY-MM-DD-HH-format in UTC date (start_msk shifted)
        date_part, hour_part, fmt = payload.availability_id.split("-")
        y, m, d = map(int, date_part.split("-"))
        hour = int(hour_part)
        start_utc = datetime(y, m, d, hour, 0, 0, tzinfo=timezone.utc)
        end_utc = start_utc + timedelta(hours=1)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid availability_id")

    db = SessionLocal()
    try:
        bk = Booking(
            availability_id=payload.availability_id,
            start_utc=start_utc,
            end_utc=end_utc,
            name=payload.name,
            phone=(payload.contact or {}).get("phone"),
            email=(payload.contact or {}).get("email"),
            note=payload.note,
        )
        db.add(bk)
        db.commit()
        db.refresh(bk)
        return BookingOut(booking_id=bk.id, start_utc=bk.start_utc.isoformat().replace("+00:00", "Z"), end_utc=bk.end_utc.isoformat().replace("+00:00", "Z"))
    except Exception as e:
        db.rollback()
        # Likely unique constraint violation (already booked)
        raise HTTPException(status_code=409, detail="slot already booked")
    finally:
        db.close()


@app.get("/booking/{booking_id}", response_model=BookingOut)
def get_booking(booking_id: int):
    db = SessionLocal()
    try:
        bk = db.query(Booking).filter(Booking.id == booking_id).first()
        if not bk:
            raise HTTPException(status_code=404, detail="not found")
        return BookingOut(booking_id=bk.id, start_utc=bk.start_utc.isoformat().replace("+00:00", "Z"), end_utc=bk.end_utc.isoformat().replace("+00:00", "Z"))
    finally:
        db.close()


# ===================== SIMPLE ALIASES FOR FRONTEND =====================
class AvailabilityAliasOut(BaseModel):
    id: str
    start_utc: str
    end_utc: str
    format: Literal["online", "offline"]


@app.get("/doctor", response_model=DoctorOut)
def get_doctor_alias():
    return DOCTOR


@app.get("/awards", response_model=List[AwardOut])
def get_awards_alias(type: Optional[str] = Query(None)):
    items = AWARDS
    if type:
        items = [a for a in items if a.type == type]
    return items


@app.get("/reviews", response_model=List[ReviewAssetOut])
def get_reviews_alias(offset: int = 0, limit: int = 12):
    return REVIEWS[offset : offset + limit]


@app.get("/availability", response_model=List[AvailabilityAliasOut])
def get_availability_alias(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    format: Literal["any", "online", "offline"] = "any",
):
    try:
        from_dt_utc = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
        to_dt_utc = datetime.fromisoformat(to_date).replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid date range")

    slots: List[AvailabilityAliasOut] = []
    day = from_dt_utc
    while day.date() <= to_dt_utc.date():
        msk_day = day + MSK_OFFSET
        if msk_day.weekday() < 5:
            for hour in range(10, 18):
                if hour in (12, 15):
                    continue
                start_msk = datetime(msk_day.year, msk_day.month, msk_day.day, hour, 0, 0, tzinfo=timezone.utc) - MSK_OFFSET
                end_msk = start_msk + timedelta(hours=1)
                f = "online" if (hour % 2 == 0) else "offline"
                if format != "any" and f != format:
                    continue
                slot_id = f"{start_msk.date()}-{hour:02d}-{f}"
                slots.append(AvailabilityAliasOut(
                    id=slot_id,
                    start_utc=start_msk.isoformat().replace("+00:00", "Z"),
                    end_utc=end_msk.isoformat().replace("+00:00", "Z"),
                    format=f,
                ))
        day = (day + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return slots

# ===================== HEALTH =====================
@app.get("/health")
def health():
    return {"ok": True}

# ============== Local runner (Windows-friendly) ==============
# Позволяет запустить сервер командой: python main.py
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
