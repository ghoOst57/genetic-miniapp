import React, { useEffect, useMemo, useState } from "react";

// Telegram Mini App (WebApp) — Врач‑генетик
// Фронт подключён к FastAPI-бэкенду (эндпоинты см. main.py)
// Настройка адреса API: window.__API_BASE__ или VITE_API_BASE, иначе http://localhost:8000

// ========================= УТИЛИТЫ =========================
const MSK_OFFSET_MIN = 3 * 60; // минуты

function toUTCFromMSK(msk: Date): Date {
  const d = new Date(msk.getTime());
  d.setMinutes(d.getMinutes() - MSK_OFFSET_MIN);
  return d;
}

function toMSKFromUTC(utc: Date): Date {
  const d = new Date(utc.getTime());
  d.setMinutes(d.getMinutes() + MSK_OFFSET_MIN);
  return d;
}

function formatMSKRangeHuman(startUtcISO: string, endUtcISO: string) {
  const start = toMSKFromUTC(new Date(startUtcISO));
  const end = toMSKFromUTC(new Date(endUtcISO));
  const dtfDate = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "2-digit", month: "short" });
  const dtfTime = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${dtfDate.format(start)}, ${dtfTime.format(start)}–${dtfTime.format(end)} (МСК)`;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

function buildICS({ title, description, location, startUtcISO, endUtcISO }: { title: string; description?: string; location?: string; startUtcISO: string; endUtcISO: string; }) {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@genetic-miniapp`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const toIcs = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Genetic MiniApp//EN\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\nBEGIN:VTIMEZONE\nTZID:Europe/Moscow\nX-LIC-LOCATION:Europe/Moscow\nBEGIN:STANDARD\nTZOFFSETFROM:+0300\nTZOFFSETTO:+0300\nTZNAME:MSK\nDTSTART:19700101T000000\nEND:STANDARD\nEND:VTIMEZONE\nBEGIN:VEVENT\nUID:${uid}\nDTSTAMP:${stamp}\nDTSTART:${toIcs(startUtcISO)}\nDTEND:${toIcs(endUtcISO)}\nSUMMARY:${escapeICS(title)}\n${location ? `LOCATION:${escapeICS(location)}\n` : ""}${description ? `DESCRIPTION:${escapeICS(description)}\n` : ""}END:VEVENT\nEND:VCALENDAR`;
  return ics;
}

function escapeICS(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function download(filename: string, content: string, type = "text/calendar") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ========================= МОДЕЛИ =========================
export type AvailabilitySlot = {
  id: string;
  startUtcISO: string;
  endUtcISO: string; // start + 60 минут
  format: "online" | "offline";
};

// ========================= API (реальные вызовы) =========================
const API_BASE = (window as any).__API_BASE__ || import.meta.env.VITE_API_BASE || "";


const api = {
  async getDoctor() {
    const r = await fetch(`${API_BASE}/doctor`);
    if (!r.ok) throw new Error('doctor fetch failed');
    return r.json();
  },
  async getAwards() {
    const r = await fetch(`${API_BASE}/awards`);
    if (!r.ok) throw new Error('awards fetch failed');
    return r.json();
  },
  async getReviewAssets(offset = 0, limit = 12) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    const r = await fetch(`${API_BASE}/reviews?${params.toString()}`);
    if (!r.ok) throw new Error('reviews fetch failed');
    const items = await r.json();
    return { items, total: items.length };
  },
  async getAvailability(fromISO: string, toISO: string, format: "any" | "online" | "offline") {
    const from_date = fromISO.slice(0, 10);
    const to_date = toISO.slice(0, 10);
    const qs = new URLSearchParams({ from_date, to_date, format });
    const r = await fetch(`${API_BASE}/availability?${qs.toString()}`);
    if (!r.ok) throw new Error('availability fetch failed');
    const data = await r.json();
    return (data as any[]).map((s: any) => ({ id: s.id, startUtcISO: s.start_utc, endUtcISO: s.end_utc, format: s.format }));
  },
  async createBooking(payload: { availability_id: string; contact?: { phone?: string; email?: string }; note?: string; name?: string }) {
    const r = await fetch(`${API_BASE}/booking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { if (r.status === 409) throw new Error('slot already booked'); throw new Error('booking failed'); }
    const data = await r.json();
    return { ok: true, booking_id: String(data.booking_id), startUtcISO: data.start_utc, endUtcISO: data.end_utc };
  },
};

// ========================= UI КОМПОНЕНТЫ =========================

type Screen = "profile" | "calendar" | "awards" | "reviews" | "confirm" | "success";

type Doctor = Awaited<ReturnType<typeof api.getDoctor>>;

type BookingDraft = {
  availability?: AvailabilitySlot;
  name: string;
  contact: { phone?: string; email?: string };
  note?: string;
  consent: boolean;
  format: "any" | "online" | "offline";
};

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = "", ...props }) => (
  <button {...props} className={`px-4 py-2 rounded-2xl shadow-sm border text-sm font-medium hover:opacity-90 active:scale-[0.98] transition ${className}`} />
);

const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = "", ...props }) => (
  <div {...props} className={`rounded-2xl border shadow-sm bg-white/60 dark:bg-white/5 ${className}`} />
);

const Tag: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ className = "", ...props }) => (
  <span {...props} className={`px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-white/10 ${className}`} />
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-base font-semibold mb-2">{children}</h2>
);

const Modal: React.FC<{ open: boolean; onClose: () => void; children: React.ReactNode; title?: string }> = ({ open, onClose, children, title }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
        {title ? <div className="text-lg font-semibold mb-3">{title}</div> : null}
        <div>{children}</div>
        <div className="mt-4 text-right">
          <Btn onClick={onClose} className="border-slate-300">Закрыть</Btn>
        </div>
      </div>
    </div>
  );
};

// ========================= ГЛАВНЫЙ КОМПОНЕНТ =========================
export default function App() {
  const [screen, setScreen] = useState<Screen>("profile");
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [awards, setAwards] = useState<any[]>([]);
  const [reviews, setReviews] = useState<{ id: string; image_url: string }[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [formatFilter, setFormatFilter] = useState<"any" | "online" | "offline">("any");

  const [range, setRange] = useState<{ fromISO: string; toISO: string }>(() => {
    const from = new Date();
    const to = addDays(new Date(), 14);
    return { fromISO: from.toISOString(), toISO: to.toISOString() };
  });

  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [draft, setDraft] = useState<BookingDraft>({ name: "", contact: {}, consent: false, format: "any" });
  const [view, setView] = useState<"week" | "month">("week");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [successData, setSuccessData] = useState<{ booking_id: string; startUtcISO: string; endUtcISO: string } | null>(null);

  useEffect(() => {
    // @ts-ignore
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try { tg.ready(); tg.expand(); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); tg.setHeaderColor && tg.setHeaderColor("secondary_bg_color"); } catch {}
    }
  }, []);

  useEffect(() => {
    api.getDoctor().then(setDoctor).catch(console.error);
    api.getAwards().then(setAwards).catch(console.error);
    api.getReviewAssets(0, 12).then((r) => { setReviews(r.items); setReviewsTotal(r.total); }).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    api.getAvailability(range.fromISO, range.toISO, formatFilter)
      .then((s) => { if (!cancelled) setSlots(s); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [range.fromISO, range.toISO, formatFilter]);

  const slotsByDay = useMemo(() => {
    const map: Record<string, AvailabilitySlot[]> = {};
    for (const s of slots) {
      const dayKey = ymd(toMSKFromUTC(new Date(s.startUtcISO)));
      (map[dayKey] ||= []).push(s);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.startUtcISO.localeCompare(b.startUtcISO));
    return map;
  }, [slots]);

  function openCalendar() { setScreen("calendar"); }
  function onSelectSlot(slot: AvailabilitySlot) { setDraft((d) => ({ ...d, availability: slot })); setScreen("confirm"); }

  async function confirmBooking() {
    if (!draft.availability || !draft.consent) return;
    try {
      const res = await api.createBooking({ availability_id: draft.availability.id, contact: draft.contact, note: draft.note, name: draft.name });
      setSuccessData({ booking_id: res.booking_id, startUtcISO: res.startUtcISO, endUtcISO: res.endUtcISO });
      setScreen("success");
    } catch (e: any) {
      alert(e?.message || 'Не удалось создать бронь');
    }
  }

  function downloadICS() {
    if (!successData || !doctor) return;
    const ics = buildICS({ title: `Консультация с ${doctor.name}`, description: draft.note || "", location: draft.format === "offline" ? doctor.city : "Онлайн", startUtcISO: successData.startUtcISO, endUtcISO: successData.endUtcISO });
    const start = toMSKFromUTC(new Date(successData.startUtcISO));
    const file = `booking-${start.toISOString().slice(0,16).replace(/[:T]/g, "-")}.ics`;
    download(file, ics);
  }

  return (
    <div className="min-h-screen bg-[var(--tg-theme-secondary-bg-color,#f6f6f6)] text-[var(--tg-theme-text-color,#0f172a)]">
      <div className="max-w-3xl mx-auto p-4 pb-24">
        <Header onNav={setScreen} current={screen} />
        {screen === "profile" && doctor && (<ProfileScreen doctor={doctor} onBook={openCalendar} />)}
        {screen === "calendar" && (
          <CalendarScreen view={view} setView={setView} formatFilter={formatFilter} setFormatFilter={setFormatFilter} slotsByDay={slotsByDay} loading={loadingSlots} range={range} setRange={setRange} onSelectSlot={onSelectSlot} />)}
        {screen === "confirm" && draft.availability && doctor && (
          <ConfirmScreen draft={draft} setDraft={setDraft} doctor={doctor} onBack={() => setScreen("calendar")} onConfirm={confirmBooking} />)}
        {screen === "success" && successData && doctor && (
          <SuccessScreen success={successData} doctor={doctor} onDownloadICS={downloadICS} onGoReviews={() => setScreen("reviews")} />)}
        {screen === "awards" && (<AwardsScreen awards={awards} />)}
        {screen === "reviews" && (<ReviewsScreen />)}
        <TabBar onNav={setScreen} current={screen} />
      </div>
    </div>
  );
}

// ========================= ШАПКА / ТАББАР =========================
const Header: React.FC<{ onNav: (s: Screen) => void; current: Screen }> = ({ onNav, current }) => {
  const title = useMemo(() => {
    switch (current) {
      case "profile": return "Профиль";
      case "calendar": return "Запись";
      case "confirm": return "Подтверждение";
      case "success": return "Готово";
      case "awards": return "Награды";
      case "reviews": return "Отзывы";
      default: return "";
    }
  }, [current]);

  return (
    <div className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/60 bg-white/80 dark:bg-slate-900/80 border-b rounded-b-2xl px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-lg">{title}</span>
        <div className="ml-auto flex gap-2">
          <Btn className="border-slate-300" onClick={() => onNav("profile")}>Профиль</Btn>
          <Btn className="border-slate-300" onClick={() => onNav("calendar")}>Запись</Btn>
          <Btn className="border-slate-300" onClick={() => onNav("awards")}>Награды</Btn>
          <Btn className="border-slate-300" onClick={() => onNav("reviews")}>Отзывы</Btn>
        </div>
      </div>
    </div>
  );
};

const TabBar: React.FC<{ onNav: (s: Screen) => void; current: Screen }> = ({ onNav, current }) => {
  const items: { key: Screen; label: string }[] = [
    { key: "profile", label: "Профиль" },
    { key: "calendar", label: "Запись" },
    { key: "awards", label: "Награды" },
    { key: "reviews", label: "Отзывы" },
  ];
  return (
    <div className="fixed bottom-4 left-0 right-0">
      <div className="max-w-3xl mx-auto px-4">
        <div className="grid grid-cols-4 gap-3">
          {items.map((it) => (
            <Btn key={it.key} className={`bg-white dark:bg-slate-800 border-slate-200 ${current === it.key ? "ring-2 ring-blue-500" : ""}`} onClick={() => onNav(it.key)}>{it.label}</Btn>
          ))}
        </div>
      </div>
    </div>
  );
};

// ========================= ЭКРАНЫ =========================
const ProfileScreen: React.FC<{ doctor: any; onBook: () => void }> = ({ doctor, onBook }) => {
  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4 flex gap-4">
        <img src={doctor.photo_url} alt={doctor.name} className="w-24 h-24 rounded-full object-cover" />
        <div className="flex-1">
          <div className="text-lg font-semibold">{doctor.name}</div>
          <div className="text-sm text-slate-600">{doctor.title} · {doctor.city} · {doctor.years_experience} лет стажа</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Tag>PGT</Tag>
            <Tag>Пренатальная диагностика</Tag>
            <Tag>NGS</Tag>
            <Tag>Генный скрининг</Tag>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>О себе</SectionTitle>
        <p className="text-sm leading-6 text-slate-700">{doctor.bio}</p>
      </Card>

      <div className="flex gap-3">
        <Btn className="bg-blue-600 text-white border-blue-600" onClick={onBook}>Записаться на консультацию</Btn>
        <Btn className="border-slate-300" onClick={() => {
          if (navigator.share) { navigator.share({ title: "Профиль врача-генетика", url: window.location.href }); }
          else { navigator.clipboard.writeText(window.location.href); alert("Ссылка скопирована"); }
        }}>Поделиться профилем</Btn>
      </div>
    </div>
  );
};

const CalendarScreen: React.FC<{ view: "week" | "month"; setView: (v: "week" | "month") => void; formatFilter: "any" | "online" | "offline"; setFormatFilter: (f: "any" | "online" | "offline") => void; slotsByDay: Record<string, AvailabilitySlot[]>; loading: boolean; range: { fromISO: string; toISO: string }; setRange: (r: { fromISO: string; toISO: string }) => void; onSelectSlot: (s: AvailabilitySlot) => void; }> = ({ view, setView, formatFilter, setFormatFilter, slotsByDay, loading, range, setRange, onSelectSlot }) => {
  const days = useMemo(() => {
    const from = new Date(range.fromISO);
    const to = new Date(range.toISO);
    const out: string[] = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) out.push(ymd(d));
    return out;
  }, [range.fromISO, range.toISO]);

  function shiftRange(daysDelta: number) {
    const from = addDays(new Date(range.fromISO), daysDelta);
    const to = addDays(new Date(range.toISO), daysDelta);
    setRange({ fromISO: from.toISOString(), toISO: to.toISOString() });
  }

  return (
    <div className="space-y-3 mt-4">
      <Card className="p-3 flex items-center gap-2">
        <div className="flex gap-2">
          <Btn className={view === "week" ? "ring-2 ring-blue-500" : ""} onClick={() => setView("week")}>Неделя</Btn>
          <Btn className={view === "month" ? "ring-2 ring-blue-500" : ""} onClick={() => setView("month")}>Месяц</Btn>
        </div>
        <div className="ml-auto flex gap-2 items-center">
          <span className="text-sm text-slate-600 hidden sm:inline">Формат:</span>
          <Btn className={formatFilter === "any" ? "ring-2 ring-blue-500" : ""} onClick={() => setFormatFilter("any")}>Любой</Btn>
          <Btn className={formatFilter === "online" ? "ring-2 ring-blue-500" : ""} onClick={() => setFormatFilter("online")}>Онлайн</Btn>
          <Btn className={formatFilter === "offline" ? "ring-2 ring-blue-500" : ""} onClick={() => setFormatFilter("offline")}>Офлайн</Btn>
        </div>
      </Card>

      <Card className="p-3 flex items-center gap-2">
        <Btn onClick={() => shiftRange(view === "week" ? -7 : -30)}>← Назад</Btn>
        <div className="text-sm text-slate-600">Время показано по Москве (UTC+3)</div>
        <Btn onClick={() => shiftRange(view === "week" ? 7 : 30)} className="ml-auto">Вперёд →</Btn>
      </Card>

      <Card className="p-3">
        {loading ? (
          <div className="animate-pulse text-sm text-slate-500">Загружаем слоты…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {days.map((day) => {
              const list = slotsByDay[day] || [];
              const labelDate = new Date(day + "T00:00:00.000Z");
              const title = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "2-digit", month: "long" }).format(labelDate);
              return (
                <div key={day}>
                  <div className="font-medium mb-2 capitalize">{title}</div>
                  {list.length === 0 ? (
                    <div className="text-sm text-slate-500">Нет слотов</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {list.map((s) => {
                        const start = toMSKFromUTC(new Date(s.startUtcISO));
                        const label = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(start);
                        return (
                          <Btn key={s.id} className="bg-white dark:bg-slate-800 border-slate-200" onClick={() => onSelectSlot(s)}>
                            {label}
                          </Btn>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

const ConfirmScreen: React.FC<{ draft: BookingDraft; setDraft: React.Dispatch<React.SetStateAction<BookingDraft>>; doctor: any; onBack: () => void; onConfirm: () => void; }> = ({ draft, setDraft, doctor, onBack, onConfirm }) => {
  if (!draft.availability) return null;
  const info = formatMSKRangeHuman(draft.availability.startUtcISO, draft.availability.endUtcISO);
  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4">
        <div className="font-semibold">Подтверждение записи</div>
        <div className="text-sm text-slate-600 mt-1">{doctor.name} · {info}</div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Имя</label>
            <input className="mt-1 w-full border rounded-xl px-3 py-2 bg-white/70 dark:bg-slate-800" placeholder="Имя" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm">Телефон</label>
            <input className="mt-1 w-full border rounded-xl px-3 py-2 bg-white/70 dark:bg-slate-800" placeholder="+7…" value={draft.contact.phone || ""} onChange={(e) => setDraft((d) => ({ ...d, contact: { ...d.contact, phone: e.target.value } }))} />
          </div>
          <div>
            <label className="text-sm">Email</label>
            <input className="mt-1 w-full border rounded-xl px-3 py-2 bg-white/70 dark:bg-slate-800" placeholder="name@example.com" value={draft.contact.email || ""} onChange={(e) => setDraft((d) => ({ ...d, contact: { ...d.contact, email: e.target.value } }))} />
          </div>
          <div>
            <label className="text-sm">Формат</label>
            <select className="mt-1 w-full border rounded-xl px-3 py-2 bg-white/70 dark:bg-slate-800" value={draft.format} onChange={(e) => setDraft((d) => ({ ...d, format: e.target.value as any }))}>
              <option value="any">Любой</option>
              <option value="online">Онлайн</option>
              <option value="offline">Офлайн</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm">Цель консультации (опционально)</label>
          <textarea className="mt-1 w-full border rounded-xl px-3 py-2 bg-white/70 dark:bg-slate-800" placeholder="Коротко опишите ваш запрос" value={draft.note || ""} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.consent} onChange={(e) => setDraft((d) => ({ ...d, consent: e.target.checked }))} />
          <span>Согласен(на) с политикой обработки персональных данных</span>
        </label>
        <div className="flex gap-3">
          <Btn className="border-slate-300" onClick={onBack}>Назад</Btn>
          <Btn className={`bg-blue-600 text-white border-blue-600 ${(!draft.name || !draft.consent) ? "opacity-60 pointer-events-none" : ""}`} onClick={onConfirm}>Подтвердить запись</Btn>
        </div>
      </Card>
    </div>
  );
};

const SuccessScreen: React.FC<{ success: { booking_id: string; startUtcISO: string; endUtcISO: string }; doctor: any; onDownloadICS: () => void; onGoReviews: () => void; }> = ({ success, doctor, onDownloadICS, onGoReviews }) => {
  const info = formatMSKRangeHuman(success.startUtcISO, success.endUtcISO);
  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4">
        <div className="text-lg font-semibold">Запись подтверждена</div>
        <div className="text-sm text-slate-600 mt-1">{doctor.name} · {info}</div>
      </Card>
      <div className="flex gap-3">
        <Btn className="bg-white border-slate-300" onClick={onDownloadICS}>Добавить в календарь (.ics)</Btn>
        <Btn className="bg-white border-slate-300" onClick={onGoReviews}>К отзывам</Btn>
      </div>
    </div>
  );
};

const AwardsScreen: React.FC<{ awards: any[] }> = ({ awards }) => {
  const [open, setOpen] = useState<null | any>(null);
  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {awards.map((a) => (
          <Card key={a.id} className="overflow-hidden cursor-pointer" onClick={() => setOpen(a)}>
            <img src={a.image_url} alt={a.title} className="w-full h-32 object-cover" />
            <div className="p-3">
              <div className="text-sm font-medium line-clamp-2">{a.title}</div>
              <div className="text-xs text-slate-500">{a.issuer} · {new Date(a.date).toLocaleDateString("ru-RU")}</div>
            </div>
          </Card>
        ))}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title}>
        {open && (
          <div>
            <img src={open.image_url} alt={open.title} className="w-full max-h-[60vh] object-contain rounded-lg" />
            <div className="mt-3 text-sm text-slate-600">
              <div><b>Тип:</b> {open.type}</div>
              <div><b>Выдано:</b> {open.issuer}</div>
              <div><b>Дата:</b> {new Date(open.date).toLocaleDateString("ru-RU")}</div>
              {open.description && <div className="mt-2">{open.description}</div>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const ReviewsScreen: React.FC = () => {
  const [items, setItems] = useState<{ id: string; image_url: string }[]>([]);
  const [open, setOpen] = useState<null | { id: string; image_url: string }>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.getReviewAssets(offset, 12).then((r) => { setItems((prev) => [...prev, ...r.items]); setTotal(r.total); }).catch(console.error);
  }, [offset]);

  const canLoadMore = items.length < total;

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((it) => (
          <Card key={it.id} className="overflow-hidden cursor-pointer" onClick={() => setOpen(it)}>
            <img src={it.image_url} alt="review" className="w-full h-40 object-cover" />
          </Card>
        ))}
      </div>
      {canLoadMore && (
        <div className="mt-3 text-center">
          <Btn className="bg-white border-slate-300" onClick={() => setOffset((o) => o + 12)}>Показать ещё</Btn>
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)}>
        {open && (<img src={open.image_url} alt="review-large" className="w-full max-h-[75vh] object-contain rounded-lg" />)}
      </Modal>
    </div>
  );
};
