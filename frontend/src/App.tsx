import { useState, useEffect, useLayoutEffect, useRef, createContext, useContext, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// API CONFIG & TYPES — Docker / Render: prod’da backend host; yerelde localhost
// VITE_API_BASE / VITE_SCREENSHOTS_BASE ile override edebilirsin.
// ═══════════════════════════════════════════════════════════════════════════
const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "http://localhost:3001/api" : "https://promptqa-backend.onrender.com/api");
const SCREENSHOTS_BASE =
  import.meta.env.VITE_SCREENSHOTS_BASE ??
  (import.meta.env.DEV
    ? "http://localhost:3001/screenshots"
    : "https://promptqa-backend.onrender.com/screenshots");

interface Screenshot { id: number; filePath: string; fileSize: number | null; format: string; }
interface TestStep {
  id: number; stepNumber: number; action: string; target: string | null;
  value: string | null; aiReasoning: string | null; aiConfidence: number | null;
  success: boolean; errorMsg: string | null; durationMs: number | null;
  screenshot: Screenshot | null;
}
interface Test { id: number; testName: string; userPrompt: string; targetUrl: string | null; }
interface PromptVersion {
  id: number; testId: number; version: string; promptText: string;
  totalRuns: number; successCount: number; failCount: number; bugCount: number;
  successRate: number; avgDurationMs: number | null;
  parentVersionId: number | null; improvementReason: string | null;
  isActive: boolean; createdAt: string;
  test?: { id?: number; testName: string; targetUrl: string | null };
  _count?: { testRuns: number };
}
interface PromptVersionStats {
  totalVersions: number; activeVersions: number;
  avgSuccessRate: number; bestVersion: PromptVersion | null;
}
interface Folder {
  id: number; name: string; color: string; icon: string | null;
  createdAt: string; _count?: { testRuns: number };
}
interface FolderListResponse {
  folders: Folder[];
  unfiledCount: number;
  totalCount: number;
}
interface TestRun {
  id: number; status: string; startTime: string; endTime: string | null;
  durationMs: number | null; errorMsg: string | null; browser: string;
  test: Test; steps: TestStep[];
  promptVersion?: PromptVersion | null;
  folders?: Folder[];   // YENİ: çoklu klasör
}
interface Stats { total: number; success: number; failed: number; bugs?: number; successRate: string; }
interface ImprovedPrompt {
  originalPrompt: string;
  improvedPrompt: string;
  changes: string[];
  wasImproved: boolean;
}
interface ReportsData {
  healthScore: { score: number; label: string; color: string; breakdown: any };
  timelineTrend: { series: any[]; summary: any };
  bugHotspots: { totalBugs: number; topUrls: any[]; topTests: any[] };
  promptPerformance: { best: any[]; worst: any[]; totalAnalyzed: number };
  aiMetrics: any;
  yearlyHighlights: any;
}

function ssUrl(fp: string) { return `${SCREENSHOTS_BASE}/${fp.split(/[\\/]/).pop()}`; }

// ─── API FUNCTIONS ───
async function apiRunTest(p: any): Promise<TestRun> {
  const r = await fetch(`${API_BASE}/tests/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
  const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiRerun(id: number, userPrompt?: string): Promise<TestRun> {
  const r = await fetch(`${API_BASE}/tests/${id}/rerun`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(userPrompt ? { userPrompt } : {}) });
  const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiDeleteTest(id: number): Promise<void> {
  const r = await fetch(`${API_BASE}/tests/${id}`, { method: "DELETE" });
  const d = await r.json(); if (!d.success) throw new Error(d.error);
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
async function apiPromptVersions(): Promise<PromptVersion[]> {
  const r = await fetch(`${API_BASE}/prompt-versions`); const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiPromptVersionStats(): Promise<PromptVersionStats> {
  const r = await fetch(`${API_BASE}/prompt-versions/stats`); const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiImprovePrompt(prompt: string, testName?: string, targetUrl?: string): Promise<ImprovedPrompt> {
  const r = await fetch(`${API_BASE}/prompts/improve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, testName, targetUrl }) });
  const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiGetFolders(): Promise<FolderListResponse> {
  const r = await fetch(`${API_BASE}/folders`); const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiCreateFolder(data: { name: string; color?: string }): Promise<Folder> {
  const r = await fetch(`${API_BASE}/folders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
}
async function apiDeleteFolder(id: number): Promise<void> {
  const r = await fetch(`${API_BASE}/folders/${id}`, { method: "DELETE" });
  const d = await r.json(); if (!d.success) throw new Error(d.error);
}
// YENİ: ekleme/çıkarma
async function apiAddToFolder(testRunId: number, folderId: number): Promise<void> {
  const r = await fetch(`${API_BASE}/folders/add`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testRunId, folderId }) });
  const d = await r.json(); if (!d.success) throw new Error(d.error);
}
async function apiRemoveFromFolder(testRunId: number, folderId: number): Promise<void> {
  const r = await fetch(`${API_BASE}/folders/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testRunId, folderId }) });
  const d = await r.json(); if (!d.success) throw new Error(d.error);
}
async function apiGetReports(): Promise<ReportsData> {
  const r = await fetch(`${API_BASE}/reports`); const d = await r.json(); if (!d.success) throw new Error(d.error); return d.data;
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
// LANGUAGE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════
type Lang = "tr" | "en";
const TRANSLATIONS = {
  tr: {
    "nav.dashboard": "Dashboard", "nav.run": "Yeni Test", "nav.history": "Geçmiş",
    "nav.prompts": "Promptlar", "nav.reports": "Raporlar",
    "nav.lightMode": "Aydınlık mod", "nav.darkMode": "Karanlık mod",
    "nav.collapse": "Daralt", "nav.brand": "AI Test",
    "page.dashboard.title": "Dashboard", "page.dashboard.sub": "Genel bakış ve istatistikler",
    "page.run.title": "Yeni Test", "page.run.sub": "Test oluştur, AI ile promptu iyileştir, çalıştır",
    "page.history.title": "Test Geçmişi", "page.history.sub": "Tüm test sonuçları, sürükle-bırak ile klasörle",
    "page.prompts.title": "Prompt Versiyonları", "page.prompts.sub": "Senaryo bazlı prompt versiyonları",
    "page.reports.title": "Raporlar", "page.reports.sub": "Yıllık özet, sağlık skoru ve trendler",
    "page.detail.title": "Test Detayı", "page.detail.sub": "Adım adım sonuçlar ve aksiyonlar",
    "status.SUCCESS": "Başarılı", "status.FAIL": "Başarısız", "status.ERROR": "Agent Hatası",
    "status.RUNNING": "Çalışıyor", "status.MAX_STEPS": "Limit Aşıldı", "status.BUG_FOUND": "Bug Bulundu",
    "common.cancel": "İptal", "common.confirm": "Onayla", "common.delete": "Sil",
    "common.run": "Çalıştır", "common.save": "Kaydet", "common.close": "Kapat",
    "common.steps": "Adım", "common.duration": "Süre", "common.status": "Durum",
    "common.date": "Tarih", "common.actions": "Aksiyonlar", "common.total": "Toplam",
    "common.success": "Başarılı", "common.fail": "Başarısız", "common.bug": "Bug",
    "common.empty": "Veri yok", "common.create": "Oluştur", "common.add": "Ekle",
    "stats.totalTests": "Toplam test", "stats.successful": "Başarılı",
    "stats.failed": "Başarısız", "stats.successRate": "Başarı oranı",
    "stats.lastTests": "Son testler",
    "run.testName": "Test adı", "run.targetUrl": "Hedef URL", "run.testPrompt": "Test promptu",
    "run.improve": "İyileştir",
    "run.improveTip": "Promptunuzu yazın, AI'a daha iyi anlayabileceği biçimde optimize ettirebilirsiniz.",
    "run.start": "Testi başlat", "run.running": "Test çalışıyor...",
    "run.fillAll": "Tüm alanları doldurun.",
    "run.testSuccess": "Test başarılı", "run.testFail": "Test başarısız", "run.testBug": "Bug tespit edildi",
    "run.details": "Detaylar",
    "hist.empty": "Henüz test yok.", "hist.test": "Test", "hist.version": "Versiyon",
    "hist.rerun": "Aynı promptla tekrar koş", "hist.editRerun": "Düzenle ve tekrar koş", "hist.delete": "Sil",
    "hist.deleteTitle": "Testi sil",
    "hist.deleteMsg": "Bu test ve tüm adımları, ekran görüntüleri kalıcı olarak silinecek. Bu işlem geri alınamaz.",
    "hist.editPromptTitle": "Promptu düzenle ve tekrar koş",
    "hist.editPromptDesc": "Promptu değiştirirseniz yeni bir prompt versiyonu oluşturulur. Aynı bırakırsanız mevcut versiyon istatistikleri güncellenir.",
    "hist.newVersion": "🆕 Yeni versiyon oluşturulacak", "hist.sameVersion": "📌 Mevcut versiyon güncellenecek",
    "hist.dragHint": "Test satırını sürükleyip sağdaki klasörlere bırakabilirsiniz",
    "detail.back": "Geçmişe dön", "detail.bugDetected": "Bug tespit edildi",
    "detail.steps": "Test adımları", "detail.confidence": "güven", "detail.value": "Değer",
    "detail.folders": "Klasörler", "detail.addFolder": "Klasöre ekle",
    "detail.noFolders": "Bu test henüz hiçbir klasörde değil",
    "detail.removeFolder": "Klasörden çıkar",
    "prompts.totalVersions": "Toplam versiyon", "prompts.activeVersions": "Aktif versiyon",
    "prompts.avgSuccess": "Ortalama başarı", "prompts.bestVersion": "En iyi versiyon",
    "prompts.empty": "Henüz prompt versiyonu yok.", "prompts.versions": "versiyon",
    "prompts.active": "● Aktif", "prompts.successCol": "Başarı", "prompts.runsCol": "Çalışma",
    "prompts.fullPrompt": "Tam prompt", "prompts.avgDuration": "Ortalama süre",
    "improve.title": "Prompt İyileştirme Önerisi", "improve.subtitle": "AI promptunuzu test ajanı için optimize etti",
    "improve.analyzing": "AI promptunu analiz ediyor...", "improve.failed": "İyileştirme başarısız",
    "improve.alreadyGood": "Promptunuz zaten iyi durumda",
    "improve.alreadyGoodSub": "AI önemli bir iyileştirme önerisi bulamadı.",
    "improve.yourPrompt": "Sizin promptunuz", "improve.suggested": "Önerilen versiyon",
    "improve.changes": "Yapılan iyileştirmeler", "improve.cancel": "Vazgeç",
    "improve.use": "Önerilen versiyonu kullan",
    "folders.title": "Klasörler", "folders.new": "Yeni klasör",
    "folders.all": "Tüm testler", "folders.unfiled": "Klasörsüz",
    "folders.empty": "Henüz klasör yok",
    "folders.createPlaceholder": "Klasör adı...", "folders.create": "Oluştur",
    "folders.delete": "Klasörü sil",
    "folders.deleteMsg": "Klasör silinecek. İçindeki testler silinmez.",
    "folders.dropHere": "Buraya bırak",
    "folders.testAdded": "Eklendi",
    "folders.alreadyIn": "Zaten bu klasörde",
    "folders.newFolderQuick": "+ Yeni klasör oluştur",
    "reports.healthScore": "Sistem Sağlık Skoru", "reports.healthSub": "Genel sistem sağlığı",
    "reports.timeline": "30 Günlük Trend", "reports.timelineSub": "Son 30 gün boyunca test sonuçları",
    "reports.weekTrend": "Geçen haftaya göre",
    "reports.bugHotspots": "Bug Hotspot Haritası",
    "reports.bugSub": "En çok bug bulunan platformlar ve testler",
    "reports.topUrls": "En çok bug bulunan URL'ler", "reports.topTests": "En çok bug bulunan testler",
    "reports.promptPerf": "Prompt Performansı",
    "reports.promptSub": "En iyi ve en kötü performans gösteren promptlar",
    "reports.bestPrompts": "En İyi Promptlar", "reports.worstPrompts": "İyileştirilmesi Gerekenler",
    "reports.aiMetrics": "AI Verimlilik Metrikleri", "reports.aiSub": "Sistem performansı ve maliyet",
    "reports.avgTestDuration": "Ortalama test süresi", "reports.avgStepDuration": "Adım başına süre",
    "reports.avgConfidence": "Ortalama güven", "reports.totalSteps": "Toplam adım",
    "reports.totalRuns": "Toplam test", "reports.estimatedCost": "Tahmini maliyet",
    "reports.topActions": "En çok kullanılan eylemler",
    "reports.yearly": "Yıllık Özet", "reports.yearlySub": "yılında neler yaptın?",
    "reports.yearTests": "test koştun", "reports.yearSuccessful": "başarılı sonuç",
    "reports.yearBugs": "bug buldun", "reports.yearSteps": "toplam adım",
    "reports.busiestDay": "En aktif gün", "reports.topAction": "Favori eylem",
    "reports.topPlatform": "En çok test edilen platform",
    "reports.empty": "Henüz raporlanacak veri yok.",
    "reports.zeroState": "Birkaç test çalıştırın, raporlar burada görünecek.",
  },
  en: {
    "nav.dashboard": "Dashboard", "nav.run": "New Test", "nav.history": "History",
    "nav.prompts": "Prompts", "nav.reports": "Reports",
    "nav.lightMode": "Light mode", "nav.darkMode": "Dark mode",
    "nav.collapse": "Collapse", "nav.brand": "AI Test",
    "page.dashboard.title": "Dashboard", "page.dashboard.sub": "Overview and statistics",
    "page.run.title": "New Test", "page.run.sub": "Create test, improve prompt with AI, run",
    "page.history.title": "Test History", "page.history.sub": "All test results, drag-drop to organize",
    "page.prompts.title": "Prompt Versions", "page.prompts.sub": "Scenario-based prompt versions",
    "page.reports.title": "Reports", "page.reports.sub": "Yearly summary, health score and trends",
    "page.detail.title": "Test Detail", "page.detail.sub": "Step by step results and actions",
    "status.SUCCESS": "Success", "status.FAIL": "Failed", "status.ERROR": "Agent Error",
    "status.RUNNING": "Running", "status.MAX_STEPS": "Limit Exceeded", "status.BUG_FOUND": "Bug Found",
    "common.cancel": "Cancel", "common.confirm": "Confirm", "common.delete": "Delete",
    "common.run": "Run", "common.save": "Save", "common.close": "Close",
    "common.steps": "Steps", "common.duration": "Duration", "common.status": "Status",
    "common.date": "Date", "common.actions": "Actions", "common.total": "Total",
    "common.success": "Success", "common.fail": "Failed", "common.bug": "Bug",
    "common.empty": "No data", "common.create": "Create", "common.add": "Add",
    "stats.totalTests": "Total tests", "stats.successful": "Successful",
    "stats.failed": "Failed", "stats.successRate": "Success rate",
    "stats.lastTests": "Recent tests",
    "run.testName": "Test name", "run.targetUrl": "Target URL", "run.testPrompt": "Test prompt",
    "run.improve": "Improve",
    "run.improveTip": "Write your prompt and let AI optimize it for better understanding.",
    "run.start": "Start test", "run.running": "Test running...",
    "run.fillAll": "Please fill all fields.",
    "run.testSuccess": "Test successful", "run.testFail": "Test failed", "run.testBug": "Bug detected",
    "run.details": "Details",
    "hist.empty": "No tests yet.", "hist.test": "Test", "hist.version": "Version",
    "hist.rerun": "Rerun with same prompt", "hist.editRerun": "Edit and rerun", "hist.delete": "Delete",
    "hist.deleteTitle": "Delete test",
    "hist.deleteMsg": "This test and all its steps, screenshots will be permanently deleted.",
    "hist.editPromptTitle": "Edit prompt and rerun",
    "hist.editPromptDesc": "If you change the prompt, a new version is created.",
    "hist.newVersion": "🆕 New version will be created", "hist.sameVersion": "📌 Current version will be updated",
    "hist.dragHint": "Drag a test row and drop it on a folder on the right",
    "detail.back": "Back to history", "detail.bugDetected": "Bug detected",
    "detail.steps": "Test steps", "detail.confidence": "confidence", "detail.value": "Value",
    "detail.folders": "Folders", "detail.addFolder": "Add to folder",
    "detail.noFolders": "This test is not in any folder yet",
    "detail.removeFolder": "Remove from folder",
    "prompts.totalVersions": "Total versions", "prompts.activeVersions": "Active versions",
    "prompts.avgSuccess": "Avg success", "prompts.bestVersion": "Best version",
    "prompts.empty": "No prompt versions yet.", "prompts.versions": "versions",
    "prompts.active": "● Active", "prompts.successCol": "Success", "prompts.runsCol": "Runs",
    "prompts.fullPrompt": "Full prompt", "prompts.avgDuration": "Avg duration",
    "improve.title": "Prompt Improvement Suggestion", "improve.subtitle": "AI optimized your prompt for the test agent",
    "improve.analyzing": "AI is analyzing your prompt...", "improve.failed": "Improvement failed",
    "improve.alreadyGood": "Your prompt is already good",
    "improve.alreadyGoodSub": "AI didn't find any significant improvements.",
    "improve.yourPrompt": "Your prompt", "improve.suggested": "Suggested version",
    "improve.changes": "Improvements made", "improve.cancel": "Cancel",
    "improve.use": "Use suggested version",
    "folders.title": "Folders", "folders.new": "New folder",
    "folders.all": "All tests", "folders.unfiled": "Unfiled",
    "folders.empty": "No folders yet",
    "folders.createPlaceholder": "Folder name...", "folders.create": "Create",
    "folders.delete": "Delete folder",
    "folders.deleteMsg": "Folder will be deleted. Tests inside won't be deleted.",
    "folders.dropHere": "Drop here",
    "folders.testAdded": "Added",
    "folders.alreadyIn": "Already in this folder",
    "folders.newFolderQuick": "+ Create new folder",
    "reports.healthScore": "System Health Score", "reports.healthSub": "Overall system health",
    "reports.timeline": "30-Day Trend", "reports.timelineSub": "Test results over the last 30 days",
    "reports.weekTrend": "vs last week",
    "reports.bugHotspots": "Bug Hotspot Map",
    "reports.bugSub": "Platforms and tests with most bugs",
    "reports.topUrls": "URLs with most bugs", "reports.topTests": "Tests with most bugs",
    "reports.promptPerf": "Prompt Performance",
    "reports.promptSub": "Best and worst performing prompts",
    "reports.bestPrompts": "Top Performing Prompts", "reports.worstPrompts": "Needs Improvement",
    "reports.aiMetrics": "AI Efficiency Metrics", "reports.aiSub": "System performance and cost",
    "reports.avgTestDuration": "Avg test duration", "reports.avgStepDuration": "Avg per step",
    "reports.avgConfidence": "Avg confidence", "reports.totalSteps": "Total steps",
    "reports.totalRuns": "Total tests", "reports.estimatedCost": "Estimated cost",
    "reports.topActions": "Most used actions",
    "reports.yearly": "Yearly Summary", "reports.yearlySub": "what you did in",
    "reports.yearTests": "tests run", "reports.yearSuccessful": "successful results",
    "reports.yearBugs": "bugs found", "reports.yearSteps": "total steps",
    "reports.busiestDay": "Busiest day", "reports.topAction": "Favorite action",
    "reports.topPlatform": "Most tested platform",
    "reports.empty": "No data to report yet.",
    "reports.zeroState": "Run a few tests, reports will appear here.",
  }
};

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }>({
  lang: "tr", setLang: () => {}, t: (k) => k
});

function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("qa-lang") as Lang) || "tr";
    }
    return "tr";
  });
  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem("qa-lang", l); };
  const t = (key: string): string => (TRANSLATIONS[lang] as any)[key] || (TRANSLATIONS.tr as any)[key] || key;
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

const useT = () => useContext(LangCtx).t;
const useLang = () => useContext(LangCtx);

// ═══════════════════════════════════════════════════════════════════════════
// DRAG CONTEXT — sürüklenmekte olan test ID'sini paylaşmak için
// ═══════════════════════════════════════════════════════════════════════════
const DragCtx = createContext<{ draggingId: number | null; setDraggingId: (id: number | null) => void }>({
  draggingId: null, setDraggingId: () => {}
});

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
  Layers: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>,
  Refresh: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0115-6.7L21 8M21 4v4h-4M21 12a9 9 0 01-15 6.7L3 16M3 20v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Pencil: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Trash: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Sparkle: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5L14 8M8 16l-2.5 2.5m13 0L16 16M8 8L5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Folder: () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Plus: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  X: () => <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Heart: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  TrendUp: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  TrendDown: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Bug: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="6" y="8" width="12" height="11" rx="6" stroke="currentColor" strokeWidth="2"/><path d="M12 19v-8M9 5l1.5 2M15 5l-1.5 2M3 13h3M18 13h3M3 8l3 1M18 9l3-1M3 18l3-1M18 17l3 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Star: () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  Award: () => <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="7" stroke="currentColor" strokeWidth="2"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Calendar: () => <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  Drag: () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>,
  Collapse: ({ flip }: { flip?: boolean }) => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" style={{ transform: flip ? "rotate(180deg)" : "none", transition: "transform .3s" }}><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Down: ({ open }: { open?: boolean }) => <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const ST: Record<string, { c: string; bg: string; bd: string; dot: string }> = {
  SUCCESS:   { c: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", bd: "border-emerald-200 dark:border-emerald-500/20", dot: "bg-emerald-500" },
  FAIL:      { c: "text-red-600 dark:text-red-400",         bg: "bg-red-50 dark:bg-red-500/10",         bd: "border-red-200 dark:border-red-500/20",         dot: "bg-red-500" },
  ERROR:     { c: "text-orange-600 dark:text-orange-400",   bg: "bg-orange-50 dark:bg-orange-500/10",   bd: "border-orange-200 dark:border-orange-500/20",   dot: "bg-orange-500" },
  RUNNING:   { c: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-50 dark:bg-blue-500/10",       bd: "border-blue-200 dark:border-blue-500/20",       dot: "bg-blue-500 animate-pulse" },
  MAX_STEPS: { c: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-500/10",     bd: "border-amber-200 dark:border-amber-500/20",     dot: "bg-amber-500" },
  BUG_FOUND: { c: "text-yellow-600 dark:text-yellow-400",   bg: "bg-yellow-50 dark:bg-yellow-500/10",   bd: "border-yellow-200 dark:border-yellow-500/20",   dot: "bg-yellow-500" },
};

function Badge({ status }: { status: string }) {
  const t = useT();
  const s = ST[status] || ST.ERROR;
  return <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${s.bg} ${s.c} ${s.bd}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}/>{t(`status.${status}`)}</span>;
}

function VersionBadge({ version, isActive }: { version: string; isActive?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
      isActive
        ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30"
        : "bg-gray-50 text-gray-600 border-gray-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700"
    }`}>{version}</span>
  );
}

function FolderChip({ folder, onRemove }: { folder: Folder; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border"
      style={{ backgroundColor: folder.color + "20", borderColor: folder.color + "60", color: folder.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: folder.color }} />
      {folder.name}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 hover:opacity-70" title="Çıkar"><I.X /></button>
      )}
    </span>
  );
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
// TOAST (basit bildirim)
// ═══════════════════════════════════════════════════════════════════════════
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-fade-in">
      {message}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════════════
function Confirm({ open, title, msg, onYes, onNo, danger }: { open: boolean; title: string; msg: string; onYes: () => void; onNo: () => void; danger?: boolean }) {
  const t = useT();
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={onNo}>
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-1">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4">{msg}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onNo} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800">{t("common.cancel")}</button>
          <button onClick={onYes} className={`px-4 py-2 text-sm rounded-lg font-medium text-white ${danger ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"}`}>{t("common.confirm")}</button>
        </div>
      </div>
    </div>
  );
}

function EditRerunModal({ open, originalPrompt, onClose, onSubmit }: { open: boolean; originalPrompt: string; onClose: () => void; onSubmit: (newPrompt: string) => void }) {
  const t = useT();
  const [prompt, setPrompt] = useState(originalPrompt);
  useEffect(() => { setPrompt(originalPrompt); }, [originalPrompt]);
  if (!open) return null;
  const changed = prompt.trim() !== originalPrompt.trim();
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">{t("hist.editPromptTitle")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200">✕</button>
        </div>
        <p className="text-xs text-gray-500 dark:text-zinc-500 mb-3">{t("hist.editPromptDesc")}</p>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={8}
          className="w-full bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 resize-none font-mono leading-relaxed" />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-gray-400 dark:text-zinc-600">{changed ? t("hist.newVersion") : t("hist.sameVersion")}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800">{t("common.cancel")}</button>
            <button onClick={() => onSubmit(prompt)} disabled={!prompt.trim()} className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-zinc-700 flex items-center gap-1.5"><I.Play /> {t("common.run")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptImproveModal({ open, data, loading, error, onAccept, onReject }: { open: boolean; data: ImprovedPrompt | null; loading: boolean; error: string | null; onAccept: () => void; onReject: () => void; }) {
  const t = useT();
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={onReject}>
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 rounded-lg flex items-center justify-center"><I.Sparkle /></span>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">{t("improve.title")}</h3>
              <p className="text-xs text-gray-500 dark:text-zinc-500">{t("improve.subtitle")}</p>
            </div>
          </div>
          <button onClick={onReject} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 text-xl">✕</button>
        </div>
        {loading && <div className="flex flex-col items-center justify-center py-16 gap-3"><Spin /><p className="text-sm text-gray-500 dark:text-zinc-500">{t("improve.analyzing")}</p></div>}
        {error && !loading && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
            <p className="font-medium mb-1">{t("improve.failed")}</p><p>{error}</p>
          </div>
        )}
        {data && !loading && !error && (
          <>
            {!data.wasImproved ? (
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg p-4 text-center py-12">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3"><I.Ok /></div>
                <p className="font-medium text-gray-900 dark:text-zinc-100 mb-1">{t("improve.alreadyGood")}</p>
                <p className="text-sm text-gray-500 dark:text-zinc-500">{t("improve.alreadyGoodSub")}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-2 block">{t("improve.yourPrompt")}</span>
                    <div className="bg-gray-50 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 h-64 overflow-y-auto">
                      <p className="text-sm text-gray-700 dark:text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap">{data.originalPrompt}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-2 flex items-center gap-1"><I.Sparkle /> {t("improve.suggested")}</span>
                    <div className="bg-violet-50/50 dark:bg-violet-500/5 border-2 border-violet-200 dark:border-violet-500/30 rounded-lg p-4 h-64 overflow-y-auto">
                      <p className="text-sm text-gray-700 dark:text-zinc-200 font-mono leading-relaxed whitespace-pre-wrap">{data.improvedPrompt}</p>
                    </div>
                  </div>
                </div>
                {data.changes.length > 0 && (
                  <div className="bg-blue-50/50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 mb-4">
                    <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-2">{t("improve.changes")}</p>
                    <ul className="space-y-1.5">{data.changes.map((c, i) => <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-zinc-300"><span className="text-blue-500 mt-1">•</span><span>{c}</span></li>)}</ul>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={onReject} className="px-5 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800">{t("improve.cancel")}</button>
                  <button onClick={onAccept} className="px-5 py-2 text-sm rounded-lg font-medium text-white bg-violet-600 hover:bg-violet-500 flex items-center gap-1.5"><I.Sparkle /> {t("improve.use")}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FolderCreateModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string, color: string) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#06b6d4"];
  useEffect(() => { if (open) { setName(""); setColor("#3b82f6"); } }, [open]);
  if (!open) return null;
  const Body = (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-5 w-full" onClick={e => e.stopPropagation()}>
      <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-4">{t("folders.new")}</h3>
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t("folders.createPlaceholder")} autoFocus
        onKeyDown={e => e.key === "Enter" && name.trim() && onCreate(name.trim(), color)}
        className="w-full bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 mb-3" />
      <div className="flex gap-2 mb-4">
        {colors.map(c => <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-zinc-900" : ""}`} style={{ backgroundColor: c }} />)}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800">{t("common.cancel")}</button>
        <button onClick={() => name.trim() && onCreate(name.trim(), color)} disabled={!name.trim()} className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-zinc-700">{t("folders.create")}</button>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-6" onClick={onClose}>
      <div className="max-w-sm w-full">{Body}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLDERS PANEL — drag-drop hedef
// ═══════════════════════════════════════════════════════════════════════════
function FoldersPanel({ selectedFolderId, onSelect, collapsed, onToggle, refreshKey, onRefresh, showToast }: {
  selectedFolderId: number | "all" | "unfiled";
  onSelect: (id: number | "all" | "unfiled") => void;
  collapsed: boolean; onToggle: () => void; refreshKey: number;
  onRefresh: () => void;
  showToast: (msg: string) => void;
}) {
  const t = useT();
  const { draggingId, setDraggingId } = useContext(DragCtx);
  const [data, setData] = useState<FolderListResponse | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [hoverFolderId, setHoverFolderId] = useState<number | "all" | "unfiled" | null>(null);

  const load = () => apiGetFolders().then(setData).catch(() => {});
  useEffect(() => {
    void load();
  }, [refreshKey]);

  const handleCreate = async (name: string, color: string) => {
    try { await apiCreateFolder({ name, color }); setCreateOpen(false); load(); onRefresh(); }
    catch (e) { alert(e instanceof Error ? e.message : "Hata"); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await apiDeleteFolder(deleting.id);
      setDeleting(null);
      if (selectedFolderId === deleting.id) onSelect("all");
      load(); onRefresh();
    } catch (e) { alert(e instanceof Error ? e.message : "Hata"); }
  };

  const handleDrop = async (folderId: number) => {
    if (!draggingId) return;
    const tId = draggingId;
    setDraggingId(null);
    setHoverFolderId(null);
    try {
      await apiAddToFolder(tId, folderId);
      const folderName = data?.folders.find(f => f.id === folderId)?.name || "";
      showToast(`"${folderName}" → ${t("folders.testAdded")}`);
      load(); onRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Hata");
    }
  };

  if (collapsed) {
    return (
      <button onClick={onToggle} title={t("folders.title")}
        className="fixed right-0 top-20 bg-white dark:bg-zinc-900 border-l border-y border-gray-200 dark:border-zinc-800 rounded-l-lg p-2 z-20 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-500">
        <I.Folder />
      </button>
    );
  }

  return (
    <>
      <aside className="fixed right-0 top-14 bottom-0 w-60 bg-white dark:bg-zinc-950 border-l border-gray-200 dark:border-zinc-800 z-20 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <I.Folder />
            <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{t("folders.title")}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setCreateOpen(true)} title={t("folders.new")} className="p-1.5 rounded-md text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400"><I.Plus /></button>
            <button onClick={onToggle} title={t("nav.collapse")} className="p-1.5 rounded-md text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-800"><I.Collapse /></button>
          </div>
        </div>

        {draggingId && (
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20">
            <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium text-center">{t("folders.dropHere")}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* All */}
          <button onClick={() => onSelect("all")}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm ${selectedFolderId === "all" ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" : "text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-900"}`}>
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            <span className="truncate flex-1 text-left">{t("folders.all")}</span>
            <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-600">{data?.totalCount ?? 0}</span>
          </button>

          {/* Unfiled */}
          <button onClick={() => onSelect("unfiled")}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm ${selectedFolderId === "unfiled" ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" : "text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-900"}`}>
            <span className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="truncate flex-1 text-left">{t("folders.unfiled")}</span>
            <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-600">{data?.unfiledCount ?? 0}</span>
          </button>

          <div className="h-px bg-gray-100 dark:bg-zinc-800 my-2" />

          {data?.folders.length === 0 && (
            <p className="text-[11px] text-gray-400 dark:text-zinc-600 text-center py-4">{t("folders.empty")}</p>
          )}

          {data?.folders.map(f => {
            const isActive = selectedFolderId === f.id;
            const isHover = hoverFolderId === f.id && draggingId;
            return (
              <div key={f.id}
                onDragOver={(e) => { e.preventDefault(); setHoverFolderId(f.id); }}
                onDragLeave={() => setHoverFolderId(null)}
                onDrop={(e) => { e.preventDefault(); handleDrop(f.id); }}
                className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-all ${
                  isHover ? "bg-blue-100 dark:bg-blue-500/20 ring-2 ring-blue-500 scale-[1.02]" :
                  isActive ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                  "text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-900"
                }`}>
                <button onClick={() => onSelect(f.id)} className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                  <span className={`truncate flex-1 text-left ${isHover ? "text-blue-700 dark:text-blue-300" : ""}`}>{f.name}</span>
                  <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 shrink-0">{f._count?.testRuns ?? 0}</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setDeleting(f); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500" title={t("folders.delete")}>
                  <I.Trash />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <FolderCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <Confirm open={!!deleting} title={t("folders.delete")} msg={t("folders.deleteMsg")} onYes={handleDelete} onNo={() => setDeleting(null)} danger />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// "ADD TO FOLDER" DROPDOWN — test detayında kullanılır
// ═══════════════════════════════════════════════════════════════════════════
function AddToFolderDropdown({ run, allFolders, onChanged, onCreateRequested }: {
  run: TestRun;
  allFolders: Folder[];
  onChanged: () => void;
  onCreateRequested: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const currentIds = new Set((run.folders || []).map(f => f.id));

  const handleClick = async (folder: Folder) => {
    const isInFolder = currentIds.has(folder.id);
    try {
      if (isInFolder) {
        await apiRemoveFromFolder(run.id, folder.id);
      } else {
        await apiAddToFolder(run.id, folder.id);
      }
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Hata");
    }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/20">
        <I.Plus /> {t("detail.addFolder")}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-lg dark:shadow-black/50 overflow-hidden z-30 min-w-[220px]">
          <div className="max-h-60 overflow-y-auto">
            {allFolders.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 dark:text-zinc-600 text-center">{t("folders.empty")}</p>
            ) : allFolders.map(f => {
              const inFolder = currentIds.has(f.id);
              return (
                <button key={f.id} onClick={() => handleClick(f)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                  <span className="truncate flex-1 text-gray-700 dark:text-zinc-300">{f.name}</span>
                  {inFolder && <span className="text-emerald-500"><I.Ok /></span>}
                </button>
              );
            })}
          </div>
          <button onClick={() => { setOpen(false); onCreateRequested(); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium border-t border-gray-100 dark:border-zinc-800/50 flex items-center gap-1.5">
            <I.Plus /> {t("folders.newFolderQuick")}
          </button>
        </div>
      )}
    </div>
  );
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
          className="w-full bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-lg pl-9 pr-8 py-2.5 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 disabled:opacity-40" />
        {urls.length > 0 && <button type="button" onClick={() => setOpen(!open)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-zinc-500"><I.Down open={open} /></button>}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-lg dark:shadow-black/50 overflow-hidden">
          <div className="max-h-40 overflow-y-auto">{filtered.map((u, i) => (
            <button key={i} onClick={() => { onChange(u); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-500/10 flex items-center gap-2 text-gray-600 dark:text-zinc-400"><I.Globe /><span className="truncate font-mono text-xs">{u}</span></button>
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
  const t = useT();
  if (!stats) return <div className="flex justify-center py-24"><Spin /></div>;
  const rate = parseFloat(stats.successRate) || 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {([
          { l: t("stats.totalTests"), v: stats.total, c: "text-gray-900 dark:text-zinc-100", icon: <I.Chart /> },
          { l: t("stats.successful"), v: stats.success, c: "text-emerald-600 dark:text-emerald-400", icon: <I.Ok /> },
          { l: t("stats.failed"), v: stats.failed, c: "text-red-600 dark:text-red-400", icon: <I.Xx /> },
          { l: t("stats.successRate"), v: `%${stats.successRate}`, c: "text-amber-600 dark:text-amber-400", icon: <I.Zap /> },
        ]).map(s => (
          <div key={s.l} className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2"><p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{s.l}</p><span className="text-gray-300 dark:text-zinc-700">{s.icon}</span></div>
            <p className={`text-3xl font-bold font-mono ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">{t("stats.successRate")}</p>
          <span className="text-xl font-bold text-blue-600 dark:text-blue-400 font-mono">%{stats.successRate}</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-1000" style={{ width: `${rate}%` }} />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800/50"><p className="text-sm font-medium text-gray-700 dark:text-zinc-300">{t("stats.lastTests")}</p></div>
        {runs.slice(0, 6).map((run, i) => (
          <button key={run.id} onClick={() => onSelect(run.id)}
            className={`w-full flex items-center justify-between px-5 py-3 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 group ${i < Math.min(runs.length, 6) - 1 ? "border-b border-gray-100 dark:border-zinc-800/30" : ""}`}>
            <div className="flex items-center gap-3 min-w-0">
              <Badge status={run.status} />
              <span className="text-sm text-gray-900 dark:text-zinc-200 truncate">{run.test.testName}</span>
              {run.promptVersion && <VersionBadge version={run.promptVersion.version} isActive={run.promptVersion.isActive} />}
              {run.folders?.slice(0, 2).map(f => <FolderChip key={f.id} folder={f} />)}
              {(run.folders?.length || 0) > 2 && <span className="text-[10px] text-gray-400">+{(run.folders?.length || 0) - 2}</span>}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-gray-400 dark:text-zinc-600 shrink-0 font-mono">
              <span>{run.steps.length} {t("common.steps").toLowerCase()}</span>
              {run.durationMs && <span>{(run.durationMs / 1000).toFixed(1)}s</span>}
              <span className="text-gray-300 dark:text-zinc-700 group-hover:text-blue-500"><I.Right /></span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN PAGE
// ═══════════════════════════════════════════════════════════════════════════
function RunPage({ onDone, pastUrls }: { onDone: (id: number) => void; pastUrls: string[] }) {
  const t = useT();
  const [name, setName] = useState(""); const [url, setUrl] = useState(""); const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null); const [result, setResult] = useState<TestRun | null>(null);
  const [improveOpen, setImproveOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  const [improveData, setImproveData] = useState<ImprovedPrompt | null>(null);
  const [improveError, setImproveError] = useState<string | null>(null);

  const go = async () => {
    if (!name.trim() || !prompt.trim() || !url.trim()) { setError(t("run.fillAll")); return; }
    setLoading(true); setError(null); setResult(null);
    try { setResult(await apiRunTest({ testName: name, userPrompt: prompt, targetUrl: url })); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  };

  const handleImprove = async () => {
    if (!prompt.trim()) { setError(t("run.fillAll")); return; }
    setImproveOpen(true); setImproving(true); setImproveData(null); setImproveError(null);
    try { setImproveData(await apiImprovePrompt(prompt, name || undefined, url || undefined)); }
    catch (e: unknown) { setImproveError(e instanceof Error ? e.message : "Error"); }
    finally { setImproving(false); }
  };

  const acceptImprovement = () => { if (improveData) setPrompt(improveData.improvedPrompt); setImproveOpen(false); };
  const ic = "w-full bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 disabled:opacity-40";

  return (
    <>
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <div className="w-full bg-white dark:bg-zinc-900/30 border-2 border-blue-400 dark:border-blue-500/55 rounded-xl p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">{t("run.testName")}</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="SauceDemo Login" disabled={loading} className={ic} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">{t("run.targetUrl")}</label>
              <UrlCombo value={url} onChange={setUrl} disabled={loading} urls={pastUrls} />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider">{t("run.testPrompt")}</label>
              <button type="button" onClick={handleImprove} disabled={loading || !prompt.trim()} className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 border border-violet-200 dark:border-violet-500/20 disabled:opacity-40"><I.Sparkle /> {t("run.improve")}</button>
            </div>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} disabled={loading} className={`${ic} resize-none font-mono text-[13px] leading-relaxed`} placeholder="..." />
            <p className="text-[11px] text-gray-400 dark:text-zinc-600"> {t("run.improveTip")}</p>
          </div>
          {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <button onClick={go} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-600 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2.5 text-sm">
            {loading ? <><Spin sm /> {t("run.running")}</> : <><I.Play /> {t("run.start")}</>}
          </button>
        </div>
        {result && (
          <div className={`border rounded-xl p-5 ${result.status === "SUCCESS" ? "bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20" : result.status === "BUG_FOUND" ? "bg-yellow-50/50 dark:bg-yellow-500/5 border-yellow-200 dark:border-yellow-500/20" : "bg-red-50/50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${result.status === "SUCCESS" ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : result.status === "BUG_FOUND" ? "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" : "bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400"}`}>{result.status === "SUCCESS" ? <I.Ok /> : <I.Xx />}</div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-zinc-100 text-sm">{result.status === "SUCCESS" ? t("run.testSuccess") : result.status === "BUG_FOUND" ? t("run.testBug") : t("run.testFail")}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-500 dark:text-zinc-500 font-mono">{result.steps.length} {t("common.steps").toLowerCase()}{result.durationMs ? ` · ${(result.durationMs / 1000).toFixed(1)}s` : ""}</p>
                    {result.promptVersion && <VersionBadge version={result.promptVersion.version} isActive />}
                  </div>
                </div>
              </div>
              <button onClick={() => onDone(result.id)} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">{t("run.details")} <I.Right /></button>
            </div>
          </div>
        )}
      </div>
      <PromptImproveModal open={improveOpen} data={improveData} loading={improving} error={improveError} onAccept={acceptImprovement} onReject={() => setImproveOpen(false)} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY — DRAGGABLE ROWS
// ═══════════════════════════════════════════════════════════════════════════
function HistPage({ onSelect, refreshTrigger, selectedFolderId, onChanged }: {
  onSelect: (id: number) => void;
  refreshTrigger: number;
  selectedFolderId: number | "all" | "unfiled";
  onChanged: () => void;
}) {
  const t = useT();
  const { setDraggingId } = useContext(DragCtx);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<TestRun | null>(null);
  const [editModal, setEditModal] = useState<TestRun | null>(null);

  const load = () => { setLoading(true); apiHistory(100).then(setRuns).finally(() => setLoading(false)); };
  useEffect(load, [refreshTrigger]);

  const filteredRuns = useMemo(() => {
    if (selectedFolderId === "all") return runs;
    if (selectedFolderId === "unfiled") return runs.filter(r => !r.folders || r.folders.length === 0);
    return runs.filter(r => r.folders?.some(f => f.id === selectedFolderId));
  }, [runs, selectedFolderId]);

  const handleRerun = async (run: TestRun) => {
    setActionId(run.id);
    try { const newRun = await apiRerun(run.id); onSelect(newRun.id); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setActionId(null); }
  };
  const handleEditRerun = async (newPrompt: string) => {
    if (!editModal) return;
    const run = editModal; setEditModal(null); setActionId(run.id);
    try { const newRun = await apiRerun(run.id, newPrompt); onSelect(newRun.id); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setActionId(null); }
  };
  const handleDelete = async () => {
    if (!confirmDel) return;
    const run = confirmDel; setConfirmDel(null); setActionId(run.id);
    try { await apiDeleteTest(run.id); load(); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setActionId(null); }
  };

  if (loading) return <div className="flex justify-center py-24"><Spin /></div>;

  return (
    <>
      <div className="mb-3 px-3 py-2 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-200/50 dark:border-blue-500/20 rounded-lg">
        <p className="text-[11px] text-blue-700 dark:text-blue-400">{t("hist.dragHint")}</p>
      </div>

      {!filteredRuns.length ? (
        <div className="text-center py-20 text-gray-400 dark:text-zinc-600">{t("hist.empty")}</div>
      ) : (
        <div className="bg-white dark:bg-zinc-900/30 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[20px_1fr_110px_85px_140px_60px_60px_100px_115px] gap-3 px-5 py-2.5 text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest border-b border-gray-100 dark:border-zinc-800/50 bg-gray-50/50 dark:bg-zinc-900/50">
            <span></span><span>{t("hist.test")}</span><span>{t("common.status")}</span><span>{t("hist.version")}</span><span>{t("folders.title")}</span><span>{t("common.steps")}</span><span>{t("common.duration")}</span><span>{t("common.date")}</span><span className="text-right">{t("common.actions")}</span>
          </div>
          {filteredRuns.map((r, i) => {
            const isActing = actionId === r.id;
            return (
              <div key={r.id}
                draggable={!isActing}
                onDragStart={(e) => {
                  setDraggingId(r.id);
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/plain", String(r.id));
                }}
                onDragEnd={() => setDraggingId(null)}
                className={`grid grid-cols-[20px_1fr_110px_85px_140px_60px_60px_100px_115px] gap-3 px-5 py-3 items-center cursor-move ${i < filteredRuns.length - 1 ? "border-b border-gray-100 dark:border-zinc-800/30" : ""} ${isActing ? "opacity-50" : ""} hover:bg-gray-50/50 dark:hover:bg-zinc-900/30`}>
                <span className="text-gray-300 dark:text-zinc-700 hover:text-gray-500"><I.Drag /></span>
                <button onClick={() => onSelect(r.id)} disabled={isActing} className="text-left min-w-0 hover:opacity-80">
                  <p className="text-sm font-medium text-gray-900 dark:text-zinc-200 truncate">{r.test.testName}</p>
                  <p className="text-[11px] text-gray-400 dark:text-zinc-600 truncate">{r.test.userPrompt}</p>
                </button>
                <div><Badge status={r.status} /></div>
                <div>{r.promptVersion ? <VersionBadge version={r.promptVersion.version} isActive={r.promptVersion.isActive} /> : <span className="text-[11px] text-gray-300 dark:text-zinc-700">—</span>}</div>
                <div className="flex flex-wrap gap-1">
                  {(r.folders || []).slice(0, 2).map(f => <FolderChip key={f.id} folder={f} />)}
                  {(r.folders?.length || 0) > 2 && <span className="text-[10px] text-gray-400 dark:text-zinc-600">+{(r.folders?.length || 0) - 2}</span>}
                  {(r.folders?.length || 0) === 0 && <span className="text-[10px] text-gray-300 dark:text-zinc-700">—</span>}
                </div>
                <span className="text-sm text-gray-600 dark:text-zinc-400 font-mono">{r.steps.length}</span>
                <span className="text-sm text-gray-600 dark:text-zinc-400 font-mono">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</span>
                <span className="text-[11px] text-gray-400 dark:text-zinc-600">{new Date(r.startTime).toLocaleString()}</span>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => handleRerun(r)} disabled={isActing} title={t("hist.rerun")} className="p-1.5 rounded-md text-gray-500 dark:text-zinc-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30">{isActing ? <Spin sm /> : <I.Refresh />}</button>
                  <button onClick={() => setEditModal(r)} disabled={isActing} title={t("hist.editRerun")} className="p-1.5 rounded-md text-gray-500 dark:text-zinc-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-30"><I.Pencil /></button>
                  <button onClick={() => setConfirmDel(r)} disabled={isActing} title={t("hist.delete")} className="p-1.5 rounded-md text-gray-500 dark:text-zinc-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30"><I.Trash /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Confirm open={!!confirmDel} title={t("hist.deleteTitle")} msg={t("hist.deleteMsg")} onYes={handleDelete} onNo={() => setConfirmDel(null)} danger />
      <EditRerunModal open={!!editModal} originalPrompt={editModal?.test.userPrompt || ""} onClose={() => setEditModal(null)} onSubmit={handleEditRerun} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS PAGE
// ═══════════════════════════════════════════════════════════════════════════
function PromptsPage({ refreshTrigger }: { refreshTrigger: number }) {
  const t = useT();
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [stats, setStats] = useState<PromptVersionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([apiPromptVersions(), apiPromptVersionStats()])
      .then(([v, s]) => { setVersions(v); setStats(s); })
      .finally(() => setLoading(false));
  }, [refreshTrigger]);

  if (loading) return <div className="flex justify-center py-24"><Spin /></div>;

  const grouped: Record<string, PromptVersion[]> = {};
  versions.forEach(v => {
    const key = `${v.test?.testName || `Test ${v.testId}`}__${v.test?.targetUrl || ''}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(v);
  });
  Object.values(grouped).forEach(arr => arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {([
            { l: t("prompts.totalVersions"), v: stats.totalVersions, c: "text-gray-900 dark:text-zinc-100", icon: <I.Layers /> },
            { l: t("prompts.activeVersions"), v: stats.activeVersions, c: "text-emerald-600 dark:text-emerald-400", icon: <I.Ok /> },
            { l: t("prompts.avgSuccess"), v: `%${stats.avgSuccessRate}`, c: "text-violet-600 dark:text-violet-400", icon: <I.Zap /> },
            { l: t("prompts.bestVersion"), v: stats.bestVersion ? stats.bestVersion.version : "—", sub: stats.bestVersion ? `%${stats.bestVersion.successRate}` : "", c: "text-amber-600 dark:text-amber-400", icon: <I.Chart /> },
          ]).map(s => (
            <div key={s.l} className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2"><p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{s.l}</p><span className="text-gray-300 dark:text-zinc-700">{s.icon}</span></div>
              <p className={`text-3xl font-bold font-mono ${s.c}`}>{s.v}</p>
              {s.sub && <p className="text-[11px] text-gray-400 dark:text-zinc-600 mt-0.5 font-mono">{s.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-zinc-600">{t("prompts.empty")}</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([key, vs]) => (
            <div key={key} className="bg-white dark:bg-zinc-900/30 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div className="bg-gray-50/80 dark:bg-zinc-900/60 px-5 py-3 border-b border-gray-100 dark:border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{vs[0].test?.testName || "—"}</p>
                    {vs[0].test?.targetUrl && <p className="text-[11px] text-gray-400 dark:text-zinc-600 truncate font-mono mt-0.5">{vs[0].test.targetUrl}</p>}
                  </div>
                  <span className="text-[11px] bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 px-2 py-1 rounded font-medium shrink-0 ml-3">{vs.length} {t("prompts.versions")}</span>
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
                {vs.map(v => {
                  const isExpanded = expandedId === v.id;
                  const total = v.totalRuns;
                  return (
                    <div key={v.id} className="p-5">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : v.id)}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <VersionBadge version={v.version} isActive={v.isActive} />
                          {v.isActive && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">{t("prompts.active")}</span>}
                          <p className="text-sm text-gray-700 dark:text-zinc-300 truncate flex-1">{v.promptText}</p>
                        </div>
                        <div className="flex items-center gap-6 ml-4 shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-wider">{t("prompts.successCol")}</p>
                            <p className={`text-sm font-bold font-mono ${v.successRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : v.successRate >= 50 ? "text-amber-600 dark:text-amber-400" : total > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-zinc-600"}`}>{total > 0 ? `%${v.successRate.toFixed(0)}` : "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-wider">{t("prompts.runsCol")}</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-zinc-100 font-mono">{total}</p>
                          </div>
                          <span className="text-gray-300 dark:text-zinc-700"><I.Down open={isExpanded} /></span>
                        </div>
                      </div>
                      {total > 0 && (
                        <div className="mt-3 flex h-1.5 rounded-full overflow-hidden bg-gray-100 dark:bg-zinc-800/50">
                          <div className="bg-emerald-500" style={{ width: `${(v.successCount / total) * 100}%` }} />
                          <div className="bg-yellow-500" style={{ width: `${(v.bugCount / total) * 100}%` }} />
                          <div className="bg-red-500" style={{ width: `${(v.failCount / total) * 100}%` }} />
                        </div>
                      )}
                      {isExpanded && (
                        <div className="mt-4 space-y-3 pl-3 border-l-2 border-violet-300 dark:border-violet-800/50">
                          <div>
                            <p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-wider mb-1">{t("prompts.fullPrompt")}</p>
                            <div className="bg-gray-50 dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800/50 rounded-lg p-3">
                              <p className="text-xs text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{v.promptText}</p>
                            </div>
                          </div>
                          {v.avgDurationMs != null && v.avgDurationMs > 0 && (
                            <p className="text-xs text-gray-500 dark:text-zinc-500">{t("prompts.avgDuration")}: <span className="text-gray-700 dark:text-zinc-300 font-mono font-medium">{(v.avgDurationMs / 1000).toFixed(1)}s</span></p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════
function ReportsPage({ refreshTrigger }: { refreshTrigger: number }) {
  const t = useT();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setLoading(true); apiGetReports().then(setData).finally(() => setLoading(false)); }, [refreshTrigger]);

  if (loading) return <div className="flex justify-center py-24"><Spin /></div>;
  if (!data) return <div className="text-center py-20 text-gray-400 dark:text-zinc-600">{t("reports.empty")}</div>;
  if (data.healthScore.breakdown.totalRuns === 0) {
    return (
      <div className="text-center py-32">
        <div className="w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400 dark:text-zinc-500"><I.Chart /></div>
        <p className="text-gray-500 dark:text-zinc-500 mb-1">{t("reports.empty")}</p>
        <p className="text-sm text-gray-400 dark:text-zinc-600">{t("reports.zeroState")}</p>
      </div>
    );
  }

  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
    orange: "text-orange-600 dark:text-orange-400",
    red: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{t("reports.healthScore")}</p>
            <p className="text-[11px] text-gray-400 dark:text-zinc-600">{t("reports.healthSub")}</p>
          </div>
          <I.Heart />
        </div>
        <div className="flex items-center gap-8">
          <div className="relative w-36 h-36 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="10" fill="none" className="text-gray-200 dark:text-zinc-800" />
              <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="10" fill="none" strokeDasharray={`${(data.healthScore.score / 100) * 314} 314`} strokeLinecap="round" className={colorMap[data.healthScore.color] || "text-blue-500"} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold font-mono text-gray-900 dark:text-zinc-100">{data.healthScore.score}</span>
              <span className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase">/ 100</span>
            </div>
          </div>
          <div className="flex-1">
            <p className={`text-2xl font-bold ${colorMap[data.healthScore.color] || ""} mb-1`}>{data.healthScore.label}</p>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div><p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase">{t("common.success")}</p><p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">%{data.healthScore.breakdown.successRate}</p></div>
              <div><p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase">{t("common.fail")}</p><p className="text-sm font-bold font-mono text-red-600 dark:text-red-400">%{data.healthScore.breakdown.failRate}</p></div>
              <div><p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase">{t("common.bug")}</p><p className="text-sm font-bold font-mono text-yellow-600 dark:text-yellow-400">%{data.healthScore.breakdown.bugRate}</p></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{t("reports.timeline")}</p>
            <p className="text-[11px] text-gray-400 dark:text-zinc-600">{t("reports.timelineSub")}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {data.timelineTrend.summary.trendPercent > 0 ? <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><I.TrendUp /> +{data.timelineTrend.summary.trendPercent}%</span> : data.timelineTrend.summary.trendPercent < 0 ? <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><I.TrendDown /> {data.timelineTrend.summary.trendPercent}%</span> : <span className="text-gray-400 dark:text-zinc-600">—</span>}
            <span className="text-gray-400 dark:text-zinc-600">{t("reports.weekTrend")}</span>
          </div>
        </div>
        <TimelineChart series={data.timelineTrend.series} />
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div><p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{t("reports.bugHotspots")}</p><p className="text-[11px] text-gray-400 dark:text-zinc-600">{t("reports.bugSub")}</p></div>
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400"><I.Bug /> <span className="font-bold font-mono">{data.bugHotspots.totalBugs}</span></div>
        </div>
        {data.bugHotspots.totalBugs === 0 ? (
          <p className="text-center py-8 text-gray-400 dark:text-zinc-600 text-sm">🎉 {t("common.empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-2">{t("reports.topUrls")}</p>
              <div className="space-y-1.5">
                {data.bugHotspots.topUrls.map((u: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 dark:text-zinc-600 font-mono w-4">#{i + 1}</span>
                    <span className="flex-1 truncate font-mono text-gray-700 dark:text-zinc-300">{u.url}</span>
                    <span className="font-bold font-mono text-yellow-600 dark:text-yellow-400">{u.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-2">{t("reports.topTests")}</p>
              <div className="space-y-1.5">
                {data.bugHotspots.topTests.map((tt: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 dark:text-zinc-600 font-mono w-4">#{i + 1}</span>
                    <span className="flex-1 truncate text-gray-700 dark:text-zinc-300">{tt.name}</span>
                    <span className="font-bold font-mono text-yellow-600 dark:text-yellow-400">{tt.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div><p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{t("reports.promptPerf")}</p><p className="text-[11px] text-gray-400 dark:text-zinc-600">{t("reports.promptSub")}</p></div>
          <I.Award />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1"><I.Star /> {t("reports.bestPrompts")}</p>
            <div className="space-y-2">
              {data.promptPerformance.best.length === 0 ? <p className="text-xs text-gray-400 dark:text-zinc-600 italic">{t("common.empty")}</p> :
                data.promptPerformance.best.map((p: any) => (
                  <div key={p.id} className="bg-emerald-50/30 dark:bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-500/20 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <VersionBadge version={p.version} isActive />
                      <span className="text-xs font-medium text-gray-700 dark:text-zinc-300 truncate flex-1">{p.testName}</span>
                      <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">%{p.successRate.toFixed(0)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-zinc-500 italic line-clamp-2">{p.promptText}</p>
                  </div>
                ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1"><I.TrendDown /> {t("reports.worstPrompts")}</p>
            <div className="space-y-2">
              {data.promptPerformance.worst.length === 0 ? <p className="text-xs text-gray-400 dark:text-zinc-600 italic">🎉 {t("common.empty")}</p> :
                data.promptPerformance.worst.map((p: any) => (
                  <div key={p.id} className="bg-red-50/30 dark:bg-red-500/5 border border-red-200/50 dark:border-red-500/20 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <VersionBadge version={p.version} />
                      <span className="text-xs font-medium text-gray-700 dark:text-zinc-300 truncate flex-1">{p.testName}</span>
                      <span className="text-xs font-bold font-mono text-red-600 dark:text-red-400">%{p.successRate.toFixed(0)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-zinc-500 italic line-clamp-2">{p.promptText}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div><p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{t("reports.aiMetrics")}</p><p className="text-[11px] text-gray-400 dark:text-zinc-600">{t("reports.aiSub")}</p></div>
          <I.Zap />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {([
            { l: t("reports.avgTestDuration"), v: `${data.aiMetrics.avgTestDuration}s` },
            { l: t("reports.avgStepDuration"), v: `${data.aiMetrics.avgStepDuration}ms` },
            { l: t("reports.avgConfidence"), v: `%${data.aiMetrics.avgConfidence}` },
            { l: t("reports.totalSteps"), v: data.aiMetrics.totalSteps },
            { l: t("reports.totalRuns"), v: data.aiMetrics.totalRuns },
            { l: t("reports.estimatedCost"), v: `$${data.aiMetrics.estimatedCost}` },
          ]).map(s => (
            <div key={s.l} className="bg-gray-50 dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800/50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-wider mb-1">{s.l}</p>
              <p className="text-base font-bold font-mono text-gray-900 dark:text-zinc-100">{s.v}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="text-[11px] font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-2">{t("reports.topActions")}</p>
          <div className="flex flex-wrap gap-2">
            {data.aiMetrics.topActions.map((a: any) => (
              <div key={a.action} className="flex items-center gap-1.5 bg-gray-50 dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800/50 rounded-lg px-2.5 py-1">
                <AChip action={a.action} />
                <span className="text-xs font-mono text-gray-600 dark:text-zinc-400">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-violet-600 via-pink-600 to-orange-500 rounded-xl p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-90">{t("reports.yearly")}</p>
              <p className="text-3xl font-bold font-mono">{data.yearlyHighlights.year}</p>
            </div>
            <I.Award />
          </div>
          <p className="text-sm opacity-90 mb-4">{data.yearlyHighlights.year} {t("reports.yearlySub")}</p>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3"><p className="text-3xl font-bold font-mono">{data.yearlyHighlights.totalTests}</p><p className="text-[11px] opacity-80 mt-1">{t("reports.yearTests")}</p></div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3"><p className="text-3xl font-bold font-mono">{data.yearlyHighlights.successful}</p><p className="text-[11px] opacity-80 mt-1">{t("reports.yearSuccessful")}</p></div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3"><p className="text-3xl font-bold font-mono">{data.yearlyHighlights.bugsFound}</p><p className="text-[11px] opacity-80 mt-1">{t("reports.yearBugs")}</p></div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3"><p className="text-3xl font-bold font-mono">{data.yearlyHighlights.totalSteps}</p><p className="text-[11px] opacity-80 mt-1">{t("reports.yearSteps")}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            {data.yearlyHighlights.busiestDay && <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3"><div className="flex items-center gap-1 opacity-80 mb-1"><I.Calendar /> {t("reports.busiestDay")}</div><p className="font-bold">{data.yearlyHighlights.busiestDay.date}</p><p className="opacity-80">{data.yearlyHighlights.busiestDay.count} test</p></div>}
            {data.yearlyHighlights.topAction && <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3"><div className="flex items-center gap-1 opacity-80 mb-1"><I.Zap /> {t("reports.topAction")}</div><p className="font-bold font-mono uppercase">{data.yearlyHighlights.topAction.action}</p><p className="opacity-80">{data.yearlyHighlights.topAction.count}x</p></div>}
            {data.yearlyHighlights.topPlatform && <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3"><div className="flex items-center gap-1 opacity-80 mb-1"><I.Globe /> {t("reports.topPlatform")}</div><p className="font-bold font-mono">{data.yearlyHighlights.topPlatform.domain}</p><p className="opacity-80">{data.yearlyHighlights.topPlatform.count}x</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineChart({ series }: { series: any[] }) {
  const max = Math.max(1, ...series.map(d => d.total));
  const w = 100; const h = 80;
  const barWidth = w / series.length;
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-32">
        {series.map((d, i) => {
          const successH = (d.success / max) * h * 0.85;
          const bugH = (d.bug / max) * h * 0.85;
          const failH = (d.fail / max) * h * 0.85;
          const x = i * barWidth + barWidth * 0.15;
          const bw = barWidth * 0.7;
          let y = h;
          return (
            <g key={d.date}>
              {failH > 0 && <rect x={x} y={y - failH} width={bw} height={failH} fill="#ef4444" opacity="0.85" />}
              {(() => { y -= failH; return null; })()}
              {bugH > 0 && <rect x={x} y={y - bugH} width={bw} height={bugH} fill="#eab308" opacity="0.85" />}
              {(() => { y -= bugH; return null; })()}
              {successH > 0 && <rect x={x} y={y - successH} width={bw} height={successH} fill="#10b981" opacity="0.85" />}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-500 dark:text-zinc-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Success</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-500" /> Bug</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> Fail</span>
        <span className="ml-auto font-mono">{series[0]?.date} → {series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST DETAIL — Folder management eklendi
// ═══════════════════════════════════════════════════════════════════════════
function DetailPage({ id, onBack, onJump, allFolders, onFoldersChanged }: {
  id: number; onBack: () => void; onJump: (id: number) => void;
  allFolders: Folder[]; onFoldersChanged: () => void;
}) {
  const t = useT();
  const [run, setRun] = useState<TestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [img, setImg] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  const reload = () => apiGetTest(id).then(setRun);
  useEffect(() => { setLoading(true); reload().finally(() => setLoading(false)); }, [id]);

  const handleRerun = async () => {
    if (!run) return; setActing(true);
    try { const newRun = await apiRerun(run.id); onJump(newRun.id); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); setActing(false); }
  };
  const handleEditRerun = async (newPrompt: string) => {
    if (!run) return; setEditOpen(false); setActing(true);
    try { const newRun = await apiRerun(run.id, newPrompt); onJump(newRun.id); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); setActing(false); }
  };
  const handleDelete = async () => {
    if (!run) return; setConfirmDel(false); setActing(true);
    try { await apiDeleteTest(run.id); onBack(); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); setActing(false); }
  };

  const handleRemoveFolder = async (folderId: number) => {
    if (!run) return;
    try { await apiRemoveFromFolder(run.id, folderId); reload(); onFoldersChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Error"); }
  };

  const handleCreateFolder = async (name: string, color: string) => {
    if (!run) return;
    try {
      const folder = await apiCreateFolder({ name, color });
      await apiAddToFolder(run.id, folder.id);
      setCreateFolderOpen(false);
      reload();
      onFoldersChanged();
    } catch (e) { alert(e instanceof Error ? e.message : "Error"); }
  };

  if (loading) return <div className="flex justify-center py-24"><Spin /></div>;
  if (!run) return <div className="text-center py-20 text-gray-400 dark:text-zinc-600">—</div>;

  const okN = run.steps.filter(s => s.success).length, failN = run.steps.length - okN;
  const isBug = run.status === "BUG_FOUND";

  return (
    <>
      <div className="space-y-6">
        <div>
          <button onClick={onBack} className="text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200 mb-3 flex items-center gap-1.5"><I.Back /> {t("detail.back")}</button>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">{run.test.testName}</h1>
                {run.promptVersion && <VersionBadge version={run.promptVersion.version} isActive={run.promptVersion.isActive} />}
              </div>
              <p className="text-gray-500 dark:text-zinc-500 text-sm mt-0.5 max-w-xl">{run.test.userPrompt}</p>
            </div>
            <Badge status={run.status} />
          </div>

          {/* FOLDERS BLOCK */}
          <div className="mt-4 bg-gray-50/50 dark:bg-zinc-900/30 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <I.Folder />
                <span className="text-xs font-medium text-gray-700 dark:text-zinc-300">{t("detail.folders")}</span>
                <span className="text-[11px] text-gray-400 dark:text-zinc-600">({run.folders?.length || 0})</span>
              </div>
              <AddToFolderDropdown
                run={run}
                allFolders={allFolders}
                onChanged={() => { reload(); onFoldersChanged(); }}
                onCreateRequested={() => setCreateFolderOpen(true)}
              />
            </div>
            {(run.folders?.length || 0) === 0 ? (
              <p className="text-xs text-gray-400 dark:text-zinc-600 italic">{t("detail.noFolders")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {run.folders?.map(f => <FolderChip key={f.id} folder={f} onRemove={() => handleRemoveFolder(f.id)} />)}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={handleRerun} disabled={acting} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/20 disabled:opacity-50">
              {acting ? <Spin sm /> : <I.Refresh />} {t("hist.rerun")}
            </button>
            <button onClick={() => setEditOpen(true)} disabled={acting} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 border border-violet-200 dark:border-violet-500/20 disabled:opacity-50"><I.Pencil /> {t("hist.editRerun")}</button>
            <button onClick={() => setConfirmDel(true)} disabled={acting} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/20 disabled:opacity-50 ml-auto"><I.Trash /> {t("common.delete")}</button>
          </div>
        </div>

        {isBug && run.errorMsg && (
          <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-xl p-4">
            <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">{t("detail.bugDetected")}</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-200">{run.errorMsg.replace("BUG: ", "")}</p>
          </div>
        )}

        <div className="grid grid-cols-5 gap-3">
          {([
            { l: t("common.status"), v: t(`status.${run.status}`), c: ST[run.status]?.c || "" },
            { l: t("common.total"), v: run.steps.length, c: "text-gray-900 dark:text-zinc-100" },
            { l: t("common.success"), v: okN, c: "text-emerald-600 dark:text-emerald-400" },
            { l: t("common.fail"), v: failN, c: failN ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-zinc-500" },
            { l: t("common.duration"), v: run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—", c: "text-gray-900 dark:text-zinc-100" },
          ]).map(s => (
            <div key={s.l} className="bg-white dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-wider">{s.l}</p>
              <p className={`text-lg font-semibold mt-1 font-mono ${s.c}`}>{s.v}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2.5">
          <p className="text-[10px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest">{t("detail.steps")}</p>
          {run.steps.map(step => (
            <div key={step.id} className={`bg-white dark:bg-zinc-900/20 border rounded-xl ${step.success ? "border-gray-200 dark:border-zinc-800/50" : "border-red-200 dark:border-red-500/20"}`}>
              <div className="flex gap-5 p-5">
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${step.success ? "bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400"}`}>{step.success ? <I.Ok /> : <I.Xx />}</div>
                    <span className="text-[11px] font-mono text-gray-400 dark:text-zinc-600">#{step.stepNumber}</span>
                    <AChip action={step.action} />
                    {step.durationMs != null && <span className="text-[11px] text-gray-400 dark:text-zinc-600 font-mono">{step.durationMs}ms</span>}
                  </div>
                  {step.target && <div className="bg-gray-50 dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800/50 rounded-lg px-3 py-2"><p className="text-sm text-gray-700 dark:text-zinc-300 font-mono break-all">{step.target}</p></div>}
                  {step.value && <p className="text-xs text-gray-500 dark:text-zinc-500">{t("detail.value")}: <span className="font-mono text-gray-700 dark:text-zinc-300">{step.value}</span></p>}
                  {step.aiReasoning && <div className="border-l-2 border-blue-300 dark:border-blue-800/50 pl-3"><p className="text-xs text-gray-500 dark:text-zinc-500 leading-relaxed whitespace-normal break-words">{step.aiReasoning}</p></div>}
                  {step.aiConfidence != null && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 dark:bg-zinc-800/50 rounded-full h-1.5 max-w-[120px] overflow-hidden">
                        <div className={`h-1.5 rounded-full ${step.aiConfidence >= 0.8 ? "bg-blue-500" : step.aiConfidence >= 0.5 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${step.aiConfidence * 100}%` }} />
                      </div>
                      <span className="text-[11px] text-gray-400 dark:text-zinc-600 font-mono">{(step.aiConfidence * 100).toFixed(0)}% {t("detail.confidence")}</span>
                    </div>
                  )}
                  {step.errorMsg && <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/15 rounded-lg px-3 py-2"><p className="text-xs text-red-600 dark:text-red-400 break-words">{step.errorMsg}</p></div>}
                </div>
                {step.screenshot && <img src={ssUrl(step.screenshot.filePath)} alt="" className="w-48 h-30 object-cover rounded-lg border border-gray-200 dark:border-zinc-800 cursor-zoom-in hover:border-blue-500 shrink-0" onClick={() => setImg(ssUrl(step.screenshot!.filePath))} />}
              </div>
            </div>
          ))}
        </div>

        {img && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-8 cursor-zoom-out" onClick={() => setImg(null)}>
            <img src={img} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" />
            <button className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white" onClick={() => setImg(null)}>✕</button>
          </div>
        )}
      </div>
      <Confirm open={confirmDel} title={t("hist.deleteTitle")} msg={t("hist.deleteMsg")} onYes={handleDelete} onNo={() => setConfirmDel(false)} danger />
      <EditRerunModal open={editOpen} originalPrompt={run.test.userPrompt} onClose={() => setEditOpen(false)} onSubmit={handleEditRerun} />
      <FolderCreateModal open={createFolderOpen} onClose={() => setCreateFolderOpen(false)} onCreate={handleCreateFolder} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
type Page = "dashboard" | "run" | "history" | "prompts" | "reports" | { detail: number };

function Sidebar({ page, onNav, col, onCol }: { page: Page; onNav: (p: Page) => void; col: boolean; onCol: () => void }) {
  const t = useT();
  const { theme, toggle } = useContext(ThemeCtx);
  const { lang, setLang } = useLang();
  const items: { k: Page; l: string; i: React.ReactNode }[] = [
    { k: "dashboard", l: t("nav.dashboard"), i: <I.Chart /> },
    { k: "run", l: t("nav.run"), i: <I.Play /> },
    { k: "history", l: t("nav.history"), i: <I.History /> },
    { k: "prompts", l: t("nav.prompts"), i: <I.Layers /> },
    { k: "reports", l: t("nav.reports"), i: <I.Award /> },
  ];
  const active = (k: Page) => typeof page === "object" ? k === "history" : page === k;

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-white dark:bg-zinc-950 border-r border-gray-200 dark:border-zinc-800 flex flex-col z-30 transition-all duration-300 ${col ? "w-[60px]" : "w-52"}`}>
      <div className={`flex items-center h-14 border-b border-gray-200 dark:border-zinc-800 shrink-0 ${col ? "justify-center px-0" : "px-4 gap-3"}`}>
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        {!col && <div className="flex flex-col leading-tight"><span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{t("nav.brand")}</span><span className="text-[10px] text-gray-400 dark:text-zinc-600 font-mono">automation</span></div>}
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
        {!col ? (
          <div className="flex items-center bg-gray-50 dark:bg-zinc-900 rounded-lg p-0.5 mb-1">
            <button onClick={() => setLang("tr")} className={`flex-1 py-1 text-xs font-semibold rounded ${lang === "tr" ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 dark:text-zinc-500"}`}>TR</button>
            <button onClick={() => setLang("en")} className={`flex-1 py-1 text-xs font-semibold rounded ${lang === "en" ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 dark:text-zinc-500"}`}>EN</button>
          </div>
        ) : (
          <button onClick={() => setLang(lang === "tr" ? "en" : "tr")} className="w-full flex items-center justify-center py-2.5 rounded-lg text-xs font-bold text-gray-500 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-900">{lang.toUpperCase()}</button>
        )}
        <button onClick={toggle} title={col ? (theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")) : undefined}
          className={`w-full flex items-center gap-2.5 rounded-lg text-sm text-gray-500 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-900 hover:text-gray-700 dark:hover:text-zinc-300 ${col ? "justify-center py-2.5 px-0" : "px-3 py-2"}`}>
          <span className="shrink-0">{theme === "dark" ? <I.Sun /> : <I.Moon />}</span>{!col && <span>{theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}</span>}
        </button>
        <button onClick={onCol} className={`w-full flex items-center gap-2.5 rounded-lg text-sm text-gray-400 dark:text-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-900 hover:text-gray-600 dark:hover:text-zinc-400 ${col ? "justify-center py-2.5 px-0" : "px-3 py-2"}`}>
          <span className="shrink-0"><I.Collapse flip={col} /></span>{!col && <span>{t("nav.collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}

function TopBar({ title, sub, leftCol }: { title: string; sub?: string; leftCol: boolean }) {
  return (
    <header className={`sticky top-0 z-20 h-14 bg-gray-50/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-800 flex items-center px-6 transition-all duration-300 ${leftCol ? "ml-[60px]" : "ml-52"}`}>
      <div><h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{title}</h2>{sub && <p className="text-[11px] text-gray-400 dark:text-zinc-600 -mt-0.5">{sub}</p>}</div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════
function AppInner() {
  const t = useT();
  const [page, setPage] = useState<Page>("dashboard");
  const [col, setCol] = useState(false);
  const [folderPanelCol, setFolderPanelCol] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | "all" | "unfiled">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const refresh = () => {
    Promise.all([apiStats(), apiHistory(100), apiGetFolders()])
      .then(([s, r, f]) => { setStats(s); setRuns(r); setFolders(f.folders); setRefreshKey(k => k + 1); })
      .catch(() => {});
  };
  useEffect(refresh, []);

  const urls = [...new Set(runs.map(r => r.test.targetUrl).filter(Boolean))] as string[];
  const detail = (id: number) => setPage({ detail: id });

  const titles: Record<string, { t: string; s: string }> = {
    dashboard: { t: t("page.dashboard.title"), s: t("page.dashboard.sub") },
    run: { t: t("page.run.title"), s: t("page.run.sub") },
    history: { t: t("page.history.title"), s: t("page.history.sub") },
    prompts: { t: t("page.prompts.title"), s: t("page.prompts.sub") },
    reports: { t: t("page.reports.title"), s: t("page.reports.sub") },
  };
  const pt = typeof page === "string" ? titles[page] : { t: t("page.detail.title"), s: t("page.detail.sub") };
  const showFolderPanel = page === "history";
  const rightMargin = showFolderPanel && !folderPanelCol ? "mr-60" : "";

  return (
    <DragCtx.Provider value={{ draggingId, setDraggingId }}>
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 transition-colors">
        <Sidebar page={page} onNav={p => { setPage(p); if (p !== "run") refresh(); }} col={col} onCol={() => setCol(!col)} />
        <TopBar title={pt.t} sub={pt.s} leftCol={col} />

        {showFolderPanel && (
          <FoldersPanel
            selectedFolderId={selectedFolderId} onSelect={setSelectedFolderId}
            collapsed={folderPanelCol} onToggle={() => setFolderPanelCol(!folderPanelCol)}
            refreshKey={refreshKey} onRefresh={refresh} showToast={setToastMsg}
          />
        )}

        <main className={`transition-all duration-300 ${col ? "ml-[60px]" : "ml-52"} ${rightMargin} px-8 py-6`}>
          {page === "dashboard" && <DashPage stats={stats} runs={runs} onSelect={detail} />}
          {page === "run" && <RunPage onDone={id => { detail(id); refresh(); }} pastUrls={urls} />}
          {page === "history" && <HistPage onSelect={detail} refreshTrigger={refreshKey} selectedFolderId={selectedFolderId} onChanged={refresh} />}
          {page === "prompts" && <PromptsPage refreshTrigger={refreshKey} />}
          {page === "reports" && <ReportsPage refreshTrigger={refreshKey} />}
          {typeof page === "object" && (
            <DetailPage id={page.detail} onBack={() => { setPage("history"); refresh(); }} onJump={(newId) => { setPage({ detail: newId }); refresh(); }} allFolders={folders} onFoldersChanged={refresh} />
          )}
        </main>

        {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
      </div>
    </DragCtx.Provider>
  );
}

export default function App() {
  return <ThemeProvider><LanguageProvider><AppInner /></LanguageProvider></ThemeProvider>;
}
