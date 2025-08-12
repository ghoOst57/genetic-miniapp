// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (window as any).__API_BASE__ || import.meta.env.VITE_API_BASE || "";

type Slot = { id: string; start_utc: string; end_utc: string; format: "online" | "offline" };
type Award = { id: string; type: string; title: string; issuer: string; date: string; image_url: string; description?: string };
type ReviewAsset = { id: string; image_url: string; source?: string; date?: string; caption?: string };
type Doctor = {
  id: string; name: string; title: string; years_experience: number; city: string;
  formats: ("online" | "offline")[]; languages: string[]; photo_url: string; bio: string;
};

const tg = (window as any).Telegram?.WebApp;

function useTelegramTheme() {
  useEffect(() => {
    try {
      tg?.ready?.();
      tg?.expand?.();
      tg?.MainButton?.hide?.();
      tg?.BackButton?.show?.();
      tg?.onEvent?.("backButtonClicked", () => window.history.length > 1 ? history.back() : tg?.close?.());
    } catch {}
  }, []);
}

function DayStrip({ start, days, value, onChange }:{
  start: Date; days: number; value: string; onChange: (isoDate: string)=>void
}) {
  const items = useMemo(() => {
    const arr: { key: string; label: string; sub: string }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const isToday = i === 0;
      const label = d.toLocaleDateString(undefined, { weekday: "short" }).replace(".", "");
      const sub = `${d.getDate()}.${String(d.getMonth()+1).padStart(2,"0")}`;
      arr.push({ key, label: isToday ? "Сегодня" : label, sub });
    }
    return arr;
  }, [start, days]);

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 px-3">
      {items.map((d) => {
        const active = d.key === value;
        return (
          <button
            key={d.key}
            onClick={() => onChange(d.key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm border transition-all ${
              active
                ? "bg-tg_btn text-tg_btn_text border-tg_btn shadow-sm"
                : "bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)] border-tg_sep text-tg_text/90"
            }`}
          >
            <div className="leading-none">{d.label}</div>
            <div className="text-[11px] opacity-75">{d.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

function SlotsGrid({ slots, selected, onPick }:{
  slots: Slot[]; selected?: string; onPick: (id: string)=>void
}) {
  if (!slots.length) {
    return <div className="text-center text-sm text-tg_hint py-6">Нет свободных слотов на выбранный день</div>;
  }
  return (
    <div className="grid grid-cols-3 gap-2 px-3 pb-3">
      {slots.map((s) => {
        const t = new Date(s.start_utc);
        const label = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const active = selected === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            className={`h-9 rounded-lg border text-sm transition-all ${
              active
                ? "bg-tg_btn text-tg_btn_text border-tg_btn shadow"
                : "bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)] border-tg_sep text-tg_text/90 hover:opacity-90"
            }`}
            title={s.format === "online" ? "Онлайн" : "Офлайн"}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-3 mb-3 rounded-xl border border-tg_sep bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.04)] p-3 fade-in" >
      {children}
    </section>
  );
}

export default function App() {
  useTelegramTheme();

  // tabs
  const [tab, setTab] = useState<"profile"|"book"|"awards"|"reviews">("book");

  // data
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [awards, setAwards] = useState<Award[]>([]);
  const [reviews, setReviews] = useState<ReviewAsset[]>([]);
  const [format, setFormat] = useState<"any"|"online"|"offline">("any");

  // booking
  const today = useMemo(() => new Date(), []);
  const [activeDate, setActiveDate] = useState<string>(today.toISOString().slice(0,10));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [okBooking, setOkBooking] = useState<{id:number; start:string; end:string} | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/doctor`).then(r=>r.json()).then(setDoctor).catch(()=>{});
    fetch(`${API_BASE}/awards`).then(r=>r.json()).then(setAwards).catch(()=>{});
    fetch(`${API_BASE}/reviews`).then(r=>r.json()).then(setReviews).catch(()=>{});
  }, []);

  // load availability for a single day (compact UX)
  const loadDay = (iso: string, fmt: "any"|"online"|"offline") => {
    const from = iso; const to = iso;
    fetch(`${API_BASE}/availability?from_date=${from}&to_date=${to}&format=${fmt}`)
      .then(r=>r.json()).then((arr: Slot[]) => {
        setSlots(arr);
        setSelectedSlot("");
      });
  };

  useEffect(() => { loadDay(activeDate, format); }, [activeDate, format]);

  const filteredSlots = slots;

  const onBook = async () => {
    if (!selectedSlot) { tg?.showAlert?.("Выберите время."); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability_id: selectedSlot,
          name, note,
          contact: { phone }
        })
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setOkBooking({ id: data.booking_id, start: data.start_utc, end: data.end_utc });
      tg?.showAlert?.("Запись подтверждена!");
      setSelectedSlot("");
      setNote(""); setPhone(""); setName("");
    } catch (e) {
      tg?.showAlert?.("Слот уже занят. Выберите другое время.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100svh] text-tg_text">
      {/* Верхняя панель (табы) */}
      <header className="sticky top-0 z-10 glass border-b border-tg_sep">
        <div className="mx-auto max-w-[640px] px-3 py-2 flex items-center gap-2">
          <h1 className="text-[15px] font-semibold truncate">Запись к врачу-генетику</h1>
          <div className="ml-auto flex gap-1 rounded-lg p-1 bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.07)] border border-tg_sep">
            {[
              ["profile","О враче"],
              ["book","Запись"],
              ["awards","Награды"],
              ["reviews","Отзывы"],
            ].map(([key,label])=>(
              <button
                key={key}
                onClick={()=>setTab(key as any)}
                className={`px-2.5 h-8 rounded-md text-[12.5px] transition-all ${
                  tab===key ? "bg-tg_btn text-tg_btn_text shadow" : "text-tg_text/90"
                }`}
              >{label}</button>
            ))}
          </div>
        </div>
      </header>

      {/* Контент */}
      <main className="safe-bottom mx-auto max-w-[640px]">
        {/* TAB: PROFILE */}
        {tab==="profile" && (
          <div className="p-3 fade-in">
            <div className="flex gap-3 items-center rounded-xl border border-tg_sep p-3 bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.04)]">
              <img src={doctor?.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold truncate">{doctor?.name || "Врач-генетик"}</div>
                <div className="text-sm opacity-80">{doctor?.title} · {doctor?.years_experience} лет стажа</div>
                <div className="text-xs opacity-70">{doctor?.city} · Языки: {(doctor?.languages||[]).join(", ")}</div>
              </div>
            </div>

            <SectionCard>
              <div className="text-sm leading-relaxed">{doctor?.bio}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(doctor?.formats||[]).map(f=>(
                  <span key={f} className="text-xs px-2 py-1 rounded-md border border-tg_sep bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.06)]">{f==="online"?"Онлайн":"Офлайн"}</span>
                ))}
              </div>
            </SectionCard>

            <button onClick={()=>setTab("book")} className="w-full h-11 rounded-lg bg-tg_btn text-tg_btn_text text-[14px] font-medium shadow">
              Записаться
            </button>
          </div>
        )}

        {/* TAB: BOOK */}
        {tab==="book" && (
          <div className="fade-in">
            <SectionCard>
              <div className="flex items-center justify-between">
                <span className="text-[13px] opacity-80">Формат</span>
                <div className="flex gap-1 rounded-md p-1 bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.07)] border border-tg_sep">
                  {["any","online","offline"].map(f=>(
                    <button key={f} onClick={()=>setFormat(f as any)}
                      className={`px-2 h-8 rounded text-[12.5px] ${format===f? "bg-tg_btn text-tg_btn_text shadow":"opacity-90"}`}>
                      {f==="any"?"Все":f==="online"?"Онлайн":"Офлайн"}
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <DayStrip start={today} days={14} value={activeDate} onChange={setActiveDate}/>
              <SlotsGrid slots={filteredSlots} selected={selectedSlot} onPick={setSelectedSlot}/>
            </SectionCard>

            <SectionCard>
              <div className="grid gap-2">
                <input className="h-9 rounded-md border border-tg_sep bg-transparent px-3 text-sm"
                       placeholder="Ваше имя" value={name} onChange={e=>setName(e.target.value)} />
                <input className="h-9 rounded-md border border-tg_sep bg-transparent px-3 text-sm"
                       placeholder="Телефон" value={phone} onChange={e=>setPhone(e.target.value)} />
                <textarea className="min-h-[72px] rounded-md border border-tg_sep bg-transparent px-3 py-2 text-sm"
                          placeholder="Комментарий (необязательно)" value={note} onChange={e=>setNote(e.target.value)} />
              </div>
            </SectionCard>
          </div>
        )}

        {/* TAB: AWARDS */}
        {tab==="awards" && (
          <div className="p-3 grid grid-cols-2 gap-3 fade-in">
            {awards.map(a=>(
              <figure key={a.id} className="rounded-xl overflow-hidden border border-tg_sep bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.04)]">
                <img src={a.image_url} alt={a.title} className="w-full h-28 object-cover" />
                <figcaption className="p-2">
                  <div className="text-[13px] font-medium line-clamp-2">{a.title}</div>
                  <div className="text-[11px] opacity-70">{a.issuer} · {a.date}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {/* TAB: REVIEWS (скриншоты) */}
        {tab==="reviews" && (
          <div className="p-3 grid grid-cols-2 gap-3 fade-in">
            {reviews.map(r=>(
              <div key={r.id} className="rounded-xl overflow-hidden border border-tg_sep">
                <img src={r.image_url} alt="" className="w-full h-44 object-cover" />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Нижняя липкая панель (только для записи) */}
      {tab==="book" && (
        <footer className="fixed bottom-0 left-0 right-0 z-10 glass border-t border-tg_sep">
          <div className="mx-auto max-w-[640px] px-3 py-2 flex items-center gap-2">
            <div className="text-xs opacity-75">
              {selectedSlot
                ? `Выбран слот: ${new Date(
                    filteredSlots.find(s=>s.id===selectedSlot)?.start_utc || ""
                  ).toLocaleString([], { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}`
                : "Выберите время и заполните данные"}
            </div>
            <button
              disabled={!selectedSlot || busy}
              onClick={onBook}
              className={`ml-auto h-10 px-4 rounded-lg text-[13.5px] font-medium shadow transition-all
                ${!selectedSlot || busy ? "opacity-60 cursor-not-allowed" : "hover:opacity-95"}
                bg-tg_btn text-tg_btn_text`}
            >
              {busy ? "Запись..." : "Записаться"}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
