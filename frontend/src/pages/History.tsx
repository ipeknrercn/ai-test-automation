// src/pages/History.tsx
import { useEffect, useState } from 'react'
import { getHistory, getStats, type TestRun, type Stats } from '../services/api'

interface Props {
  onSelectTest: (id: number) => void
}

// KONU 1: BUG_FOUND durumu eklendi
const statusStyle: Record<string, string> = {
  SUCCESS:   'bg-emerald-950 text-emerald-400 border-emerald-800',
  FAIL:      'bg-red-950 text-red-400 border-red-800',
  ERROR:     'bg-orange-950 text-orange-400 border-orange-800',
  RUNNING:   'bg-blue-950 text-blue-400 border-blue-800',
  BUG_FOUND: 'bg-yellow-950 text-yellow-400 border-yellow-800',
}

const statusLabel: Record<string, string> = {
  SUCCESS:   'Başarılı',
  FAIL:      'Başarısız',
  ERROR:     'Agent Hatası',
  RUNNING:   'Çalışıyor',
  BUG_FOUND: '🐛 Bug Bulundu',
}

export default function History({ onSelectTest }: Props) {
  const [runs, setRuns] = useState<TestRun[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getHistory(20), getStats()])
      .then(([h, s]) => { setRuns(h); setStats(s) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Test Geçmişi</h1>
        <p className="text-gray-400 mt-1 text-sm">Tüm çalıştırılan testler ve sonuçları</p>
      </div>

      {/* STATS — BUG kartı eklendi */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Toplam Test',  value: stats.total,       color: 'text-white' },
            { label: 'Başarılı',     value: stats.success,     color: 'text-emerald-400' },
            { label: 'Başarısız',    value: stats.failed,      color: 'text-red-400' },
            { label: 'Bug Bulundu',  value: stats.bugs,        color: 'text-yellow-400' },
            { label: 'Başarı Oranı', value: `%${stats.successRate}`, color: 'text-violet-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {runs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">Henüz test çalıştırılmamış.</div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => {
            // KONU 2: Adım başarı/başarısız sayısı
            const successCount = run.steps.filter(s => s.success).length
            const failCount = run.steps.filter(s => !s.success).length

            return (
              <button
                key={run.id}
                onClick={() => onSelectTest(run.id)}
                className="w-full bg-gray-900 border border-gray-800 hover:border-violet-700 rounded-xl p-5 text-left transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium truncate">{run.test.testName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyle[run.status] || statusStyle.ERROR}`}>
                        {statusLabel[run.status] || run.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 truncate">{run.test.userPrompt}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>{run.steps.length} adım</span>
                      {run.steps.length > 0 && (
                        <>
                          <span className="text-emerald-600">✓ {successCount}</span>
                          {failCount > 0 && <span className="text-red-500">✗ {failCount}</span>}
                        </>
                      )}
                      {run.durationMs && <span>{(run.durationMs / 1000).toFixed(1)}s</span>}
                      <span>{new Date(run.startTime).toLocaleString('tr-TR')}</span>
                    </div>
                    {/* Bug açıklaması */}
                    {run.status === 'BUG_FOUND' && run.errorMsg && (
                      <p className="text-xs text-yellow-500 mt-1 truncate">
                        🐛 {run.errorMsg.replace('BUG: ', '')}
                      </p>
                    )}
                  </div>
                  <span className="text-gray-600 group-hover:text-violet-400 transition-colors text-lg">→</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
