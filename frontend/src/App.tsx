import React, { useEffect, useMemo, useState } from "react";

// ===== Helpers =====
// API base читаем из window.__API_BASE__ или Vercel env (VITE_API_BASE)
const API_BASE: string =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  (import.meta as any)?.env?.VITE_API_BASE ||
  "";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Форматирование времени под Москву
const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Moscow",
    }).format(d);
  } catch {
    return iso;
  }
};

const fmtDateLabel = (d: Date) =>
  new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "2-digit", month: "short" }).format(d);

const toYMD = (d: Date) => d.toISOString().slice(0, 10);

// ===== Types =====
interface Doctor {
  id: string;
  name: string;
  title: string;
  years_experience: number;
  city: string;
  formats: ("online" | "offline")[];
  languages: string[];
  photo_url: string;
  bio: string;
}

interface Award {
  id: string;
  type: "diploma" | "certificate" | "award" | "publication";
  title: string;
  issuer: string;
  date: string;
  image_url: string;
  description?: string;
}

interface ReviewAsset {
  id: string;
  image_url: string;
  source?: string;
  date?: string;
  caption?: string;
}

interface Slot {
  id: string;
  start_utc: string;
  end_utc: string;
  format: "online" | "offline";
}

interface BookingOut { booking_id: number; start_utc: string; end_utc: string }

// ===== UI Primitives (Tailwind через CDN желательно в index.html) =====
const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className = "", children }) => (
  <div className={`rounded-2xl shadow-lg bg-white/80 backdrop-blur border border-slate-100 ${className}`}>{children}</div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{children}</span>
);

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
  full?: boolean;
}> = ({ children, onClick, variant = "primary", disabled, full }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={[
      "h-12 px-4 rounded-xl font-medium",
      full ? "w-full" : "",
      disabled ? "opacity-50 pointer-events-none" : "",
      variant === "primary"
        ? "bg-emerald-600 text-white shadow hover:bg-emerald-700 active:bg-emerald-800"
        : "bg-transparent text-emerald-700 hover:bg-emerald-50",
    ].join(" ")}
  >
    {children}
  </button>
);

const Segmented: React.FC<{
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}> = ({ value, options, onChange }) => (
  <div className="flex p-1 rounded-xl bg-slate-100">
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`flex-1 h-10 rounded-lg text-sm font-medium transition ${
          value === o.value ? "bg-white shadow text-slate-900" : "text-slate-600"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// ===== Screens =====
const AboutScreen: React.FC<{ doctor: Doctor; onBookClick: () => void } > = ({ doctor, onBookClick }) => (
  <div className="space-y-4">
    <Card className="overflow-hidden">
      <div className="relative">
        <img src={doctor.photo_url} alt={doctor.name} className="w-full h-48 object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <h1 className="text-xl font-semibold">{doctor.name}</h1>
          <p className="text-sm opacity-90">{doctor.title} • {doctor.city}</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{doctor.years_experience}+ лет практики</Chip>
          {doctor.formats.map(f => <Chip key={f}>{f}</Chip>)}
          {doctor.languages?.length ? <Chip>языки: {doctor.languages.join(", ")}</Chip> : null}
        </div>
        <p className="text-slate-700 leading-relaxed">{doctor.bio}</p>
        <Button full onClick={onBookClick}>Записаться на консультацию</Button>
      </div>
    </Card>
  </div>
);

const AwardsScreen: React.FC<{ awards: Award[] }> = ({ awards }) => (
  <div className="grid grid-cols-2 gap-3">
    {awards.map((a) => (
      <Card key={a.id} className="overflow-hidden">
        <img src={a.image_url} alt={a.title} className="w-full h-24 object-cover" />
        <div className="p-3">
          <div className="text-sm font-semibold line-clamp-2">{a.title}</div>
          <div className="text-xs text-slate-500">{a.issuer} • {a.date}</div>
        </div>
      </Card>
    ))}
  </div>
);

const ReviewsScreen: React.FC<{ reviews: ReviewAsset[] }> = ({ reviews }) => (
  <div className="grid grid-cols-2 gap-3">
    {reviews.map((r) => (
      <Card key={r.id} className="overflow-hidden">
        <img src={r.image_url} alt={r.caption || r.id} className="w-full h-40 object-cover" />
      </Card>
    ))}
  </div>
);

const ScheduleScreen: React.FC<{
  slots: Slot[];
  onBook: (slot: Slot, name?: string, note?: string, contact?: { phone?: string; email?: string }) => Promise<void>;
}> = ({ slots, onBook }) => {
  const [format, setFormat] = useState<string>("any");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Список ближайших 14 дней
  const days = useMemo(() => {
    const arr: Date[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  const daySlots = useMemo(() => {
    const ymd = toYMD(selectedDate);
    return slots.filter((s) => s.start_utc.slice(0, 10) === ymd && (format === "any" || s.format === (format as any)));
  }, [slots, selectedDate, format]);

  const doBook = async () => {
    if (!selectedSlot) return;
    try {
      setBusy(true);
      await onBook(selectedSlot, name.trim() || undefined, note.trim() || undefined, { phone: phone.trim() || undefined });
      // reset
      setSelectedSlot(null);
      setName("");
      setPhone("");
      setNote("");
      alert("Запись подтверждена! Файл .ics появится у вас в телефоне.");
    } catch (e: any) {
      alert(e?.message || "Не удалось создать запись. Попробуйте другой слот.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Segmented
        value={format}
        onChange={setFormat}
        options={[
          { label: "Все", value: "any" },
          { label: "Онлайн", value: "online" },
          { label: "Офлайн", value: "offline" },
        ]}
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const isActive = toYMD(d) === toYMD(selectedDate);
          return (
            <button
              key={d.toISOString()}
              onClick={() => setSelectedDate(d)}
              className={`min-w-[88px] px-3 py-2 rounded-xl border text-sm ${
                isActive ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              {fmtDateLabel(d)}
            </button>
          );
        })}
      </div>

      {!daySlots.length ? (
        <Card className="p-6 text-center text-slate-500">Нет свободных слотов на этот день</Card>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {daySlots.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSlot(s)}
              className={`h-12 rounded-lg border text-sm font-medium ${
                selectedSlot?.id === s.id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-800 border-slate-200 hover:bg-emerald-50"
              }`}
            >
              {fmtTime(s.start_utc)}
            </button>
          ))}
        </div>
      )}

      {selectedSlot && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">Вы выбрали</div>
              <div className="font-semibold">{fmtDateLabel(new Date(selectedSlot.start_utc))}, {fmtTime(selectedSlot.start_utc)} – {fmtTime(selectedSlot.end_utc)}</div>
              <div className="text-xs text-slate-500 mt-0.5">Формат: {selectedSlot.format}</div>
            </div>
            <button className="text-slate-400" onClick={() => setSelectedSlot(null)}>×</button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <input className="h-11 px-3 rounded-lg border border-slate-200" placeholder="Ваше имя (по желанию)" value={name} onChange={e=>setName(e.target.value)} />
            <input className="h-11 px-3 rounded-lg border border-slate-200" placeholder="Телефон (для связи)" value={phone} onChange={e=>setPhone(e.target.value)} />
            <input className="h-11 px-3 rounded-lg border border-slate-200" placeholder="Комментарий" value={note} onChange={e=>setNote(e.target.value)} />
          </div>

          <Button full onClick={doBook} disabled={busy}>{busy ? "Записываем…" : "Подтвердить запись (60 мин)"}</Button>
        </Card>
      )}
    </div>
  );
};

// ===== Root App =====
const App: React.FC = () => {
  const [tab, setTab] = useState<"about" | "schedule" | "awards" | "reviews">("about");
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [awards, setAwards] = useState<Award[]>([]);
  const [reviews, setReviews] = useState<ReviewAsset[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Начальная загрузка данных
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const [d, a, r] = await Promise.all([
          apiGet<Doctor>("/doctor"),
          apiGet<Award[]>("/awards"),
          apiGet<ReviewAsset[]>("/reviews"),
        ]);
        if (!isMounted) return;
        setDoctor(d);
        setAwards(a);
        setReviews(r);
        // Слоты на ближайшие 14 дней (any)
        const from = toYMD(new Date());
        const to = toYMD(new Date(Date.now() + 13 * 86400000));
        const s = await apiGet<Slot[]>(`/availability?from_date=${from}&to_date=${to}&format=any`);
        if (!isMounted) return;
        setSlots(s);
      } catch (e: any) {
        setError(e?.message || "Не удалось загрузить данные");
      } finally {
        setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const onBook = async (slot: Slot, name?: string, note?: string, contact?: { phone?: string; email?: string }) => {
    const res = await apiPost<BookingOut>("/booking", {
      availability_id: slot.id,
      name,
      note,
      contact,
    });
    // Скачиваем .ics (минимально)
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Genetic MiniApp//RU\nBEGIN:VEVENT\nUID:${res.booking_id}@genetic\nDTSTAMP:${slot.start_utc.replace(/[-:]/g, "").replace(".000Z", "Z")}\nDTSTART:${slot.start_utc.replace(/[-:]/g, "").replace(".000Z", "Z")}\nDTEND:${slot.end_utc.replace(/[-:]/g, "").replace(".000Z", "Z")}\nSUMMARY:Консультация генетика\nDESCRIPTION:Формат: ${slot.format}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `booking-${res.booking_id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Загружаем…</div>
      </div>
    );
  }

  if (error || !doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 text-center max-w-md">
          <div className="text-lg font-semibold mb-2">Что-то пошло не так</div>
          <div className="text-slate-600 mb-4">{error || "Нет данных"}</div>
          <Button onClick={() => location.reload()}>Обновить</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      {/* Top Bar */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center gap-3">
          <img src={doctor.photo_url} alt={doctor.name} className="w-10 h-10 rounded-full object-cover" />
          <div className="leading-tight">
            <div className="font-semibold">{doctor.name}</div>
            <div className="text-xs text-slate-500">{doctor.title} • {doctor.city}</div>
          </div>
        </div>
        <div className="max-w-screen-sm mx-auto px-4 pb-3">
          <div className="grid grid-cols-4 gap-2 text-sm">
            {[
              { key: "about", label: "О враче" },
              { key: "schedule", label: "Запись" },
              { key: "awards", label: "Награды" },
              { key: "reviews", label: "Отзывы" },
            ].map((t: any) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`h-10 rounded-lg font-medium ${tab === t.key ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-sm mx-auto p-4 space-y-5">
        {tab === "about" && <AboutScreen doctor={doctor} onBookClick={() => setTab("schedule")} />}
        {tab === "schedule" && <ScheduleScreen slots={slots} onBook={onBook} />}
        {tab === "awards" && <AwardsScreen awards={awards} />}
        {tab === "reviews" && <ReviewsScreen reviews={reviews} />}
      </div>

      {/* Bottom CTA (mobile friendly) */}
      <div className="sticky bottom-0 z-20 bg-white/80 backdrop-blur border-t border-slate-200">
        <div className="max-w-screen-sm mx-auto px-4 py-3">
          <Button full onClick={() => setTab("schedule")}>Записаться на консультацию</Button>
        </div>
      </div>
    </div>
  );
};

export default App;
