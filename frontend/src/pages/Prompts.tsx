// src/pages/Prompts.tsx
import { useEffect, useState } from 'react'
import { getAllPromptVersions, getPromptVersionStats, type PromptVersion, type PromptVersionStats } from '../services/api'

export default function Prompts() {
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [stats, setStats] = useState<PromptVersionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([getAllPromptVersions(), getPromptVersionStats()])
      .then(([v, s]) => { setVersions(v); setStats(s) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Testlere göre grupla
  const grouped: Record<number, PromptVersion[]> = {}
  versions.forEach(v => {
    if (!grouped[v.testId]) grouped[v.testId] = []
    grouped[v.testId].push(v)
  })

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-white">Prompt Versiyonları</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Her testin prompt geçmişi ve başarı oranlarına göre versiyonlanması
        </p>
      </div>

      {/* STATS */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Toplam Versiyon</p>
            <p className="text-2xl font-bold text-white">{stats.totalVersions}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Aktif Versiyon</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.activeVersions}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Ortalama Başarı</p>
            <p className="text-2xl font-bold text-violet-400">%{stats.avgSuccessRate}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">En İyi Versiyon</p>
            <p className="text-lg font-bold text-yellow-400">
              {stats.bestVersion ? `${stats.bestVersion.version} (%${stats.bestVersion.successRate})` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* GROUPS */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          Henüz prompt versiyonu yok.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([testId, vs]) => (
            <div key={testId} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

              {/* TEST HEADER */}
              <div className="bg-gray-800 px-5 py-3 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-white">
                      {vs[0].test?.testName || `Test #${testId}`}
                    </h3>
                    {vs[0].test?.targetUrl && (
                      <p className="text-xs text-gray-400 mt-0.5">{vs[0].test.targetUrl}</p>
                    )}
                  </div>
                  <span className="text-xs bg-violet-900 text-violet-300 px-2 py-1 rounded">
                    {vs.length} versiyon
                  </span>
                </div>
              </div>

              {/* VERSIONS */}
              <div className="divide-y divide-gray-800">
                {vs.map(v => {
                  const isExpanded = expandedId === v.id
                  const total = v.totalRuns

                  return (
                    <div key={v.id} className="p-5">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : v.id)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`text-sm font-mono font-bold px-2 py-1 rounded ${
                            v.isActive ? 'bg-emerald-900 text-emerald-300' : 'bg-gray-700 text-gray-400'
                          }`}>
                            {v.version}
                          </span>
                          {v.isActive && (
                            <span className="text-xs text-emerald-400">● Aktif</span>
                          )}
                          <p className="text-sm text-gray-300 truncate flex-1">
                            {v.promptText}
                          </p>
                        </div>

                        <div className="flex items-center gap-6 ml-4 shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Başarı</p>
                            <p className={`font-bold ${
                              v.successRate >= 80 ? 'text-emerald-400' :
                              v.successRate >= 50 ? 'text-yellow-400' :
                              total > 0 ? 'text-red-400' : 'text-gray-500'
                            }`}>
                              {total > 0 ? `%${v.successRate.toFixed(0)}` : '—'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Çalışma</p>
                            <p className="font-bold text-white">{total}</p>
                          </div>
                          <span className="text-gray-500 text-lg">
                            {isExpanded ? '▾' : '▸'}
                          </span>
                        </div>
                      </div>

                      {/* PROGRESS BAR */}
                      {total > 0 && (
                        <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-gray-800">
                          <div
                            className="bg-emerald-500"
                            style={{ width: `${(v.successCount / total) * 100}%` }}
                            title={`${v.successCount} başarılı`}
                          />
                          <div
                            className="bg-yellow-500"
                            style={{ width: `${(v.bugCount / total) * 100}%` }}
                            title={`${v.bugCount} bug bulundu`}
                          />
                          <div
                            className="bg-red-500"
                            style={{ width: `${(v.failCount / total) * 100}%` }}
                            title={`${v.failCount} başarısız`}
                          />
                        </div>
                      )}

                      {/* EXPANDED DETAILS */}
                      {isExpanded && (
                        <div className="mt-4 space-y-3 pl-4 border-l-2 border-violet-800">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Tam Prompt</p>
                            <p className="text-sm text-gray-300 bg-gray-800 p-3 rounded whitespace-pre-wrap">
                              {v.promptText}
                            </p>
                          </div>

                          <div className="grid grid-cols-4 gap-3">
                            <div className="bg-gray-800 p-3 rounded">
                              <p className="text-xs text-gray-500 mb-1">Toplam Çalışma</p>
                              <p className="font-bold text-white">{v.totalRuns}</p>
                            </div>
                            <div className="bg-gray-800 p-3 rounded">
                              <p className="text-xs text-gray-500 mb-1">Başarılı</p>
                              <p className="font-bold text-emerald-400">{v.successCount}</p>
                            </div>
                            <div className="bg-gray-800 p-3 rounded">
                              <p className="text-xs text-gray-500 mb-1">Başarısız</p>
                              <p className="font-bold text-red-400">{v.failCount}</p>
                            </div>
                            <div className="bg-gray-800 p-3 rounded">
                              <p className="text-xs text-gray-500 mb-1">Bug</p>
                              <p className="font-bold text-yellow-400">{v.bugCount}</p>
                            </div>
                          </div>

                          {v.avgDurationMs && (
                            <p className="text-xs text-gray-400">
                              Ortalama süre: <span className="text-white font-medium">{(v.avgDurationMs / 1000).toFixed(1)}s</span>
                            </p>
                          )}

                          {v.improvementReason && (
                            <p className="text-xs text-gray-400 italic border-l-2 border-violet-700 pl-2">
                              💡 {v.improvementReason}
                            </p>
                          )}

                          <p className="text-xs text-gray-500">
                            Oluşturuldu: {new Date(v.createdAt).toLocaleString('tr-TR')}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
