import { useState, useEffect, useLayoutEffect, useRef, createContext, useContext } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// API CONFIG & TYPES
// ═══════════════════════════════════════════════════════════════════════════
const API_BASE = "http://localhost:3001/api";
const SCREENSHOTS_BASE = "http://localhost:3001/screenshots";

interface Screenshot { id: number; filePath: string; fileSize: number | null; format: string; }
interface TestStep {
  id: number; stepNumber: number; action: string; target: string | null;
  value: string | null; aiReasoning: string | null; aiConfidence: number | null;
  success: boolean; errorMsg: string | null; durationMs: number | null;
  screenshot: Screenshot | null;
}
interface Test { id: number; testName: string; userPrompt: string; targetUrl: string | null; }
interface TestRun {
  id: number; status: string; startTime: string; endTime: string | null;
  durationMs: number | null; errorMsg: string | null; browser: string;
  test: Test; steps: TestStep[];
}
interface Stats { total: number; success: number; failed: number; successRate: string; }

function ssUrl(fp: string) { return `${SCREENSHOTS_BASE}/${fp.split(/[\\/]/).pop()}`; }

async function apiRunTest(p: { testName: string; userPrompt: string; targetUrl: string }): Promise<TestRun> {
  const r = await fetch(`${API_BASE}/tests/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
  const d = await r.json(); if (!d.success) throw new Error(d.error || "Test başlatılamadı"); return d.data;
}
async function apiHistory(limit = 50): Promise<TestRun[]> {
  const r = await fetch(`${API_BASE}/tests/history?limit=${limit}`); const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiGetTest(id: number): Promise<TestRun> {
  const r = await fetch(`${API_BASE}/tests/${id}`); const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiStats(): Promise<Stats> {
  const r = await fetch(`${API_BASE}/tests/stats`); const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}

// ═══════════════════════════════════════════════════════════════════════════
// THEME CONTEXT
// ═══════════════════════════════════════════════════════════════════════════
type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("qa-theme") as Theme;
      if (saved) return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark";
  });

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("qa-theme", theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════
const I = {
  Play: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M6 4l15 8-15 8V4z" fill="currentColor"/></svg>,
  History: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/></svg>,
  Chart: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="12" width="4" height="8" rx="1" fill="currentColor" opacity=".5"/><rect x="10" y="8" width="4" height="12" rx="1" fill="currentColor" opacity=".7"/><rect x="17" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>,
  Sun: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Moon: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Ok: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Xx: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>,
  Back: () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M19 12H5m0 0l7 7m-7-7l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Right: () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Globe: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" stroke="currentColor" strokeWidth="1.5"/></svg>,
  Zap: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/></svg>,
  Collapse: ({ flip }: { flip?: boolean }) => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" style={{ transform: flip ? "rotate(180deg)" : "none", transition: "transform .3s" }}><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Down: ({ open }: { open?: boolean }) => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ═══════════════════════════════════════════════════════════════════════════
// STATUS / ACTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const ST: Record<string, { label: string; c: string; bg: string; bd: string; dot: string }> = {
  SUCCESS:   { label: "Başarılı",      c: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", bd: "border-emerald-200 dark:border-emerald-500/20", dot: "bg-emerald-500" },
  FAIL:      { label: "Başarısız",     c: "text-red-600 dark:text-red-400",         bg: "bg-red-50 dark:bg-red-500/10",         bd: "border-red-200 dark:border-red-500/20",         dot: "bg-red-500" },
  ERROR:     { label: "Hata",          c: "text-orange-600 dark:text-orange-400",   bg: "bg-orange-50 dark:bg-orange-500/10",   bd: "border-orange-200 dark:border-orange-500/20",   dot: "bg-orange-500" },
  RUNNING:   { label: "Çalışıyor",     c: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-50 dark:bg-blue-500/10",       bd: "border-blue-200 dark:border-blue-500/20",       dot: "bg-blue-500 animate-pulse" },
  MAX_STEPS: { label: "Limit Aşıldı", c: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-500/10",     bd: "border-amber-200 dark:border-amber-500/20",     dot: "bg-amber-500" },
};

function Badge({ status }: { status: string }) {
  const s = ST[status] || ST.ERROR;
  return <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${s.bg} ${s.c} ${s.bd}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}/>{s.label}</span>;
}

function AChip({ action }: { action: string }) {
  const m: Record<string, string> = {
    click: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
    fill: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    type: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    select: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    navigate: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20",
    verify: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
    press: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/20",
    hover: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20",
  };
  return <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${m[action] || "bg-gray-50 text-gray-600 border-gray-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20"}`}>{action}</span>;
}

function Spin({ sm }: { sm?: boolean }) {
  return <div className={`${sm ? "w-4 h-4 border-[1.5px]" : "w-8 h-8 border-2"} border-gray-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin`} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// URL COMBO BOX
// ═══════════════════════════════════════════════════════════════════════════
function UrlCombo({ value, onChange, disabled, urls }: { value: string; onChange: (v: string) => void; disabled: boolean; urls: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const filtered = urls.filter(u => u.toLowerCase().includes(value.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500"><I.Globe /></span>
        <input type="text" value={value} onChange={e => { onChange(e.target.value); if (!open) setOpen(true); }} onFocus={() => { if (urls.length > 0) setOpen(true); }}
          placeholder="https://www.saucedemo.com" disabled={disabled}
          className="w-full bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-lg pl-9 pr-8 py-2.5 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-40 transition-all" />
        {urls.length > 0 && <button type="button" onClick={() => setOpen(!open)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"><I.Down open={open} /></button>}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-lg dark:shadow-black/50 overflow-hidden">
          <p className="px-3 py-1.5 text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest border-b border-gray-100 dark:border-zinc-800/50">Önceki URL'ler</p>
          <div className="max-h-40 overflow-y-auto">{filtered.map((u, i) => (
            <button key={i} onClick={() => { onChange(u); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors flex items-center gap-2 text-gray-600 dark:text-zinc-400">
              <I.Globe /><span className="truncate font-mono text-xs">{u}</span>
            </button>
          ))}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function DashPage({ stats, runs, onSelect }: { stats: Stats | null; runs: TestRun[]; onSelect: (id: number) => void }) {
  if (!stats) return <div className="flex justify-center py-24"><Spin /></div>;
  const rate = parseFloat(stats.successRate) || 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {([
          { l: "Toplam test", v: stats.total, c: "text-gray-900 dark:text-zinc-100", icon: <I.Chart /> },
          { l: "Başarılı", v: stats.success, c: "text-emerald-600 dark:text-emerald-400", icon: <I.Ok /> },
          { l: "Başarısız", v: stats.failed, c: "text-red-600 dark:text-red-400", icon: <I.Xx /> },
          { l: "Başarı oranı", v: `%${stats.successRate}`, c: "text-amber-600 dark:text-amber-400", icon: <I.Zap /> },
        ]).map(s => (
          <div key={s.l} className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2"><p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{s.l}</p><span className="text-gray-300 dark:text-zinc-700">{s.icon}</span></div>
            <p className={`text-3xl font-bold font-mono ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Başarı oranı</p>
          <span className="text-xl font-bold text-blue-600 dark:text-blue-400 font-mono">%{stats.successRate}</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-1000" style={{ width: `${rate}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-[11px] text-gray-400 dark:text-zinc-600 font-mono"><span>{stats.success} başarılı</span><span>{stats.failed} başarısız</span></div>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800/50"><p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Son testler</p></div>
        {runs.slice(0, 6).map((run, i) => (
          <button key={run.id} onClick={() => onSelect(run.id)}
            className={`w-full flex items-center justify-between px-5 py-3 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors group ${i < Math.min(runs.length, 6) - 1 ? "border-b border-gray-100 dark:border-zinc-800/30" : ""}`}>
            <div className="flex items-center gap-3 min-w-0">
              <Badge status={run.status} />
              <span className="text-sm text-gray-900 dark:text-zinc-200 truncate">{run.test.testName}</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-gray-400 dark:text-zinc-600 shrink-0 font-mono">
              <span>{run.steps.length} adım</span>
              {run.durationMs && <span>{(run.durationMs / 1000).toFixed(1)}s</span>}
              <span className="font-sans">{new Date(run.startTime).toLocaleDateString("tr-TR")}</span>
              <span className="text-gray-300 dark:text-zinc-700 group-hover:text-blue-500 transition-colors"><I.Right /></span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN TEST
// ═══════════════════════════════════════════════════════════════════════════
function RunPage({ onDone, pastUrls }: { onDone: (id: number) => void; pastUrls: string[] }) {
  const [name, setName] = useState(""); const [url, setUrl] = useState(""); const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [result, setResult] = useState<TestRun | null>(null);

  const go = async () => {
    if (!name.trim() || !prompt.trim() || !url.trim()) { setError("Tüm alanları doldurun."); return; }
    setLoading(true); setError(null); setResult(null);
    try { setResult(await apiRunTest({ testName: name, userPrompt: prompt, targetUrl: url })); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const ic = "w-full bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-40 transition-all";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="w-full bg-white dark:bg-zinc-900/30 border-2 border-blue-400 dark:border-blue-500/55 rounded-xl p-6 space-y-5 shadow-sm shadow-blue-500/10 dark:shadow-blue-950/20">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">Test adı</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="SauceDemo Login Testi" disabled={loading} className={ic} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">Hedef URL</label>
            <UrlCombo value={url} onChange={setUrl} disabled={loading} urls={pastUrls} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">Test promptu</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={"SauceDemo'ya git, kullanıcı adı alanına standard_user,\nşifre alanına secret_sauce yaz. Login butonuna tıkla."} rows={6} disabled={loading}
            className={`${ic} resize-none font-mono text-[13px] leading-relaxed`} />
        </div>
        {error && <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-lg px-4 py-3 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />{error}</div>}
        <button onClick={go} disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-600 text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2.5 text-sm">
          {loading ? <><Spin sm /> Test çalışıyor...</> : <><I.Play /> Testi başlat</>}
        </button>
      </div>
      {result && (
        <div className={`border rounded-xl p-5 ${result.status === "SUCCESS" ? "bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20" : "bg-red-50/50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${result.status === "SUCCESS" ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                {result.status === "SUCCESS" ? <I.Ok /> : <I.Xx />}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-zinc-100 text-sm">{result.status === "SUCCESS" ? "Test başarılı" : "Test başarısız"}</p>
                <p className="text-xs text-gray-500 dark:text-zinc-500 font-mono">{result.steps.length} adım{result.durationMs ? ` · ${(result.durationMs / 1000).toFixed(1)}s` : ""}</p>
              </div>
            </div>
            <button onClick={() => onDone(result.id)} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">Detaylar <I.Right /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════
function HistPage({ onSelect }: { onSelect: (id: number) => void }) {
  const [runs, setRuns] = useState<TestRun[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiHistory(50).then(setRuns).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="flex justify-center py-24"><Spin /></div>;
  if (!runs.length) return <div className="text-center py-20 text-gray-400 dark:text-zinc-600">Henüz test yok.</div>;
  return (
    <div className="bg-white dark:bg-zinc-900/30 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_100px_70px_70px_130px_28px] gap-3 px-5 py-2.5 text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest border-b border-gray-100 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/50">
        <span>Test</span><span>Durum</span><span>Adım</span><span>Süre</span><span>Tarih</span><span />
      </div>
      {runs.map((r, i) => (
        <button key={r.id} onClick={() => onSelect(r.id)}
          className={`w-full grid grid-cols-[1fr_100px_70px_70px_130px_28px] gap-3 px-5 py-3 text-left hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors group ${i < runs.length - 1 ? "border-b border-gray-100 dark:border-zinc-800/30" : ""}`}>
          <div className="min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-zinc-200 truncate">{r.test.testName}</p><p className="text-[11px] text-gray-400 dark:text-zinc-600 truncate">{r.test.userPrompt}</p></div>
          <div className="self-center"><Badge status={r.status} /></div>
          <span className="text-sm text-gray-600 dark:text-zinc-400 font-mono self-center">{r.steps.length}</span>
          <span className="text-sm text-gray-600 dark:text-zinc-400 font-mono self-center">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</span>
          <span className="text-[11px] text-gray-400 dark:text-zinc-600 self-center">{new Date(r.startTime).toLocaleString("tr-TR")}</span>
          <span className="self-center text-gray-300 dark:text-zinc-700 group-hover:text-blue-500 transition-colors"><I.Right /></span>
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST DETAIL
// ═══════════════════════════════════════════════════════════════════════════
function DetailPage({ id, onBack }: { id: number; onBack: () => void }) {
  const [run, setRun] = useState<TestRun | null>(null); const [loading, setLoading] = useState(true); const [img, setImg] = useState<string | null>(null);
  useEffect(() => { apiGetTest(id).then(setRun).finally(() => setLoading(false)); }, [id]);
  if (loading) return <div className="flex justify-center py-24"><Spin /></div>;
  if (!run) return <div className="text-center py-20 text-gray-400 dark:text-zinc-600">Test bulunamadı.</div>;
  const okN = run.steps.filter(s => s.success).length, failN = run.steps.length - okN;
  return (
    <div className="space-y-6">
      <div>
        <button onClick={onBack} className="text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors mb-3 flex items-center gap-1.5"><I.Back /> Geçmişe dön</button>
        <div className="flex items-start justify-between"><div><h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">{run.test.testName}</h1><p className="text-gray-500 dark:text-zinc-500 text-sm mt-0.5 max-w-xl">{run.test.userPrompt}</p></div><Badge status={run.status} /></div>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {([
          { l: "Durum", v: ST[run.status]?.label || run.status, c: ST[run.status]?.c || "" },
          { l: "Toplam", v: run.steps.length, c: "text-gray-900 dark:text-zinc-100" },
          { l: "Başarılı", v: okN, c: "text-emerald-600 dark:text-emerald-400" },
          { l: "Başarısız", v: failN, c: failN ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-zinc-500" },
          { l: "Süre", v: run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—", c: "text-gray-900 dark:text-zinc-100" },
        ]).map(s => (
          <div key={s.l} className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-wider">{s.l}</p>
            <p className={`text-lg font-semibold mt-1 font-mono ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2.5">
        <p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest">Test adımları</p>
        {run.steps.map(step => (
          <div key={step.id} className={`bg-white dark:bg-zinc-900/20 border rounded-xl overflow-hidden ${step.success ? "border-gray-200 dark:border-zinc-800/50" : "border-red-200 dark:border-red-500/20"}`}>
            <div className="flex gap-5 p-5">
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${step.success ? "bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                    {step.success ? <I.Ok /> : <I.Xx />}
                  </div>
                  <span className="text-[11px] font-mono text-gray-400 dark:text-zinc-600">#{step.stepNumber}</span>
                  <AChip action={step.action} />
                  {step.durationMs != null && <span className="text-[11px] text-gray-400 dark:text-zinc-600 font-mono">{step.durationMs}ms</span>}
                </div>
                {step.target && <div className="bg-gray-50 dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800/50 rounded-lg px-3 py-2"><p className="text-sm text-gray-700 dark:text-zinc-300 font-mono truncate">{step.target}</p></div>}
                {step.value && <p className="text-xs text-gray-500 dark:text-zinc-500">Değer: <span className="font-mono text-gray-700 dark:text-zinc-300">{step.value}</span></p>}
                {step.aiReasoning && <div className="border-l-2 border-blue-300 dark:border-blue-800/50 pl-3"><p className="text-xs text-gray-500 dark:text-zinc-500 leading-relaxed">{step.aiReasoning}</p></div>}
                {step.aiConfidence != null && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 dark:bg-zinc-800/50 rounded-full h-1.5 max-w-[120px] overflow-hidden">
                      <div className={`h-1.5 rounded-full ${step.aiConfidence >= 0.8 ? "bg-blue-500" : step.aiConfidence >= 0.5 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${step.aiConfidence * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-400 dark:text-zinc-600 font-mono">{(step.aiConfidence * 100).toFixed(0)}%</span>
                  </div>
                )}
                {step.errorMsg && <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/15 rounded-lg px-3 py-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" /><p className="text-xs text-red-600 dark:text-red-400">{step.errorMsg}</p></div>}
              </div>
              {step.screenshot && (
                <img src={ssUrl(step.screenshot.filePath)} alt={`Adım ${step.stepNumber}`}
                  className="w-48 h-30 object-cover rounded-lg border border-gray-200 dark:border-zinc-800 cursor-zoom-in hover:border-blue-500 transition-all shrink-0"
                  onClick={() => setImg(ssUrl(step.screenshot!.filePath))} />
              )}
            </div>
          </div>
        ))}
      </div>
      {img && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-8 cursor-zoom-out" onClick={() => setImg(null)}>
          <img src={img} alt="Screenshot" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors" onClick={() => setImg(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
type Page = "dashboard" | "run" | "history" | { detail: number };

function Sidebar({ page, onNav, col, onCol }: { page: Page; onNav: (p: Page) => void; col: boolean; onCol: () => void }) {
  const { theme, toggle } = useContext(ThemeCtx);
  const items: { k: Page; l: string; i: React.ReactNode }[] = [
    { k: "dashboard", l: "Dashboard", i: <I.Chart /> },
    { k: "run", l: "Yeni Test", i: <I.Play /> },
    { k: "history", l: "Geçmiş", i: <I.History /> },
  ];
  const active = (k: Page) => typeof page === "object" ? k === "history" : page === k;
  return (
    <aside className={`fixed left-0 top-0 h-screen bg-white dark:bg-zinc-950 border-r border-gray-200 dark:border-zinc-800 flex flex-col z-30 transition-all duration-300 ${col ? "w-[60px]" : "w-52"}`}>
      <div className={`flex items-center h-14 border-b border-gray-200 dark:border-zinc-800 shrink-0 ${col ? "justify-center px-0" : "px-4 gap-3"}`}>
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        {!col && <div className="flex flex-col leading-tight"><span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">AI Test</span><span className="text-[10px] text-gray-400 dark:text-zinc-600 font-mono">automation</span></div>}
      </div>
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {items.map(it => (
          <button key={String(it.k)} onClick={() => onNav(it.k)} title={col ? it.l : undefined}
            className={`w-full flex items-center gap-2.5 rounded-lg text-sm transition-all ${col ? "justify-center py-2.5 px-0" : "px-3 py-2"} ${active(it.k) ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium" : "text-gray-500 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-900 hover:text-gray-700 dark:hover:text-zinc-300"}`}>
            <span className="shrink-0">{it.i}</span>{!col && <span>{it.l}</span>}
          </button>
        ))}
      </nav>
      <div className="border-t border-gray-200 dark:border-zinc-800 p-2 space-y-0.5">
        <button onClick={toggle} title={col ? (theme === "dark" ? "Aydınlık" : "Karanlık") : undefined}
          className={`w-full flex items-center gap-2.5 rounded-lg text-sm text-gray-500 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-900 hover:text-gray-700 dark:hover:text-zinc-300 transition-all ${col ? "justify-center py-2.5 px-0" : "px-3 py-2"}`}>
          <span className="shrink-0">{theme === "dark" ? <I.Sun /> : <I.Moon />}</span>{!col && <span>{theme === "dark" ? "Aydınlık mod" : "Karanlık mod"}</span>}
        </button>
        <button onClick={onCol}
          className={`w-full flex items-center gap-2.5 rounded-lg text-sm text-gray-400 dark:text-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-900 hover:text-gray-600 dark:hover:text-zinc-400 transition-all ${col ? "justify-center py-2.5 px-0" : "px-3 py-2"}`}>
          <span className="shrink-0"><I.Collapse flip={col} /></span>{!col && <span>Daralt</span>}
        </button>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════════════════════
function TopBar({ title, sub, col }: { title: string; sub?: string; col: boolean }) {
  return (
    <header className={`sticky top-0 z-20 h-14 bg-gray-50/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-800 flex items-center px-6 transition-all duration-300 ${col ? "ml-[60px]" : "ml-52"}`}>
      <div><h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{title}</h2>{sub && <p className="text-[11px] text-gray-400 dark:text-zinc-600 -mt-0.5">{sub}</p>}</div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════
function AppInner() {
  const [page, setPage] = useState<Page>("dashboard");
  const [col, setCol] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);

  const refresh = () => { Promise.all([apiStats(), apiHistory(50)]).then(([s, r]) => { setStats(s); setRuns(r); }).catch(() => {}); };
  useEffect(refresh, []);

  const urls = [...new Set(runs.map(r => r.test.targetUrl).filter(Boolean))] as string[];
  const detail = (id: number) => setPage({ detail: id });
  const titles: Record<string, { t: string; s: string }> = { dashboard: { t: "Dashboard", s: "Genel bakış ve istatistikler" }, run: { t: "Yeni Test", s: "Test oluştur ve çalıştır" }, history: { t: "Test Geçmişi", s: "Tüm test sonuçları" } };
  const pt = typeof page === "string" ? titles[page] : { t: "Test Detayı", s: "Adım adım sonuçlar" };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 transition-colors">
      <Sidebar page={page} onNav={p => { setPage(p); if (p !== "run") refresh(); }} col={col} onCol={() => setCol(!col)} />
      <TopBar title={pt.t} sub={pt.s} col={col} />
      <main className={`transition-all duration-300 ${col ? "ml-[60px]" : "ml-52"} px-8 py-6`}>
        {page === "dashboard" && <DashPage stats={stats} runs={runs} onSelect={detail} />}
        {page === "run" && <RunPage onDone={id => { detail(id); refresh(); }} pastUrls={urls} />}
        {page === "history" && <HistPage onSelect={detail} />}
        {typeof page === "object" && <DetailPage id={page.detail} onBack={() => { setPage("history"); refresh(); }} />}
      </main>
    </div>
  );
}

export default function App() {
  return <ThemeProvider><AppInner /></ThemeProvider>;
}