from __future__ import annotations

import hashlib
import hmac
import json
import os
import pathlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    String,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# ===================== ENV & CORS =====================
load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")

# ALLOW_ORIGINS: список доменов через запятую. По умолчанию "*" (для девелопмента)
ALLOW_ORIGINS = [o.strip() for o in os.getenv("ALLOW_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title="Genetic MiniApp API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================== DB (SQLite, Render‑friendly) =====================
# Используем /data (если есть подключённый диск на Render), иначе /tmp. Можно переопределить DATABASE_URL.
DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    base_dir = "/data" if os.path.isdir("/data") else "/tmp"
    pathlib.Path(base_dir).mkdir(parents=True, exist_ok=True)
    DB_URL = f"sqlite:///{base_dir}/genetic.db"  # абсолютный путь

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

# ===================== MODELS =====================
class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    availability_id = Column(String, nullable=False, unique=True)
    start_utc = Column(DateTime(timezone=True), nullable=False)
    end_utc = Column(DateTime(timezone=True), nullable=False)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (UniqueConstraint("availability_id", name="uq_booking_availability"),)


# Создание таблиц после объявления моделей
Base.metadata.create_all(bind=engine)

# ===================== TIME HELPERS (MSK) =====================
MSK_OFFSET = timedelta(hours=3)  # Europe/Moscow (без переходов)


def to_msk_from_utc(dt: datetime) -> datetime:
    return (dt + MSK_OFFSET).astimezone(timezone.utc)


# ===================== TELEGRAM INITDATA VERIFICATION =====================
class VerifyRequest(BaseModel):
    initData: Optional[str] = Field(None, description="Telegram WebApp initData")


class VerifyResponse(BaseModel):
    ok: bool
    dev_mode: bool = False
    user: Optional[Dict[str, Any]] = None
    warning: Optional[str] = None


def verify_init_data(init_data: str, bot_token: str) -> Dict[str, Any]:
    # См. https://core.telegram.org/bots/webapps#initializing-mini-apps
    import urllib.parse as up

    parts = init_data.split("&")
    kv: Dict[str, str] = {}
    for p in parts:
        if not p or "=" not in p:
            continue
        k, v = p.split("=", 1)
        kv[k] = up.unquote_plus(v)

    provided_hash = kv.pop("hash", None)
    if not provided_hash:
        raise HTTPException(status_code=400, detail="hash is missing")

    # data-check-string
    data_check_string = "\n".join(f"{k}={kv[k]}" for k in sorted(kv.keys()))

    secret_key = hmac.new("WebAppData".encode(), bot_token.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calc_hash, provided_hash):
        raise HTTPException(status_code=401, detail="initData verification failed")

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


# ===================== STATIC CONTENT (doctor, awards, reviews) =====================
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
    bio="Клинический генетик: семейные риски, интерпретация NGS, пренатальная диагностика.",
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
        description="Награда за научно‑практические достижения",
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


# ===================== AVAILABILITY =====================
class AvailabilityAliasOut(BaseModel):
    id: str
    start_utc: str
    end_utc: str
    format: Literal["online", "offline"]
    is_booked: bool = False


def _parse_date_param(s: str) -> datetime:
    """Принимает YYYY-MM-DD или ISO; возвращает UTC datetime на начало дня."""
    try:
        if len(s) >= 10:
            y, m, d = int(s[0:4]), int(s[5:7]), int(s[8:10])
            return datetime(y, m, d, tzinfo=timezone.utc)
    except Exception:
        pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid date format")


@app.get("/availability", response_model=List[AvailabilityAliasOut])
def get_availability_alias(
    from_date: str = Query(..., description="YYYY-MM-DD или ISO"),
    to_date: str = Query(..., description="YYYY-MM-DD или ISO"),
    format: Literal["any", "online", "offline"] = "any",
):
    start_day_utc = _parse_date_param(from_date)
    end_day_utc = _parse_date_param(to_date)

    # 👉 добавляем блок получения занятых слотов из БД в диапазоне
    db = SessionLocal()
    try:
        q_start = start_day_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        q_end = end_day_utc.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        rows = db.query(Booking.availability_id)\
                 .filter(Booking.start_utc >= q_start, Booking.start_utc < q_end)\
                 .all()
        booked_ids = {r[0] for r in rows}
    finally:
        db.close()

    slots: List[AvailabilityAliasOut] = []
    day = start_day_utc
    while day.date() <= end_day_utc.date():
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
                    start_utc=start_msk.isoformat().replace("+00:00","Z"),
                    end_utc=end_msk.isoformat().replace("+00:00","Z"),
                    format=f,
                    is_booked=(slot_id in booked_ids),     # ← помечаем занятость
                ))
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


def _parse_slot_id(slot_id: str) -> tuple[datetime, datetime]:
    """Разбирает id формата YYYY-MM-DD-HH-format надёжно (справа налево)."""
    try:
        date_part, hour_part, fmt = slot_id.rsplit("-", 2)  # <- КЛЮЧЕВОЙ ФИКС
        y, m, d = map(int, date_part.split("-"))
        hour = int(hour_part)
        start_utc = datetime(y, m, d, hour, 0, 0, tzinfo=timezone.utc)
        end_utc = start_utc + timedelta(hours=1)
        return start_utc, end_utc
    except Exception:
        raise HTTPException(status_code=400, detail="invalid availability_id")


@app.post("/booking", response_model=BookingOut)
def create_booking(payload: BookingIn):
    start_utc, end_utc = _parse_slot_id(payload.availability_id)
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
    except Exception:
        db.rollback()
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


# ===================== HEALTH =====================
@app.get("/health")
def health():
    return {"ok": True}


# ============== Local runner (Windows‑friendly) ==============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
