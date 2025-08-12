// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";

/** ==== API base (Vercel env или window.__API_BASE__) ==== */
const API_BASE =
  (window as any).__API_BASE__ || import.meta.env.VITE_API_BASE || "";

/** ==== Типы ==== */
type Format = "online" | "offline";
type Slot = {
  id: string;
  start_utc: string;
  end_utc: string;
  format: Format;
  is_booked?: boolean; // если бэкенд ещё не обновлён — будет undefined (считаем свободным)
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
function Section({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={
        "mx-3 mb-3 rounded-xl border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] " +
        "bg-[rgba(0,0,0,.03)] dark:bg-[rgba(255,255,255,.04)] p-3 " +
        "fade-in " +
        className
      }
    >
      {children}
    </section>
  );
}

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
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 px-1 -mx-1">
      {items.map((d) => {
        const active = d.key === value;
        return (
          <button
            key={d.key}
            onClick={() => onChange(d.key)}
            className={
              "shrink-0 rounded-lg px-3 py-2 text-sm border transition-all " +
              (active
                ? "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] border-transparent shadow"
                : "bg-[rgba(0,0,0,.04)] dark:bg-[rgba(255,255,255,.06)] border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] text-[color:var(--tg-theme-text-color,#111827)]/90")
            }
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
      <div className="text-center text-sm text-[color:var(--tg-theme-hint-color,#6b7280)] py-4">
        На этот день свободных слотов нет
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 px-1">
      {slots.map((s) => {
        const label = fmtTimeMSK(s.start_utc);
        const busy = !!s.is_booked; // если бэкенд не прислал — будет false
        const active = selected === s.id && !busy;

        const base =
          "w-full h-10 rounded-lg border text-sm font-medium transition flex items-center justify-between px-3";
        const clsBusy = "bg-[#ef4444] text-white border-[#ef4444] cursor-not-allowed";
        const clsActive = "bg-[#10b981] text-white border-[#10b981]";
        const clsIdle =
          "bg-[rgba(0,0,0,.04)] dark:bg-[rgba(255,255,255,.06)] border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] text-[color:var(--tg-theme-text-color,#111827)]/90 hover:opacity-90";

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
  const [tab, setTab] = useState<"profile" | "book" | "awards" | "reviews">("book");

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

  /** Загрузка слотов для выбранного дня и формата (вертикальный список) */
  const loadDay = (iso: string, fmt: "any" | Format) => {
    const from = iso;
    const to = iso;
    fetch(`${API_BASE}/availability?from_date=${from}&to_date=${to}&format=${fmt}`)
      .then((r) => r.json())
      .then((arr: Slot[]) => {
        // если бэкенд ещё без is_booked — нормализуем
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

  /** Фильтрация (здесь уже под один день, но оставим на будущее) */
  const filteredSlots = slots; // формат уже применяем при запросе

  /** UI */
  return (
    <div className="min-h-[100svh] text-[color:var(--tg-theme-text-color,#111827)] overflow-x-hidden">
      {/* Хедер + табы (компактные) */}
      <header className="sticky top-0 z-10 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/92 border-b border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
        <div className="mx-auto max-w-[640px] px-3 py-2 flex items-center gap-2">
          <h1 className="text-[15px] font-semibold truncate">Запись к врачу-генетику</h1>
          <div className="ml-auto flex gap-1 rounded-lg p-1 bg-[rgba(0,0,0,.05)] dark:bg-[rgba(255,255,255,.07)] border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
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
                  "px-2.5 h-8 rounded-md text-[12.5px] transition " +
                  (tab === k
                    ? "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] shadow"
                    : "text-[color:var(--tg-theme-text-color,#111827)]/90")
                }
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Контент */}
      <main className="mx-auto max-w-[640px] pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
        {/* Профиль */}
        {tab === "profile" && (
          <div className="p-3 fade-in">
            <div className="flex gap-3 items-center rounded-xl border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] p-3 bg-[rgba(0,0,0,.03)] dark:bg-[rgba(255,255,255,.04)]">
              <img
                src={doctor?.photo_url}
                alt=""
                className="w-16 h-16 rounded-full object-cover"
              />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold truncate">
                  {doctor?.name || "Врач-генетик"}
                </div>
                <div className="text-sm opacity-80">
                  {doctor?.title} · {doctor?.years_experience} лет стажа
                </div>
                <div className="text-xs opacity-70">
                  {doctor?.city} · Языки: {(doctor?.languages || []).join(", ")}
                </div>
              </div>
            </div>

            <Section>
              <div className="text-sm leading-relaxed">{doctor?.bio}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(doctor?.formats || []).map((f) => (
                  <span
                    key={f}
                    className="text-xs px-2 py-1 rounded-md border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-[rgba(0,0,0,.03)] dark:bg-[rgba(255,255,255,.06)]"
                  >
                    {f === "online" ? "Онлайн" : "Офлайн"}
                  </span>
                ))}
              </div>
            </Section>

            <button
              onClick={() => setTab("book")}
              className="w-full h-11 rounded-lg bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] text-[14px] font-medium shadow"
            >
              Записаться
            </button>
          </div>
        )}

        {/* Запись */}
        {tab === "book" && (
          <div className="fade-in">
            <Section>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] opacity-80">Формат</span>
                <div className="flex gap-1 rounded-md p-1 bg-[rgba(0,0,0,.05)] dark:bg-[rgba(255,255,255,.07)] border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
                  {(["any", "online", "offline"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={
                        "px-2 h-8 rounded text-[12.5px] transition " +
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

            <Section>
              <DayStrip start={today} days={14} value={activeDate} onChange={setActiveDate} />
              {/* ВЕРТИКАЛЬНЫЙ СПИСОК */}
              <SlotsList
                slots={filteredSlots}
                selected={selectedSlot}
                onPick={setSelectedSlot}
              />
            </Section>

            <Section>
              <div className="grid gap-2">
                <input
                  className="h-9 rounded-md border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-transparent px-3 text-sm"
                  placeholder="Ваше имя (необязательно)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="h-9 rounded-md border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-transparent px-3 text-sm"
                  placeholder="Телефон"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <textarea
                  className="min-h-[72px] rounded-md border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-transparent px-3 py-2 text-sm"
                  placeholder="Комментарий (необязательно)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </Section>
          </div>
        )}

        {/* Награды */}
        {tab === "awards" && (
          <div className="p-3 grid grid-cols-2 gap-3 fade-in">
            {awards.map((a) => (
              <figure
                key={a.id}
                className="rounded-xl overflow-hidden border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]"
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
          <div className="p-3 grid grid-cols-2 gap-3 fade-in">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="rounded-xl overflow-hidden border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]"
              >
                <img src={r.image_url} alt="" className="w-full h-44 object-cover" />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Футер: кнопка подтверждения (фикс снизу) */}
      {tab === "book" && (
        <footer className="fixed bottom-0 left-0 right-0 z-10 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/92 border-t border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
          <div className="mx-auto max-w-[640px] px-3 py-2 flex items-center gap-2">
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
                "ml-auto h-10 px-4 rounded-lg text-[13.5px] font-medium shadow " +
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
