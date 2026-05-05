// src/pages/RunTest.tsx
import { useState } from 'react'
import { runTest, screenshotUrl, type TestRun } from '../services/api'

interface Props {
  onTestComplete: (id: number) => void
}

export default function RunTest({ onTestComplete }: Props) {
  const [testName, setTestName] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [userPrompt, setUserPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TestRun | null>(null)

  const handleSubmit = async () => {
    if (!testName.trim() || !userPrompt.trim() || !targetUrl.trim()) {
      setError('Tüm alanları doldurun.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await runTest({ testName, userPrompt, targetUrl })
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const success = result?.status === 'SUCCESS'
  const isBug = result?.status === 'BUG_FOUND'

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-white">Yeni Test Çalıştır</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Doğal dille ne test etmek istediğini yaz, AI gerisi halletsin.
        </p>
      </div>

      {/* FORM */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Test Adı
            </label>
            <input
              type="text"
              value={testName}
              onChange={e => setTestName(e.target.value)}
              placeholder="SauceDemo Login Testi"
              disabled={loading}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Hedef URL
            </label>
            <input
              type="text"
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              placeholder="https://www.saucedemo.com"
              disabled={loading}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Test Promptu
          </label>
          <textarea
            value={userPrompt}
            onChange={e => setUserPrompt(e.target.value)}
            placeholder="Örnek: SauceDemo'ya git, kullanıcı adı alanına standard_user, şifre alanına secret_sauce yaz. Login butonuna tıkla. Sayfa başarıyla açıldıysa testi tamamla."
            rows={5}
            disabled={loading}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-colors resize-none"
          />
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Test çalışıyor... (tarayıcı açılıyor)
            </>
          ) : (
            '▶ Testi Başlat'
          )}
        </button>

        {loading && (
          <p className="text-center text-xs text-gray-500">
            AI tarayıcıyı kontrol ediyor. Test bitince sonuçlar burada görünecek.
          </p>
        )}
      </div>

      {/* RESULT */}
      {result && (
        <div className={`border rounded-xl p-6 space-y-4 ${
          success ? 'bg-emerald-950/30 border-emerald-800' :
          isBug ? 'bg-yellow-950/30 border-yellow-800' :
          'bg-red-950/30 border-red-800'
        }`}>

          {/* STATUS */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {success ? '✅' : isBug ? '🐛' : '❌'}
              </span>
              <div>
                <p className="font-semibold text-white">
                  {success ? 'Test Başarıyla Tamamlandı' :
                   isBug ? 'Bug Tespit Edildi' :
                   'Test Başarısız'}
                </p>
                <p className="text-sm text-gray-400">
                  {result.steps.length} adım
                  {result.durationMs && ` · ${(result.durationMs / 1000).toFixed(1)}s`}
                  {result.promptVersion && ` · ${result.promptVersion.version}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => onTestComplete(result.id)}
              className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Detayları Gör →
            </button>
          </div>

          {/* BUG MESSAGE */}
          {isBug && result.errorMsg && (
            <p className="text-yellow-200 text-sm bg-yellow-950 px-3 py-2 rounded">
              {result.errorMsg.replace('BUG: ', '')}
            </p>
          )}

          {/* LAST 3 STEPS PREVIEW */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Son adımlar</p>
            {result.steps.slice(-3).map(step => (
              <div key={step.id} className="flex items-center gap-3 text-sm">
                <span className={step.success ? 'text-emerald-400' : 'text-red-400'}>
                  {step.success ? '✓' : '✗'}
                </span>
                <span className="font-mono text-violet-300 text-xs bg-gray-800 px-2 py-0.5 rounded">
                  {step.action}
                </span>
                {step.target && (
                  <span className="text-gray-400 truncate max-w-xs">{step.target}</span>
                )}
                {step.screenshot && (
                  <img
                    src={screenshotUrl(step.screenshot.filePath)}
                    alt=""
                    className="w-12 h-7 object-cover rounded border border-gray-700 ml-auto shrink-0"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
