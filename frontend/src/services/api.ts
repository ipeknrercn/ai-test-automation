// src/services/api.ts
// Yerel: localhost; prod build: Render backend (VITE_* ile override)

const API_BASE = "https://promptqa-backend.onrender.com/api";
const SCREENSHOTS_BASE = "https://promptqa-backend.onrender.com/screenshots";


export interface RunTestPayload {
  testName: string;
  userPrompt: string;
  targetUrl: string;
}

export interface Screenshot {
  id: number;
  filePath: string;
  fileSize: number | null;
  format: string;
}

export interface TestStep {
  id: number;
  stepNumber: number;
  action: string;
  target: string | null;
  value: string | null;
  aiReasoning: string | null;
  aiConfidence: number | null;
  success: boolean;
  errorMsg: string | null;
  durationMs: number | null;
  screenshot: Screenshot | null;
}

export interface Test {
  id: number;
  testName: string;
  userPrompt: string;
  targetUrl: string | null;
}

export interface PromptVersion {
  id: number;
  testId: number;
  version: string;
  promptText: string;
  totalRuns: number;
  successCount: number;
  failCount: number;
  bugCount: number;
  successRate: number;
  avgDurationMs: number | null;
  parentVersionId: number | null;
  improvementReason: string | null;
  isActive: boolean;
  createdAt: string;
  test?: { testName: string; targetUrl: string | null };
  _count?: { testRuns: number };
}

export interface TestRun {
  id: number;
  status: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  errorMsg: string | null;
  browser: string;
  test: Test;
  promptVersion?: PromptVersion | null;
  steps: TestStep[];
}

export interface Stats {
  total: number;
  success: number;
  failed: number;
  bugs: number;
  successRate: string;
}

export interface PromptVersionStats {
  totalVersions: number;
  activeVersions: number;
  avgSuccessRate: number;
  bestVersion: PromptVersion | null;
}

export function screenshotUrl(filePath: string): string {
  const filename = filePath.split(/[\\/]/).pop();
  return `${SCREENSHOTS_BASE}/${filename}`;
}

// ─── TEST API ───
export async function runTest(payload: RunTestPayload): Promise<TestRun> {
  const res = await fetch(`${API_BASE}/tests/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Test başlatılamadı');
  return data.data;
}

export async function getHistory(limit = 20): Promise<TestRun[]> {
  const res = await fetch(`${API_BASE}/tests/history?limit=${limit}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getTestById(id: number): Promise<TestRun> {
  const res = await fetch(`${API_BASE}/tests/${id}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/tests/stats`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

// ─── PROMPT VERSION API ───
export async function getAllPromptVersions(): Promise<PromptVersion[]> {
  const res = await fetch(`${API_BASE}/prompt-versions`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getPromptVersionStats(): Promise<PromptVersionStats> {
  const res = await fetch(`${API_BASE}/prompt-versions/stats`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getPromptVersionsByTest(testId: number): Promise<PromptVersion[]> {
  const res = await fetch(`${API_BASE}/prompt-versions/test/${testId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}
