// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";

// простая диагностика: покажем алерт, если что-то упадёт на старом вебвью
if (typeof window !== 'undefined') {
  const showOnce = (msg: string) => {
    const w: any = window;
    if (w.__miniapp_err) return;
    w.__miniapp_err = true;
    try { (window as any).Telegram?.WebApp?.showAlert?.(msg); } catch {}
  };
  window.addEventListener('error', (e) => showOnce(`Ошибка загрузки: ${e.message || ''}`));
  window.addEventListener('unhandledrejection', (e: any) => showOnce(`Ошибка: ${e?.reason?.message || 'Неизвестная'}`));
}


/** ==== API base (Vercel env или window.__API_BASE__) ==== */
const API_BASE =
  (window as any).__API_BASE__ || import.meta.env.VITE_API_BASE || "";

/** ==== Константы UI ==== */
const MAX_W = "max-w-[360px]"; // компактная ширина под Telegram (делает «уже»)
const DOC_DISPLAY_NAME = "Андреева Наталия Игоревна";
const DOCTOR_PHOTO = "/doctor.jpg";

/** ==== Типы ==== */
type Format = "online" | "offline";
type Slot = {
  id: string;
  start_utc: string;
  end_utc: string;
  format: Format;
  is_booked?: boolean; // если бэкенд ещё не обновлён — undefined (считаем свободным)
};
type Award = {
  id: string;
  type: string;
  title: string;
  issuer: string;
  date: string;
  image_url: string;
  description?: string;
};
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

/** ==== Хелперы ==== */
const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const fmtTimeMSK = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Moscow",
  }).format(new Date(iso));

/** ==== Мини-компоненты ==== */
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
  <span className="px-2 py-1 rounded-full text-[11px] bg-black/5 dark:bg-white/10">
    {children}
  </span>
);

/** ==== Полоса дней ==== */
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
    <div className={`${MAX_W} mx-auto flex gap-2 overflow-x-auto no-scrollbar py-2 px-1 -mx-1`}>
      {items.map((d) => {
        const active = d.key === value;
        return (
          <button
            key={d.key}
            onClick={() => onChange(d.key)}
            className={[
              "shrink-0 rounded-xl px-3 py-2 text-sm border transition-all",
              active
                ? "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] border-transparent shadow"
                : "bg-[rgba(0,0,0,.04)] dark:bg-[rgba(255,255,255,.08)] border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] text-[color:var(--tg-theme-text-color,#111827)]/90",
            ].join(" ")}
          >
            <div className="leading-none">{d.top}</div>
            <div className="text-[11px] opacity-75">{d.bottom}</div>
          </button>
        );
      })}
    </div>
  );
}

/** ==== Вертикальный список слотов (зелёный/красный) ==== */
function SlotsList({
  slots,
  selected,
  onPick,
}: {
  slots: Slot[];
  selected?: string;
  onPick: (id: string) => void;
}) {
  if (!slots.length) {
    return (
      <div className={`${MAX_W} mx-auto text-center text-sm text-[color:var(--tg-theme-hint-color,#6b7280)] py-4`}>
        На этот день свободных слотов нет
      </div>
    );
  }
  return (
    <div className={`${MAX_W} mx-auto flex flex-col gap-1.5 px-1`}>
      {slots.map((s) => {
        const label = fmtTimeMSK(s.start_utc);
        const busy = !!s.is_booked;
        const active = selected === s.id && !busy;

        const base =
          "w-full h-10 rounded-xl border text-sm font-medium transition flex items-center justify-between px-3";
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
            <span className="text-[11px] opacity-90">{busy ? "Занято" : active ? "Выбрано" : "Свободно"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** ==== Главный компонент ==== */
export default function App() {
  const tg = (window as any).Telegram?.WebApp;

  // Табы
  const [tab, setTab] = useState<"profile" | "book" | "awards" | "reviews">("profile");

  // Данные
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [awards, setAwards] = useState<Award[]>([]);
  const [reviews, setReviews] = useState<ReviewAsset[]>([]);

  // Расписание
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [activeDate, setActiveDate] = useState<string>(toYMD(today));
  const [format, setFormat] = useState<"any" | Format>("any");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  // Форма
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /** Telegram webapp init + тема */
  useEffect(() => {
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.MainButton?.hide?.();
    } catch {}
  }, [tg]);

  /** Загрузка статических данных */
  useEffect(() => {
    fetch(`${API_BASE}/doctor`).then((r) => r.json()).then(setDoctor).catch(() => {});
    fetch(`${API_BASE}/awards`).then((r) => r.json()).then(setAwards).catch(() => {});
    fetch(`${API_BASE}/reviews`).then((r) => r.json()).then(setReviews).catch(() => {});
  }, []);

  /** Загрузка слотов (под выбранный день и формат) */
  const loadDay = (iso: string, fmt: "any" | Format) => {
    const from = iso;
    const to = iso;
    fetch(`${API_BASE}/availability?from_date=${from}&to_date=${to}&format=${fmt}`)
      .then((r) => r.json())
      .then((arr: Slot[]) => {
        const normalized = arr.map((s) => ({ ...s, is_booked: !!s.is_booked }));
        setSlots(normalized);
        setSelectedSlot("");
      })
      .catch(() => setSlots([]));
  };
  useEffect(() => {
    loadDay(activeDate, format);
  }, [activeDate, format]);

  /** Кнопка «Записаться» */
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

      // Скачиваем .ics
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
      // обновим список, чтобы слот стал «занято»
      loadDay(activeDate, format);
      setSelectedSlot("");
      setName("");
      setPhone("");
      setNote("");
    } catch (e) {
      tg?.showAlert?.("Не удалось создать запись. Попробуйте другой слот.");
    } finally {
      setBusy(false);
    }
  };

  /** UI */
  return (
    <div className="min-h-[100svh] text-[color:var(--tg-theme-text-color,#111827)] overflow-x-hidden bg-[linear-gradient(180deg,rgba(20,184,166,.10)_0%,rgba(59,130,246,.06)_30%,transparent_70%)]">
      {/* Хедер + табы */}
      <header className="sticky top-0 z-10 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/92 border-b border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
        <div className={`${MAX_W} mx-auto px-3 py-2 flex items-center gap-2`}>
          <h1 className="text-[15px] font-semibold truncate">Запись к врачу-генетику</h1>
          <div className="ml-auto flex gap-1 rounded-xl p-1 bg-[rgba(0,0,0,.05)] dark:bg-[rgba(255,255,255,.07)] border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
            {[
              ["profile", "О враче"],
              ["book", "Запись"],
              ["awards", "Награды"],
              ["reviews", "Отзывы"],
            ].map(([k, l]) => (
              <button
  key={k}
  onClick={() => setTab(k as any)}
  className={
    [
      // компактнее и без переноса
      "px-2 h-8 rounded-md text-[12px] leading-none whitespace-nowrap",
      "min-w-[72px] font-medium transition",
      // активный / неактивный
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
          {/* Hero-карточка с градиентом */}
          <div className={`${MAX_W} mx-auto px-3 pt-3`}>
            <div className="relative rounded-3xl overflow-hidden border border-white/30 dark:border-white/10 shadow-[0_20px_50px_-20px_rgba(0,0,0,.35)]">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-cyan-500 to-indigo-500 opacity-90" />
            <img
  src={DOCTOR_PHOTO}
  alt=""
  className="w-full h-48 object-cover object-[50%_10%] mix-blend-soft-light"
/>

              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.25),transparent_40%)]" />
              <div className="relative p-4 text-white">
                <div className="flex items-center gap-3">
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
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>🧬 {doctor?.years_experience || 12} лет практики</Badge>
                  <Badge>🌍 Языки: {(doctor?.languages || ["ru","en"]).join(", ")}</Badge>
                  <Badge>🗓️ Длительность: 60 мин</Badge>
                  <Badge>💬 {doctor?.formats?.includes("online") ? "Онлайн" : ""}{doctor?.formats?.includes("offline") ? " · Офлайн" : ""}</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Подробнее о враче */}
          <Section className={`${MAX_W} mx-auto`}>
            <h2 className="text-[15px] font-semibold mb-2">О специалисте</h2>
            <p className="text-[13px] leading-relaxed">
              Клинический генетик. Индивидуальные планы обследования, интерпретация NGS-панелей,
              пренатальная и предиктивная генетика, наследственные синдромы. Работа с семейными
              рисками, составление генеалогического древа, рекомендации по скринингам.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-black/5 dark:bg-white/10">
                <div className="text-[12px] opacity-70">Образование</div>
                <div className="text-[13px] font-medium">
                  РНИМУ им. Пирогова (2012) • Ординатура по мед. генетике (2014)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-black/5 dark:bg-white/10">
                <div className="text-[12px] opacity-70">Сертификаты</div>
                <div className="text-[13px] font-medium">Клиническая генетика • Пренатальная диагностика</div>
              </div>
            </div>
          </Section>

          {/* Направления и услуги */}
          <Section className={`${MAX_W} mx-auto`}>
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
            <div className="mt-3 flex items-center gap-2">
             <button
  onClick={() => setTab("book")}
  className="w-full min-h-[44px] px-3 py-2 rounded-xl
             bg-[var(--tg-theme-button-color,#10b981)]
             text-[var(--tg-theme-button-text-color,#fff)]
             text-[13px] leading-tight font-semibold text-center shadow"
>
  Записаться на консультацию
</button>

              <span className="text-[12px] text-[color:var(--tg-theme-hint-color,#6b7280)]">
                Онлайн и офлайн приём, время — по Москве
              </span>
            </div>
          </Section>
        </div>
      )}

      {/* ЗАПИСЬ */}
      {tab === "book" && (
        <div className="fade-in">
          <Section className={`${MAX_W} mx-auto`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] opacity-80">Формат</span>
              <div className="flex gap-1 rounded-xl p-1 bg-[rgba(0,0,0,.05)] dark:bg-[rgba(255,255,255,.07)] border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
                {(["any", "online", "offline"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={
                      "px-2.5 h-8 rounded-md text-[12.5px] transition " +
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
            <SlotsList slots={slots} selected={selectedSlot} onPick={setSelectedSlot} />
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

      {/* Награды */}
      {tab === "awards" && (
        <div className={`${MAX_W} mx-auto p-3 grid grid-cols-2 gap-3 fade-in`}>
          {awards.map((a) => (
            <figure
              key={a.id}
              className="rounded-2xl overflow-hidden border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white/80 dark:bg-white/5 backdrop-blur"
            >
              <img src={a.image_url} alt={a.title} className="w-full h-28 object-cover" />
              <figcaption className="p-2">
                <div className="text-[13px] font-medium line-clamp-2">{a.title}</div>
                <div className="text-[11px] opacity-70">
                  {a.issuer} · {a.date}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* Отзывы (скриншоты) */}
      {tab === "reviews" && (
        <div className={`${MAX_W} mx-auto p-3 grid grid-cols-2 gap-3 fade-in`}>
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl overflow-hidden border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white/80 dark:bg-white/5 backdrop-blur"
            >
              <img src={r.image_url} alt="" className="w-full h-44 object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Футер: кнопка подтверждения (фикс снизу) */}
      {tab === "book" && (
        <footer className="fixed bottom-0 left-0 right-0 z-10 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/92 border-t border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
          <div className={`${MAX_W} mx-auto px-3 py-2 flex items-center gap-2`}>
            <div className="text-xs opacity-75 truncate">
              {selectedSlot
                ? `Выбрано: ${fmtTimeMSK(slots.find((s) => s.id === selectedSlot)?.start_utc || "")}`
                : "Выберите время и заполните данные"}
            </div>
            <button
              onClick={onBook}
              disabled={
                busy || !selectedSlot || !!slots.find((s) => s.id === selectedSlot)?.is_booked
              }
              className={
                "ml-auto h-10 px-4 rounded-xl text-[13.5px] font-medium shadow " +
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
