import React, { useEffect, useMemo, useState } from "react";

// ====== Telegram-aware API base ======
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

// ====== Types ======
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

interface Award { id: string; type: "diploma"|"certificate"|"award"|"publication"; title: string; issuer: string; date: string; image_url: string; description?: string }
interface ReviewAsset { id: string; image_url: string; source?: string; date?: string; caption?: string }
interface Slot { id: string; start_utc: string; end_utc: string; format: "online"|"offline" }
interface BookingOut { booking_id: number; start_utc: string; end_utc: string }

// ====== Mini UI primitives (compact for Telegram) ======
const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className = "", children }) => (
  <div className={`rounded-xl bg-[var(--tg-theme-secondary-bg-color,#ffffff)] border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] shadow-[0_0.5px_0_0_rgba(0,0,0,.06)] ${className}`}>{children}</div>
);

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  type?: "primary" | "ghost";
  disabled?: boolean;
  full?: boolean;
}> = ({ children, onClick, type = "primary", disabled, full }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={[
      "h-10 px-3 rounded-lg text-sm font-medium",
      full ? "w-full" : "",
      disabled ? "opacity-50 pointer-events-none" : "",
      type === "primary"
        ? "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#ffffff)]"
        : "bg-transparent text-[color:var(--tg-theme-link-color,#059669)] hover:bg-black/5",
    ].join(" ")}
  >
    {children}
  </button>
);

const Segmented: React.FC<{ value: string; onChange: (v: string) => void; options: {label:string; value:string}[] }>
= ({ value, onChange, options }) => (
  <div className="flex p-0.5 rounded-lg bg-black/5">
    {options.map(o => (
      <button key={o.value} onClick={() => onChange(o.value)}
        className={`flex-1 h-9 rounded-md text-xs font-medium transition ${value===o.value?"bg-white shadow text-[color:var(--tg-theme-text-color,#111827)]":"text-[color:var(--tg-theme-hint-color,#6b7280)]"}`}>{o.label}</button>
    ))}
  </div>
);

// ====== Helpers ======
const toYMD = (d: Date) => d.toISOString().slice(0,10);
const fmtTime = (iso: string) => new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"Europe/Moscow"}).format(new Date(iso));
const fmtDateLabel = (d: Date) => new Intl.DateTimeFormat("ru-RU",{weekday:"short", day:"2-digit", month:"short"}).format(d);

// ====== Screens ======
const About: React.FC<{ doctor: Doctor; onBook:()=>void }>=({doctor,onBook})=> (
  <div className="space-y-3">
    <Card>
      <div className="relative">
        <img src={doctor.photo_url} alt="" className="w-full h-36 object-cover rounded-t-xl"/>
        <div className="absolute bottom-2 left-3 right-3 text-white drop-shadow">
          <div className="text-base font-semibold">{doctor.name}</div>
          <div className="text-xs opacity-90">{doctor.title} • {doctor.city}</div>
        </div>
      </div>
      <div className="p-3 space-y-2 text-[13px] text-[color:var(--tg-theme-text-color,#111827)]">
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          <span className="px-2 py-0.5 rounded-full bg-black/5">{doctor.years_experience}+ лет</span>
          {doctor.formats.map(f=> <span key={f} className="px-2 py-0.5 rounded-full bg-black/5">{f}</span>)}
          {doctor.languages?.length? <span className="px-2 py-0.5 rounded-full bg-black/5">языки: {doctor.languages.join(', ')}</span>:null}
        </div>
        <p className="leading-relaxed">{doctor.bio}</p>
        <Button full onClick={onBook}>Записаться на консультацию</Button>
      </div>
    </Card>
  </div>
);

const Awards: React.FC<{awards: Award[]}> = ({awards}) => (
  <div className="grid grid-cols-2 gap-2">
    {awards.map(a=> (
      <Card key={a.id}>
        <img src={a.image_url} className="w-full h-20 object-cover rounded-t-xl"/>
        <div className="p-2">
          <div className="text-[12.5px] font-semibold leading-snug line-clamp-2">{a.title}</div>
          <div className="text-[11px] text-[color:var(--tg-theme-hint-color,#6b7280)]">{a.issuer} • {a.date}</div>
        </div>
      </Card>
    ))}
  </div>
);

const Reviews: React.FC<{reviews: ReviewAsset[]}> = ({reviews}) => (
  <div className="grid grid-cols-2 gap-2">
    {reviews.map(r=> (
      <Card key={r.id}>
        <img src={r.image_url} className="w-full h-36 object-cover rounded-t-xl"/>
      </Card>
    ))}
  </div>
);

const Schedule: React.FC<{ slots: Slot[]; onBook:(slot:Slot, name?:string, note?:string, contact?:{phone?:string; email?:string})=>Promise<void> }>
= ({slots,onBook})=>{
  const [format,setFormat]=useState<string>("any");
  const [selectedDate,setSelectedDate]=useState<Date>(new Date());
  const [selectedSlot,setSelectedSlot]=useState<Slot|null>(null);
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);

  const days = useMemo(()=>{
    const s=new Date(); s.setHours(0,0,0,0);
    return Array.from({length:14},(_,i)=>{ const d=new Date(s); d.setDate(s.getDate()+i); return d; });
  },[]);

  const filtered = useMemo(()=>{
    const ymd=toYMD(selectedDate);
    return slots.filter(s=> s.start_utc.slice(0,10)===ymd && (format==='any'||s.format===format));
  },[slots,selectedDate,format]);

  const submit = async()=>{
    if(!selectedSlot) return;
    setBusy(true);
    try{
      await onBook(selectedSlot, name||undefined, note||undefined, {phone: phone||undefined});
      setSelectedSlot(null); setName(""); setPhone(""); setNote("");
      (window as any).Telegram?.WebApp?.showAlert?.("Запись подтверждена! Файл .ics сохранён.")
    }catch(e:any){
      (window as any).Telegram?.WebApp?.showAlert?.(e?.message||"Не удалось создать запись");
    }finally{ setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Segmented value={format} onChange={setFormat} options={[{label:"Все",value:"any"},{label:"Онлайн",value:"online"},{label:"Офлайн",value:"offline"}]}/>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map(d=>{
          const active = toYMD(d)===toYMD(selectedDate);
          return (
            <button key={d.toISOString()} onClick={()=>setSelectedDate(d)}
              className={`min-w-[76px] px-2.5 py-1.5 rounded-lg border text-xs ${active?"bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] border-transparent":"bg-white border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] text-[color:var(--tg-theme-text-color,#111827)]"}`}
            >{fmtDateLabel(d)}</button>
          );
        })}
      </div>

      {!filtered.length? (
        <Card className="p-4 text-center text-[color:var(--tg-theme-hint-color,#6b7280)] text-sm">На выбранный день свободных слотов нет</Card>
      ):(
        <div className="grid grid-cols-3 gap-1.5">
          {filtered.map(s=> (
            <button key={s.id} onClick={()=>setSelectedSlot(s)}
              className={`h-9 rounded-md border text-[13px] font-medium ${selectedSlot?.id===s.id?"bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] border-transparent":"bg-white text-[color:var(--tg-theme-text-color,#111827)] border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]"}`}
            >{fmtTime(s.start_utc)}</button>
          ))}
        </div>
      )}

      {selectedSlot && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[13px]">
              <div className="text-[color:var(--tg-theme-hint-color,#6b7280)]">Вы выбрали</div>
              <div className="font-semibold">{fmtDateLabel(new Date(selectedSlot.start_utc))}, {fmtTime(selectedSlot.start_utc)}–{fmtTime(selectedSlot.end_utc)}</div>
              <div className="text-[11.5px] text-[color:var(--tg-theme-hint-color,#6b7280)] mt-0.5">Формат: {selectedSlot.format}</div>
            </div>
            <button className="text-[20px] leading-none text-[color:var(--tg-theme-hint-color,#94a3b8)]" onClick={()=>setSelectedSlot(null)}>×</button>
          </div>

          <div className="grid gap-2">
            <input className="h-9 px-2.5 rounded-md border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white text-sm" placeholder="Ваше имя (необязательно)" value={name} onChange={e=>setName(e.target.value)} />
            <input className="h-9 px-2.5 rounded-md border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white text-sm" placeholder="Телефон (для связи)" value={phone} onChange={e=>setPhone(e.target.value)} />
            <input className="h-9 px-2.5 rounded-md border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] bg-white text-sm" placeholder="Комментарий" value={note} onChange={e=>setNote(e.target.value)} />
          </div>

          <Button full onClick={submit} disabled={busy}>{busy?"Записываем…":"Подтвердить запись (60 мин)"}</Button>
        </Card>
      )}
    </div>
  );
};

// ====== Root App with Telegram theming & safe areas ======
const App: React.FC = () => {
  const [tab,setTab]=useState<"about"|"schedule"|"awards"|"reviews">("about");
  const [doctor,setDoctor]=useState<Doctor|null>(null);
  const [awards,setAwards]=useState<Award[]>([]);
  const [reviews,setReviews]=useState<ReviewAsset[]>([]);
  const [slots,setSlots]=useState<Slot[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);

  // Telegram theme + viewport
  useEffect(()=>{
    const tg=(window as any).Telegram?.WebApp;
    try { tg?.ready(); tg?.expand(); } catch {}
    const apply=()=>{
      const p=tg?.themeParams||{};
      const set=(k:string,v?:string)=> document.documentElement.style.setProperty(k, v||"");
      set('--tg-theme-bg-color', p.bg_color||'#f6f7f9');
      set('--tg-theme-text-color', p.text_color||'#111827');
      set('--tg-theme-hint-color', p.hint_color||'#6b7280');
      set('--tg-theme-link-color', p.link_color||'#059669');
      set('--tg-theme-button-color', p.button_color||'#10b981');
      set('--tg-theme-button-text-color', p.button_text_color||'#ffffff');
    };
    apply();
    tg?.onEvent?.('themeChanged', apply);
    return ()=> tg?.offEvent?.('themeChanged', apply);
  },[]);

  // Load data
  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        setLoading(true);
        const [d,a,r]=await Promise.all([
          apiGet<Doctor>('/doctor'),
          apiGet<Award[]>('/awards'),
          apiGet<ReviewAsset[]>('/reviews'),
        ]);
        if(!alive) return;
        setDoctor(d); setAwards(a); setReviews(r);
        const from = toYMD(new Date());
        const to = toYMD(new Date(Date.now()+13*86400000));
        const s = await apiGet<Slot[]>(`/availability?from_date=${from}&to_date=${to}&format=any`);
        if(!alive) return; setSlots(s);
      }catch(e:any){ setError(e?.message||'Не удалось загрузить данные'); }
      finally{ setLoading(false); }
    })();
    return()=>{ alive=false; }
  },[]);

  const onBook = async(slot:Slot, name?:string, note?:string, contact?:{phone?:string; email?:string})=>{
    const res = await apiPost<BookingOut>('/booking', { availability_id: slot.id, name, note, contact });
    // minimal ICS
    const fmt=(s:string)=> s.replace(/[-:]/g,'').replace('.000Z','Z');
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Genetic MiniApp//RU\nBEGIN:VEVENT\nUID:${res.booking_id}@genetic\nDTSTAMP:${fmt(slot.start_utc)}\nDTSTART:${fmt(slot.start_utc)}\nDTEND:${fmt(slot.end_utc)}\nSUMMARY:Консультация генетика\nDESCRIPTION:Формат: ${slot.format}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`booking-${res.booking_id}.ics`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[color:var(--tg-theme-hint-color,#6b7280)]">Загружаем…</div>;
  if (error || !doctor) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-4 text-center max-w-sm">
        <div className="font-semibold mb-1">Что-то пошло не так</div>
        <div className="text-[13px] text-[color:var(--tg-theme-hint-color,#6b7280)] mb-2">{error || 'Нет данных'}</div>
        <Button onClick={()=>location.reload()}>Обновить</Button>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--tg-theme-bg-color,#f6f7f9)] text-[color:var(--tg-theme-text-color,#111827)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/90 border-b border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
        <div className="max-w-[480px] mx-auto px-3 py-2 flex items-center gap-2">
          <img src={doctor.photo_url} className="w-9 h-9 rounded-full object-cover"/>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">{doctor.name}</div>
            <div className="text-[11.5px] text-[color:var(--tg-theme-hint-color,#6b7280)]">{doctor.title} • {doctor.city}</div>
          </div>
        </div>
        <div className="max-w-[480px] mx-auto px-3 pb-2 grid grid-cols-4 gap-1.5">
          {([
            {k:'about',l:'О враче'},
            {k:'schedule',l:'Запись'},
            {k:'awards',l:'Награды'},
            {k:'reviews',l:'Отзывы'},
          ] as const).map(t=> (
            <button key={t.k} onClick={()=>setTab(t.k)}
              className={`h-9 rounded-md text-sm font-medium ${tab===t.k?"bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)]":"bg-black/5 text-[color:var(--tg-theme-text-color,#111827)]"}`}>{t.l}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[480px] mx-auto p-3 pb-[calc(env(safe-area-inset-bottom)+64px)] space-y-3">
        {tab==='about' && <About doctor={doctor} onBook={()=>setTab('schedule')}/>} 
        {tab==='schedule' && <Schedule slots={slots} onBook={onBook}/>} 
        {tab==='awards' && <Awards awards={awards}/>} 
        {tab==='reviews' && <Reviews reviews={reviews}/>} 
      </div>

      {/* Bottom CTA with safe area */}
      <div className="sticky bottom-0 z-20 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/90 border-t border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
        <div className="max-w-[480px] mx-auto px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
          <Button full onClick={()=>setTab('schedule')}>Записаться на консультацию</Button>
        </div>
      </div>
    </div>
  );
};

export default App;
