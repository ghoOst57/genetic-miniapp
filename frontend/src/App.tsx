// @ts-nocheck
import React, { useEffect, useMemo, useState, useCallback } from "react";

/** ==== БАЗА API ==== */
const API_BASE = (window as any).__API_BASE__ || import.meta.env.VITE_API_BASE || "";

/** ==== КОНСТАНТЫ UI ==== */
const MAX_W = "max-w-[328px]"; // ещё уже — под Telegram
const DOC_DISPLAY_NAME = "Андреева Наталия Игоревна";
const DOCTOR_PHOTO = "/doctor.jpg?v=2";

// Локальные изображения дипломов/наград из public/awards/
const LOCAL_AWARDS = [
  "/awards/award1.jpg",
  "/awards/award2.jpg",
  "/awards/award3.jpg",
  "/awards/award4.jpg",
  "/awards/award5.jpg",
  "/awards/award6.jpg",
];

/** ==== ТИПЫ ==== */
type Format = "online" | "offline";
type Slot = { id: string; start_utc: string; end_utc: string; format: Format; is_booked?: boolean };
type ReviewAsset = { id: string; image_url: string; source?: string; date?: string; caption?: string };
type Doctor = {
  id: string;
  name: string;
  title: string;
  years_experience: number;
  city: string;
  formats: Format[];
  languages: string[];
  photo_url: string;
  bio: string;
};

/** ==== ХЕЛПЕРЫ ==== */
const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const fmtTimeMSK = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Moscow",
  }).format(new Date(iso));

/** ==== СКЕЛЕТОНЫ ==== */
const Shimmer = "animate-pulse bg-black/10 dark:bg-white/10 rounded";
const SkLine = ({ h = 12, w = "100%" }: { h?: number; w?: string }) => (
  <div className={`${Shimmer}`} style={{ height: h, width: w }} />
);
const SkAvatar = ({ size = 64 }: { size?: number }) => (
  <div className={`${Shimmer} rounded-full`} style={{ width: size, height: size }} />
);

/** ==== БАЗОВЫЕ КОМПОНЕНТЫ ==== */
const Section = ({
  children,
  className = "",
}: React.PropsWithChildren<{ className?: string }>) => (
  <section
    className={[
      "mx-3 mb-3 rounded-2xl border",
      "border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]",
      "bg-[rgba(255,255,255,.9)] dark:bg-[rgba(17,24,39,.7)]",
      "backdrop-blur shadow-[0_6px_20px_-8px_rgba(0,0,0,.15)]",
      "fade-in p-3",
      className,
    ].join(" ")}
  >
    {children}
  </section>
);

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="px-2 py-1 rounded-full text-[11px] bg-black/5 dark:bg-white/10">{children}</span>
);

/** ==== ПОЛОСА ДНЕЙ (компакт) ==== */
function DayStrip({
  start,
  days,
  value,
  onChange,
}: {
  start: Date;
  days: number;
  value: string;
  onChange: (isoDate: string) => void;
}) {
  const items = useMemo(() => {
    const arr: { key: string; top: string; bottom: string }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const key = toYMD(d);
      const isToday = i === 0;
      const top = isToday
        ? "Сегодня"
        : d.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
      const bottom = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      arr.push({ key, top, bottom });
    }
    return arr;
  }, [start, days]);

  return (
    <div className={`${MAX_W} mx-auto flex gap-1.5 overflow-x-auto no-scrollbar py-1.5 px-1 -mx-1`}>
      {items.map((d) => {
        const active = d.key === value;
        return (
          <button
            key={d.key}
            onClick={() => onChange(d.key)}
            className={[
              "shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] border transition-all",
              active
                ? "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] border-transparent shadow"
                : "bg-[rgba(0,0,0,.04)] dark:bg-[rgba(255,255,255,.08)] border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] text-[color:var(--tg-theme-text-color,#111827)]/90",
            ].join(" ")}
          >
            <div className="leading-none">{d.top}</div>
            <div className="text-[10px] opacity-75">{d.bottom}</div>
          </button>
        );
      })}
    </div>
  );
}

/** ==== СПИСОК СЛОТОВ (компакт) ==== */
function SlotsList({
  slots,
  selected,
  onPick,
  loading = false,
}: {
  slots: Slot[];
  selected?: string;
  onPick: (id: string) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className={`${MAX_W} mx-auto flex flex-col gap-1.5 px-1`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${Shimmer} h-9 rounded-lg`} />
        ))}
      </div>
    );
  }
  if (!slots.length) {
    return (
      <div className={`${MAX_W} mx-auto text-center text-sm text-[color:var(--tg-theme-hint-color,#6b7280)] py-3`}>
        На этот день свободных слотов нет
      </div>
    );
  }
  return (
    <div className={`${MAX_W} mx-auto flex flex-col gap-1.25 px-1`}>
      {slots.map((s) => {
        const label = fmtTimeMSK(s.start_utc);
        const busy = !!s.is_booked;
        const active = selected === s.id && !busy;

        const base =
          "w-full h-9 rounded-lg border text-[12.5px] font-medium transition flex items-center justify-between px-3";
        const clsBusy = "bg-[#ef4444] text-white border-[#ef4444] cursor-not-allowed";
        const clsActive = "bg-[#10b981] text-white border-[#10b981]";
        const clsIdle =
          "bg-[rgba(0,0,0,.04)] dark:bg-[rgba(255,255,255,.08)] border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] text-[color:var(--tg-theme-text-color,#111827)]/90 hover:opacity-90";

        return (
          <button
            key={s.id}
            disabled={busy}
            onClick={() => onPick(s.id)}
            className={[base, busy ? clsBusy : active ? clsActive : clsIdle].join(" ")}
          >
            <span>{label}</span>
            <span className="text-[10.5px] opacity-90">
              {busy ? "Занято" : active ? "Выбрано" : "Свободно"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** ==== ЛАЙТБОКС ДЛЯ НАГРАД ==== */
function useKey(handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}
function Lightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useKey(
    useCallback(
      (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowLeft") onPrev();
        if (e.key === "ArrowRight") onNext();
      },
      [onClose, onPrev, onNext]
    )
  );

  const src = images[index];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <img
        src={src}
        alt=""
        className="max-h-[88vh] max-w-[92vw] object-contain rounded-xl shadow"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/15 text-white text-xl leading-none flex items-center justify-center"
      >
        ×
      </button>
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white text-lg"
            aria-label="Предыдущий"
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white text-lg"
            aria-label="Следующий"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

/** ==== ГЛАВНЫЙ КОМПОНЕНТ ==== */
export default function App() {
  const tg = (window as any).Telegram?.WebApp;

  // Табы
  const [tab, setTab] = useState<"profile" | "book" | "awards" | "reviews">("profile");

  // Данные + загрузка
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(true);

  const [reviews, setReviews] = useState<ReviewAsset[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Расписание
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [activeDate, setActiveDate] = useState<string>(toYMD(today));
  const [format, setFormat] = useState<"any" | Format>("any");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  // Форма
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Лайтбокс
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);
  const lbPrev = () => setLbIndex((i) => (i - 1 + LOCAL_AWARDS.length) % LOCAL_AWARDS.length);
  const lbNext = () => setLbIndex((i) => (i + 1) % LOCAL_AWARDS.length);

  /** Telegram init */
  useEffect(() => {
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.MainButton?.hide?.();
    } catch {}
  }, [tg]);

  /** Загрузка профиля */
  useEffect(() => {
    setDoctorLoading(true);
    fetch(`${API_BASE}/doctor`)
      .then((r) => r.json())
      .then((d) => setDoctor(d))
      .catch(() => {})
      .finally(() => setDoctorLoading(false));
  }, []);

  /** Загрузка отзывов при открытии соответствующей вкладки */
  useEffect(() => {
    if (tab === "reviews" && reviews.length === 0) {
      setReviewsLoading(true);
      fetch(`${API_BASE}/reviews`)
        .then((r) => r.json())
        .then((arr: ReviewAsset[]) => setReviews(arr))
        .catch(() => {})
        .finally(() => setReviewsLoading(false));
    }
  }, [tab, reviews.length]);

  /** Загрузка слотов (по дню/формату) — только на вкладке «Запись» */
  const loadDay = (iso: string, fmt: "any" | Format) => {
    const from = iso;
    const to = iso;
    setSlotsLoading(true);
    fetch(`${API_BASE}/availability?from_date=${from}&to_date=${to}&format=${fmt}`)
      .then((r) => r.json())
      .then((arr: Slot[]) => {
        const normalized = arr.map((s) => ({ ...s, is_booked: !!s.is_booked }));
        setSlots(normalized);
        setSelectedSlot("");
      })
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  };
  useEffect(() => {
    if (tab === "book") loadDay(activeDate, format);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeDate, format]);

  /** Создание брони */
  const onBook = async () => {
    const selected = slots.find((s) => s.id === selectedSlot);
    if (!selected) {
      tg?.showAlert?.("Выберите время");
      return;
    }
    if (selected.is_booked) {
      tg?.showAlert?.("Слот уже занят. Выберите другое время.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability_id: selected.id,
          name: name || undefined,
          note: note || undefined,
          contact: { phone: phone || undefined },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      // .ics
      const fmt = (s: string) => s.replace(/[-:]/g, "").replace(".000Z", "Z");
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Genetic MiniApp//RU
BEGIN:VEVENT
UID:${data.booking_id}@genetic
DTSTAMP:${fmt(selected.start_utc)}
DTSTART:${fmt(selected.start_utc)}
DTEND:${fmt(selected.end_utc)}
SUMMARY:Консультация генетика
DESCRIPTION:Формат: ${selected.format}
END:VEVENT
END:VCALENDAR`;
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `booking-${data.booking_id}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      tg?.showAlert?.("Запись подтверждена!");
      loadDay(activeDate, format);
      setSelectedSlot("");
      setName("");
      setPhone("");
      setNote("");
    } catch {
      tg?.showAlert?.("Не удалось создать запись. Попробуйте другой слот.");
    } finally {
      setBusy(false);
    }
  };

  /** ===== RENDER ===== */
  return (
    <div className="min-h-[100svh] text-[color:var(--tg-theme-text-color,#111827)] overflow-x-hidden bg-[linear-gradient(180deg,rgba(20,184,166,.10)_0%,rgba(59,130,246,.06)_30%,transparent_70%)]">
      {/* Хедер: заголовок СВЕРХУ и ниже табы */}
      <header className="sticky top-0 z-10 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/92 border-b border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
        <div className={`${MAX_W} mx-auto px-3 py-2 flex flex-col gap-1.5`}>
          <h1 className="text-[15px] font-semibold truncate">Запись к врачу-генетику</h1>
          <div
            className="flex gap-1 rounded-xl p-1
                       bg-[rgba(0,0,0,.05)] dark:bg-[rgba(255,255,255,.07)]
                       border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]
                       overflow-x-auto no-scrollbar"
          >
            {([
              ["profile", "О враче"],
              ["book", "Запись"],
              ["awards", "Дипломы/награды"],
              ["reviews", "Отзывы"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={
                  [
                    "px-2 h-8 rounded-md text-[12px] leading-none whitespace-nowrap shrink-0",
                    "font-medium transition",
                    tab === k
                      ? "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] shadow"
                      : "text-[color:var(--tg-theme-text-color,#111827)]/90 hover:opacity-90",
                  ].join(" ")
                }
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ПРОФИЛЬ */}
      {tab === "profile" && (
        <div className="fade-in">
          {/* HERO */}
          <div className={`${MAX_W} mx-auto px-3 pt-3`}>
            <div className="relative rounded-3xl overflow-hidden border border-white/30 dark:border-white/10 shadow-[0_20px_50px_-20px_rgba(0,0,0,.35)]">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-cyan-500 to-indigo-500 opacity-90" />
              <img
                src={DOCTOR_PHOTO}
                alt=""
                className="w-full h-44 object-cover mix-blend-soft-light"
                style={{ objectPosition: "50% 18%" }}
                loading="eager"
                decoding="async"
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.25),transparent_40%)]" />
              <div className="relative p-4 text-white">
                <div className="flex items-center gap-3">
                  {doctorLoading ? (
                    <>
                      <SkAvatar size={64} />
                      <div className="grow space-y-2">
                        <SkLine h={14} w="70%" />
                        <SkLine h={10} w="50%" />
                      </div>
                    </>
                  ) : (
                    <>
                      <img
                        src={DOCTOR_PHOTO}
                        className="w-16 h-16 rounded-full object-cover ring-2 ring-white/60"
                        alt=""
                      />
                      <div className="min-w-0">
                        <div className="text-[16px] font-semibold leading-tight">{DOC_DISPLAY_NAME}</div>
                        <div className="text-[12.5px] opacity-90">
                          {doctor?.title || "Врач-генетик"} • {doctor?.city || "Москва"}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {!doctorLoading && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge>🧬 {doctor?.years_experience || 12} лет практики</Badge>
                    <Badge>🌍 Языки: {(doctor?.languages || ["ru", "en"]).join(", ")}</Badge>
                    <Badge>🗓️ Длительность: 60 мин</Badge>
                    <Badge>
                      💬 {(doctor?.formats || ["online", "offline"]).includes("online") ? "Онлайн" : ""}
                      {(doctor?.formats || ["online", "offline"]).includes("offline") ? " · Офлайн" : ""}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* О специалисте */}
          <Section className={`${MAX_W} mx-auto`}>
            {doctorLoading ? (
              <div className="space-y-2">
                <SkLine h={16} w="40%" />
                <SkLine h={12} />
                <SkLine h={12} w="90%" />
                <SkLine h={12} w="80%" />
              </div>
            ) : (
              <>
                <h2 className="text-[15px] font-semibold mb-2">О специалисте</h2>
                <p className="text-[13px] leading-relaxed">
                  Клинический генетик. Индивидуальные планы обследования, интерпретация NGS-панелей,
                  пренатальная и предиктивная генетика, наследственные синдромы. Работа с семейными
                  рисками, составление генеалогического древа, рекомендации по скринингам.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  {/* Образование */}
                  <div className="p-3 rounded-xl bg-black/5 dark:bg-white/10">
                    <div className="text-[12px] opacity-70">Образование</div>
                    <div className="mt-1 text-[13px] font-medium space-y-1.5">
                      <p>
                        Медицинский институт Орловского государственного университета им. И.С. Тургенева,
                        лечебное дело (2018)
                      </p>
                      <p>Медико-генетический научный центр, ординатура по генетике (2021)</p>
                    </div>
                  </div>

                  {/* Повышение квалификации */}
                  <div className="p-3 rounded-xl bg-black/5 dark:bg-white/10">
                    <div className="text-[12px] opacity-70">Повышение квалификации</div>
                    <div className="mt-1 text-[13px] font-medium">
                      Школа анализа NGS данных «MGNGS School'22» (2022)
                    </div>
                  </div>
                </div>
              </>
            )}
          </Section>

          {/* Направления и CTA */}
          <Section className={`${MAX_W} mx-auto`}>
            {doctorLoading ? (
              <div className="space-y-2">
                <SkLine h={16} w="60%" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkLine key={i} h={12} />
                ))}
              </div>
            ) : (
              <>
                <h2 className="text-[15px] font-semibold mb-2">Ключевые направления</h2>
                <ul className="text-[13px] space-y-1.5">
                  <li>• Консультация пар при планировании беременности</li>
                  <li>• Интерпретация результатов NGS / WES / панелей</li>
                  <li>• Ведение пациентов с наследственными синдромами</li>
                  <li>• Подбор лабораторных тестов, маршрутизация</li>
                </ul>

                <div className="mt-3">
                  <h3 className="text-[14px] font-medium mb-1">Услуги и ориентировочные тарифы</h3>
                  <div className="grid grid-cols-1 gap-1.5 text-[13px]">
                    <div className="flex items-center justify-between rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2">
                      <span>Первичная консультация (60 мин)</span>
                      <span className="font-semibold">5 000–7 000 ₽</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-black/5 dark:bg-white/10 px-3 py-2">
                      <span>Повторная консультация (60 мин)</span>
                      <span className="font-semibold">4 000–6 000 ₽</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    onClick={() => setTab("book")}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl
                               bg-[var(--tg-theme-button-color,#10b981)]
                               text-[var(--tg-theme-button-text-color,#fff)]
                               text-[12.5px] leading-snug font-semibold text-center
                               whitespace-normal break-keep shadow"
                  >
                    Записаться на консультацию
                  </button>
                </div>
              </>
            )}
          </Section>
        </div>
      )}

      {/* ЗАПИСЬ */}
      {tab === "book" && (
        <div className="fade-in">
          <Section className={`${MAX_W} mx-auto`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] opacity-80">Формат</span>
              <div className="flex gap-1 rounded-xl p-1 bg-[rgba(0,0,0,.05)] dark:bg-[rgba(255,255,255,.07)] border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] overflow-x-auto no-scrollbar">
                {(["any", "online", "offline"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={
                      "px-2 h-8 rounded-md text-[12.5px] transition " +
                      (format === f
                        ? "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] shadow"
                        : "opacity-90")
                    }
                  >
                    {f === "any" ? "Все" : f === "online" ? "Онлайн" : "Офлайн"}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section className={`${MAX_W} mx-auto`}>
            <DayStrip start={today} days={14} value={activeDate} onChange={setActiveDate} />
            <SlotsList slots={slots} selected={selectedSlot} onPick={setSelectedSlot} loading={slotsLoading} />
          </Section>

          <Section className={`${MAX_W} mx-auto`}>
            <div className="grid gap-2">
              <input
                className="h-10 rounded-xl border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white/70 dark:bg-white/5 px-3 text-sm"
                placeholder="Ваше имя (необязательно)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="h-10 rounded-xl border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white/70 dark:bg-white/5 px-3 text-sm"
                placeholder="Телефон"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <textarea
                className="min-h-[80px] rounded-xl border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white/70 dark:bg-white/5 px-3 py-2 text-sm"
                placeholder="Комментарий (необязательно)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="text-[12px] text-[color:var(--tg-theme-hint-color,#6b7280)]">
                Нажимая «Записаться», вы соглашаетесь на обработку персональных данных.
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ДИПЛОМЫ/НАГРАДЫ */}
      {tab === "awards" && (
        <div className={`${MAX_W} mx-auto p-3 grid grid-cols-2 gap-3 fade-in`}>
          {LOCAL_AWARDS.map((src, i) => (
            <figure
              key={src}
              className="rounded-2xl overflow-hidden border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white/80 dark:bg-white/5 backdrop-blur active:opacity-90"
              onClick={() => {
                setLbIndex(i);
                setLbOpen(true);
              }}
            >
              <img
                src={src}
                alt={`Диплом/награда ${i + 1}`}
                className="w-full h-40 object-cover"
                loading="lazy"
                decoding="async"
              />
            </figure>
          ))}

          {lbOpen && (
            <Lightbox
              images={LOCAL_AWARDS}
              index={lbIndex}
              onClose={() => setLbOpen(false)}
              onPrev={lbPrev}
              onNext={lbNext}
            />
          )}
        </div>
      )}

      {/* ОТЗЫВЫ */}
      {tab === "reviews" && (
        <div className={`${MAX_W} mx-auto p-3 grid grid-cols-2 gap-3 fade-in`}>
          {reviewsLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${Shimmer} h-44 rounded-2xl`} />
            ))}
          {!reviewsLoading &&
            reviews.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl overflow-hidden border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white/80 dark:bg-white/5 backdrop-blur"
              >
                <img src={r.image_url} alt="" className="w-full h-44 object-cover" loading="lazy" decoding="async" />
              </div>
            ))}
        </div>
      )}

      {/* ФУТЕР: кнопка подтверждения */}
      {tab === "book" && (
        <footer className="fixed bottom-0 left-0 right-0 z-10 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/92 border-t border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
          <div className={`${MAX_W} mx-auto px-3 py-2 flex items-center gap-2`}>
            <div className="text-[11.5px] opacity-75 truncate">
              {selectedSlot
                ? `Выбрано: ${fmtTimeMSK(slots.find((s) => s.id === selectedSlot)?.start_utc || "")}`
                : "Выберите время и заполните данные"}
            </div>
            <button
              onClick={onBook}
              disabled={busy || !selectedSlot || !!slots.find((s) => s.id === selectedSlot)?.is_booked}
              className={
                "ml-auto h-9 px-3 rounded-xl text-[12.5px] font-medium shadow " +
                (!selectedSlot || busy
                  ? "opacity-60 cursor-not-allowed bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)]"
                  : "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] hover:opacity-95")
              }
            >
              {busy ? "Запись..." : "Записаться"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
