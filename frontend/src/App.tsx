import React, { useEffect, useMemo, useState } from "react";

// ===== API base (Telegram-aware) =====
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

// ===== Types =====
interface Doctor { id:string; name:string; title:string; years_experience:number; city:string; formats:("online"|"offline")[]; languages:string[]; photo_url:string; bio:string }
interface Award { id:string; type:"diploma"|"certificate"|"award"|"publication"; title:string; issuer:string; date:string; image_url:string; description?:string }
interface ReviewAsset { id:string; image_url:string; source?:string; date?:string; caption?:string }
interface Slot { id:string; start_utc:string; end_utc:string; format:"online"|"offline" }
interface BookingOut { booking_id:number; start_utc:string; end_utc:string }

// ===== Compact primitives (Telegram theme vars) =====
const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className = "", children }) => (
  <div className={`rounded-lg bg-[var(--tg-theme-secondary-bg-color,#fff)] border border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] shadow-[0_0.5px_0_rgba(0,0,0,.06)] ${className}`}>{children}</div>
);

const Button: React.FC<{ children: React.ReactNode; onClick?: () => void; type?: "primary" | "ghost"; disabled?: boolean; full?: boolean }>
= ({ children, onClick, type = "primary", disabled, full }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={[
      "h-9 px-3 rounded-md text-[13px] font-medium transition active:scale-[.99]",
      full ? "w-full" : "",
      disabled ? "opacity-50 pointer-events-none" : "",
      type === "primary"
        ? "bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)]"
        : "bg-transparent text-[color:var(--tg-theme-link-color,#059669)] hover:bg-black/5",
    ].join(" ")}
  >{children}</button>
);

const Segmented: React.FC<{ value: string; onChange: (v: string) => void; options: {label:string; value:string}[] }>
= ({ value, onChange, options }) => (
  <div className="flex p-0.5 rounded-md bg-black/5">
    {options.map(o => (
      <button key={o.value} onClick={() => onChange(o.value)}
        className={`flex-1 h-8 rounded-[10px] text-[12.5px] font-medium ${value===o.value?"bg-white shadow text-[color:var(--tg-theme-text-color,#111827)]":"text-[color:var(--tg-theme-hint-color,#6b7280)]"}`}>{o.label}</button>
    ))}
  </div>
);

// ===== Helpers =====
const toYMD = (d: Date) => d.toISOString().slice(0,10);
const fmtTime = (iso: string) => new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"Europe/Moscow"}).format(new Date(iso));
const fmtDateLabel = (d: Date) => new Intl.DateTimeFormat("ru-RU",{weekday:"short", day:"2-digit", month:"short"}).format(d);

// ===== Screens =====
const About: React.FC<{ doctor: Doctor; onBook:()=>void }>=({doctor,onBook})=> (
  <div className="space-y-2.5">
    <Card>
      <div className="relative">
        <img src={doctor.photo_url} alt="" className="w-full h-32 object-cover rounded-t-lg"/>
        <div className="absolute bottom-2 left-2 right-2 text-white drop-shadow">
          <div className="text-[14px] font-semibold">{doctor.name}</div>
          <div className="text-[11.5px] opacity-90">{doctor.title} • {doctor.city}</div>
        </div>
      </div>
      <div className="p-3 space-y-2 text-[13px] text-[color:var(--tg-theme-text-color,#111827)]">
        <div className="flex flex-wrap gap-1.5 text-[11.5px]">
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
        <img src={a.image_url} className="w-full h-20 object-cover rounded-t-lg"/>
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
        <img src={r.image_url} className="w-full h-36 object-cover rounded-t-lg"/>
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
    }catch(e:any){ (window as any).Telegram?.WebApp?.showAlert?.(e?.message||"Не удалось создать запись"); }
    finally{ setBusy(false); }
  };

  return (
    <div className="space-y-2.5">
      <Segmented value={format} onChange={setFormat} options={[{label:"Все",value:"any"},{label:"Онлайн",value:"online"},{label:"Офлайн",value:"offline"}]}/>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map(d=>{
          const active = toYMD(d)===toYMD(selectedDate);
          return (
            <button key={d.toISOString()} onClick={()=>setSelectedDate(d)}
              className={`min-w-[72px] px-2 py-1.5 rounded-md border text-[12.5px] ${active?"bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] border-transparent":"bg-white border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] text-[color:var(--tg-theme-text-color,#111827)]"}`}>{fmtDateLabel(d)}</button>
          );
        })}
      </div>

      {!filtered.length? (
        <Card className="p-3 text-center text-[color:var(--tg-theme-hint-color,#6b7280)] text-[13px]">На выбранный день свободных слотов нет</Card>
      ):(
        <div className="grid grid-cols-3 gap-1.5">
          {filtered.map(s=> (
            <button key={s.id} onClick={()=>setSelectedSlot(s)}
              className={`h-9 rounded-md border text-[13px] font-medium transition ${selectedSlot?.id===s.id?"bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)] border-transparent":"bg-white text-[color:var(--tg-theme-text-color,#111827)] border-[color:var(--tg-theme-section-separator-color,#e5e7eb)] hover:bg-black/5"}`}>{fmtTime(s.start_utc)}</button>
          ))}
        </div>
      )}

      {selectedSlot && (
        <Card className="p-3 space-y-2 animate-[fadeIn_.15s_ease]">
          <div className="flex items-center justify-between">
            <div className="text-[13px]">
              <div className="text-[color:var(--tg-theme-hint-color,#6b7280)]">Вы выбрали</div>
              <div className="font-semibold">{fmtDateLabel(new Date(selectedSlot.start_utc))}, {fmtTime(selectedSlot.start_utc)}–{fmtTime(selectedSlot.end_utc)}</div>
              <div className="text-[11.5px] text-[color:var(--tg-theme-hint-color,#6b7280)] mt-0.5">Формат: {selectedSlot.format}</div>
            </div>
            <button className="text-[20px] leading-none text-[color:var(--tg-theme-hint-color,#94a3b8)]" onClick={()=>setSelectedSlot(null)}>×</button>
          </div>

          <div className="grid gap-1.5">
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

// ===== Root App (adaptive container + Telegram theme) =====
const App: React.FC = () => {
  const [tab,setTab]=useState<"about"|"schedule"|"awards"|"reviews">("about");
  const [doctor,setDoctor]=useState<Doctor|null>(null);
  const [awards,setAwards]=useState<Award[]>([]);
  const [reviews,setReviews]=useState<ReviewAsset[]>([]);
  const [slots,setSlots]=useState<Slot[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [isTG,setIsTG]=useState(false);

  // Telegram theming + viewport
  useEffect(()=>{
    const tg=(window as any).Telegram?.WebApp; if(tg){ setIsTG(true); }
    try{ tg?.ready(); tg?.expand(); }catch{}
    const apply=()=>{
      const p=tg?.themeParams||{}; const set=(k:string,v?:string)=>document.documentElement.style.setProperty(k, v||"");
      set('--tg-theme-bg-color', p.bg_color||'#f6f7f9');
      set('--tg-theme-text-color', p.text_color||'#111827');
      set('--tg-theme-hint-color', p.hint_color||'#6b7280');
      set('--tg-theme-link-color', p.link_color||'#059669');
      set('--tg-theme-button-color', p.button_color||'#10b981');
      set('--tg-theme-button-text-color', p.button_text_color||'#ffffff');
    };
    apply(); tg?.onEvent?.('themeChanged', apply); return ()=> tg?.offEvent?.('themeChanged', apply);
  },[]);

  // Load data
  useEffect(()=>{
    let alive=true; (async()=>{
      try{
        setLoading(true);
        const [d,a,r]=await Promise.all([
          apiGet<Doctor>('/doctor'),
          apiGet<Award[]>('/awards'),
          apiGet<ReviewAsset[]>('/reviews'),
        ]); if(!alive) return; setDoctor(d); setAwards(a); setReviews(r);
        const from=toYMD(new Date()); const to=toYMD(new Date(Date.now()+13*86400000));
        const s=await apiGet<Slot[]>(`/availability?from_date=${from}&to_date=${to}&format=any`);
        if(!alive) return; setSlots(s);
      }catch(e:any){ setError(e?.message||'Не удалось загрузить данные'); }
      finally{ setLoading(false); }
    })(); return()=>{ alive=false };
  },[]);

  const onBook = async(slot:Slot, name?:string, note?:string, contact?:{phone?:string; email?:string})=>{
    const res = await apiPost<BookingOut>('/booking', { availability_id: slot.id, name, note, contact });
    const fmt=(s:string)=> s.replace(/[-:]/g,'').replace('.000Z','Z');
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Genetic MiniApp//RU\nBEGIN:VEVENT\nUID:${res.booking_id}@genetic\nDTSTAMP:${fmt(slot.start_utc)}\nDTSTART:${fmt(slot.start_utc)}\nDTEND:${fmt(slot.end_utc)}\nSUMMARY:Консультация генетика\nDESCRIPTION:Формат: ${slot.format}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`booking-${res.booking_id}.ics`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[color:var(--tg-theme-hint-color,#6b7280)]">Загружаем…</div>;
  if (error || !doctor) return (
    <div className="min-h-screen flex items-center justify-center p-3">
      <Card className="p-3 text-center max-w-sm">
        <div className="font-semibold mb-1">Что-то пошло не так</div>
        <div className="text-[13px] text-[color:var(--tg-theme-hint-color,#6b7280)] mb-2">{error || 'Нет данных'}</div>
        <Button onClick={()=>location.reload()}>Обновить</Button>
      </Card>
    </div>
  );

  const containerStyle: React.CSSProperties = { maxWidth: isTG ? 480 : 600 };

  return (
    <div className="min-h-screen bg-[var(--tg-theme-bg-color,#f6f7f9)] text-[color:var(--tg-theme-text-color,#111827)]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/90 border-b border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
        <div className="mx-auto px-2.5 py-2 flex items-center gap-2" style={containerStyle}>
          <img src={doctor.photo_url} className="w-8 h-8 rounded-full object-cover"/>
          <div className="leading-tight">
            <div className="text-[13.5px] font-semibold">{doctor.name}</div>
            <div className="text-[11.5px] text-[color:var(--tg-theme-hint-color,#6b7280)]">{doctor.title} • {doctor.city}</div>
          </div>
        </div>
        <div className="mx-auto px-2.5 pb-2 grid grid-cols-4 gap-1" style={containerStyle}>
          {([
            {k:'about',l:'О враче'},
            {k:'schedule',l:'Запись'},
            {k:'awards',l:'Награды'},
            {k:'reviews',l:'Отзывы'},
          ] as const).map(t=> (
            <button key={t.k} onClick={()=>setTab(t.k)}
              className={`h-8 rounded-md text-[12.5px] font-medium ${tab===t.k?"bg-[var(--tg-theme-button-color,#10b981)] text-[var(--tg-theme-button-text-color,#fff)]":"bg-black/5 text-[color:var(--tg-theme-text-color,#111827)]"}`}>{t.l}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto p-2.5 space-y-2.5 pb-[calc(env(safe-area-inset-bottom)+56px)]" style={containerStyle}>
        {tab==='about' && <About doctor={doctor} onBook={()=>setTab('schedule')}/>} 
        {tab==='schedule' && <Schedule slots={slots} onBook={onBook}/>} 
        {tab==='awards' && <Awards awards={awards}/>} 
        {tab==='reviews' && <Reviews reviews={reviews}/>} 
      </div>

      {/* Bottom CTA */}
      <div className="sticky bottom-0 z-20 backdrop-blur bg-[color:var(--tg-theme-bg-color,#f6f7f9)]/90 border-t border-[color:var(--tg-theme-section-separator-color,#e5e7eb)]">
        <div className="mx-auto px-2.5 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]" style={containerStyle}>
          <Button full onClick={()=>setTab('schedule')}>Записаться на консультацию</Button>
        </div>
      </div>
    </div>
  );
};

export default App;
