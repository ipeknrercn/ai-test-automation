// src/pages/TestDetail.tsx
import { useEffect, useState } from 'react'
import { getTestById, screenshotUrl, type TestRun } from '../services/api'

interface Props {
  testRunId: number
  onBack: () => void
}

const statusColor: Record<string, string> = {
  SUCCESS:   'text-emerald-400',
  FAIL:      'text-red-400',
  ERROR:     'text-orange-400',
  BUG_FOUND: 'text-yellow-400',
}

const statusLabel: Record<string, string> = {
  SUCCESS:   'Başarılı',
  FAIL:      'Başarısız',
  ERROR:     'Agent Hatası',
  BUG_FOUND: 'Bug Bulundu',
}

export default function TestDetail({ testRunId, onBack }: Props) {
  const [run, setRun] = useState<TestRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [enlargedImg, setEnlargedImg] = useState<string | null>(null)

  useEffect(() => {
    getTestById(testRunId).then(setRun).finally(() => setLoading(false))
  }, [testRunId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!run) return <div className="text-center py-16 text-gray-500">Test bulunamadı.</div>

  const successCount = run.steps.filter(s => s.success).length
  const failCount = run.steps.filter(s => !s.success).length
  const isBug = run.status === 'BUG_FOUND'

  return (
    <div className="space-y-6">
      <div>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-white transition-colors mb-4 flex items-center gap-1">
          ← Geçmişe Dön
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-white">{run.test.testName}</h1>
              {/* PROMPT VERSION BADGE */}
              {run.promptVersion && (
                <span className="text-xs font-mono font-bold bg-violet-900 text-violet-300 px-2 py-1 rounded">
                  {run.promptVersion.version}
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm">{run.test.userPrompt}</p>
          </div>
          <span className={`text-lg font-bold ${statusColor[run.status] || 'text-white'}`}>
            {statusLabel[run.status] || run.status}
          </span>
        </div>
      </div>

      {isBug && run.errorMsg && (
        <div className="bg-yellow-950 border border-yellow-700 rounded-xl p-4">
          <p className="text-yellow-300 font-semibold text-sm mb-1">🐛 Bug Tespit Edildi</p>
          <p className="text-yellow-200 text-sm">{run.errorMsg.replace('BUG: ', '')}</p>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 grid grid-cols-5 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Durum</p>
          <p className={`font-bold ${statusColor[run.status] || 'text-white'}`}>
            {statusLabel[run.status] || run.status}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Toplam</p>
          <p className="font-bold text-white">{run.steps.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Başarılı</p>
          <p className="font-bold text-emerald-400">{successCount}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Başarısız</p>
          <p className={`font-bold ${failCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>{failCount}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Süre</p>
          <p className="font-bold text-white">{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Test Adımları</h2>
        {run.steps.map(step => (
          <div
            key={step.id}
            className={`bg-gray-900 border rounded-xl p-5 flex gap-5 ${
              step.success ? 'border-gray-800' : 'border-red-900'
            }`}
          >
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  step.success ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'
                }`}>
                  {step.success ? '✓' : '✗'}
                </span>
                <span className="text-xs font-medium text-gray-500">#{step.stepNumber}</span>
                <span className="bg-gray-800 text-violet-300 text-xs px-2 py-0.5 rounded font-mono">
                  {step.action}
                </span>
                {step.durationMs && <span className="text-xs text-gray-600">{step.durationMs}ms</span>}
              </div>

              {step.target && (
                <p className="text-sm text-gray-300 font-mono bg-gray-800 px-3 py-1.5 rounded break-all">
                  {step.target}
                </p>
              )}

              {step.value && (
                <p className="text-xs text-gray-400">
                  <span className="text-gray-600">Değer: </span>{step.value}
                </p>
              )}

              {step.aiReasoning && (
                <p className="text-xs text-gray-400 italic border-l-2 border-violet-800 pl-3 whitespace-normal break-words">
                  💭 {step.aiReasoning}
                </p>
              )}

              {step.aiConfidence !== null && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5 max-w-32">
                    <div
                      className="bg-violet-500 h-1.5 rounded-full"
                      style={{ width: `${((step.aiConfidence ?? 0) * 100).toFixed(0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {((step.aiConfidence ?? 0) * 100).toFixed(0)}% güven
                  </span>
                </div>
              )}

              {step.errorMsg && (
                <p className="text-xs text-red-400 bg-red-950 px-3 py-1.5 rounded break-words">
                  {step.errorMsg}
                </p>
              )}
            </div>

            {step.screenshot && (
              <div className="shrink-0">
                <img
                  src={screenshotUrl(step.screenshot.filePath)}
                  alt={`Adım ${step.stepNumber}`}
                  className="w-40 h-24 object-cover rounded-lg border border-gray-700 cursor-zoom-in hover:border-violet-500 transition-colors"
                  onClick={() => setEnlargedImg(screenshotUrl(step.screenshot!.filePath))}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {enlargedImg && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-8 cursor-zoom-out"
          onClick={() => setEnlargedImg(null)}
        >
          <img src={enlargedImg} alt="Screenshot" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl" onClick={() => setEnlargedImg(null)}>✕</button>
        </div>
      )}
    </div>
  )
}