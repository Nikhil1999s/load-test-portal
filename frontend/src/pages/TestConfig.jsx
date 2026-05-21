import { useState, useEffect } from 'react'
import { lobsApi, runsApi, suitesApi, mappingsApi } from '../api'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })
const PRESETS = [
  { name: 'Smoke',  vus: 5,   dur: 30,  ramp: 5 },
  { name: 'Load',   vus: 50,  dur: 300, ramp: 60 },
  { name: 'Stress', vus: 200, dur: 300, ramp: 120 },
]

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function TestConfig() {
  const [mainTab, setMainTab] = useState('portal') // portal | jmx

  // ── Portal tab state ─────────────────────────────────────────
  const [lobs, setLobs] = useState([])
  const [lobSearch, setLobSearch] = useState('')
  const [envFilter, setEnvFilter] = useState('')
  const [selectedLob, setSelectedLob] = useState(null)
  const [tool, setTool] = useState('k6')
  const [mode, setMode] = useState('single')
  const [apiFilter, setApiFilter] = useState('all')
  const [config, setConfig] = useState({ virtual_users: 10, duration_seconds: 60, ramp_up_seconds: 10, iterations: '' })
  const [iterList, setIterList] = useState([
    { virtual_users: 30, duration_seconds: 300, ramp_up_seconds: 120 },
    { virtual_users: 60, duration_seconds: 300, ramp_up_seconds: 120 },
    { virtual_users: 120, duration_seconds: 300, ramp_up_seconds: 120 },
  ])
  const [stopOnFailure, setStopOnFailure] = useState(true)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)
  const [suiteResult, setSuiteResult] = useState(null)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [showProdWarning, setShowProdWarning] = useState(false)
  const [pendingRunType, setPendingRunType] = useState(null)
  const [showRunningPopup, setShowRunningPopup] = useState(false)
  const [showMappingWarning, setShowMappingWarning] = useState(false)

  // ── JMX tab state ─────────────────────────────────────────────
  const [jmxFile, setJmxFile] = useState(null)
  const [jmxIterList, setJmxIterList] = useState([
    { virtual_users: 30, duration_seconds: 300, ramp_up_seconds: 120 },
  ])
  const [jmxRunning, setJmxRunning] = useState(false)
  const [jmxResult, setJmxResult] = useState(null)
  const [jmxError, setJmxError] = useState(null)

  useEffect(() => { lobsApi.list().then(r => setLobs(r.data)).catch(() => {}) }, [])

  const set = (key, val) => setConfig(c => ({ ...c, [key]: val }))
  const addIter = () => setIterList(l => [...l, { virtual_users: 50, duration_seconds: 300, ramp_up_seconds: 120 }])
  const removeIter = (i) => setIterList(l => l.filter((_, idx) => idx !== i))
  const updateIter = (i, key, val) => setIterList(l => l.map((it, idx) => idx === i ? { ...it, [key]: val } : it))
  const addJmxIter = () => setJmxIterList(l => [...l, { virtual_users: 50, duration_seconds: 300, ramp_up_seconds: 120 }])
  const removeJmxIter = (i) => setJmxIterList(l => l.filter((_, idx) => idx !== i))
  const updateJmxIter = (i, key, val) => setJmxIterList(l => l.map((it, idx) => idx === i ? { ...it, [key]: val } : it))

  const buildPayload = () => ({
    lob_id: selectedLob.id, tool,
    virtual_users: Number(config.virtual_users),
    duration_seconds: Number(config.duration_seconds),
    ramp_up_seconds: Number(config.ramp_up_seconds),
    iterations: config.iterations ? Number(config.iterations) : null,
    api_filter: apiFilter,
  })

  const startRun = async (type) => {
    if (!selectedLob) return
    if (selectedLob.environment === 'prod') { setPendingRunType(type); setShowProdWarning(true); return }
    await _executeRun(type)
  }

  const _executeRun = async (type) => {
    if (!selectedLob) return
    try {
      const res = await mappingsApi.get(selectedLob.id)
      if (!res.data.filter(m => m.enabled).length) { setShowMappingWarning(true); return }
    } catch {}
    setShowRunningPopup(true)
    setError(null)
    if (type === 'single') {
      setRunResult(null); setRunning(true)
      try {
        const res = tool === 'k6' ? await runsApi.runK6(buildPayload()) : await runsApi.runJmeter(buildPayload())
        setRunResult(res.data)
      } catch (e) { setError(e.response?.data?.detail || 'Run failed.') }
      finally { setRunning(false); setShowRunningPopup(false) }
    } else {
      setSuiteResult(null); setRunning(true)
      try {
        const res = await suitesApi.run({
          lob_id: selectedLob.id, tool,
          stop_on_failure: stopOnFailure,
          iterations: iterList.map(it => ({
            virtual_users: Number(it.virtual_users),
            duration_seconds: Number(it.duration_seconds),
            ramp_up_seconds: Number(it.ramp_up_seconds),
          }))
        })
        setSuiteResult(res.data)
      } catch (e) { setError(e.response?.data?.detail || 'Suite run failed.') }
      finally { setRunning(false); setShowRunningPopup(false) }
    }
  }

  const handlePreview = async () => {
    if (!selectedLob) return
    try {
      const res = await runsApi.previewK6(buildPayload())
      setPreview(res.data)
      setShowPreview(true)
      // Auto scroll to preview after render
      setTimeout(() => {
        document.getElementById('preview-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
    catch (e) { setError(e.response?.data?.detail || 'Preview failed.') }
  }

  const handleDownload = async (type) => {
    if (!selectedLob) return
    setDownloading(type)
    try {
      const lobSlug = selectedLob.name.toLowerCase().replace(/\s+/g, '_')
      if (type === 'k6') {
        const res = await runsApi.downloadK6(buildPayload())
        downloadBlob(res.data, `${lobSlug}_k6.js`)
      } else {
        const res = await runsApi.downloadJmx(buildPayload())
        downloadBlob(res.data, `${lobSlug}_jmeter.jmx`)
      }
    } catch { setError('Download failed.') }
    finally { setDownloading('') }
  }

  const runJmxUpload = async () => {
    if (!jmxFile) return
    setJmxRunning(true); setJmxResult(null); setJmxError(null)
    try {
      const formData = new FormData()
      formData.append('file', jmxFile)
      formData.append('iterations', JSON.stringify(jmxIterList))
      const res = await api.post('/runs/run/jmx-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setJmxResult(res.data)
    } catch (e) { setJmxError(e.response?.data?.detail || 'JMX run failed.') }
    finally { setJmxRunning(false) }
  }

  const totalDuration = iterList.reduce((s, it) => s + Number(it.duration_seconds), 0)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Test config</h1>
        <p className="text-sm text-gray-500 mt-0.5">Run load tests via the portal or upload a JMX file directly</p>
      </div>

      {/* Main tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'portal', icon: 'ti-player-play', label: 'Run via portal' },
          { id: 'jmx',    icon: 'ti-upload',      label: 'Upload JMX & run' },
        ].map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
              mainTab === t.id ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
            <i className={`ti ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── UPLOAD JMX TAB ── */}
      {mainTab === 'jmx' && (
        <div className="space-y-4">
          {jmxError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              <i className="ti ti-alert-circle mr-2" />{jmxError}
            </div>
          )}

          {/* Upload dropzone */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Upload JMX file</h2>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${jmxFile ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300'}`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.jmx')) setJmxFile(f) }}
            >
              {jmxFile ? (
                <div>
                  <i className="ti ti-file-check text-3xl text-teal-500 mb-2 block" />
                  <p className="text-sm font-medium text-teal-700">{jmxFile.name}</p>
                  <p className="text-xs text-teal-500 mt-0.5">{(jmxFile.size/1024).toFixed(1)} KB</p>
                  <button onClick={() => setJmxFile(null)} className="text-xs text-red-400 hover:text-red-600 mt-2">Remove</button>
                </div>
              ) : (
                <div>
                  <i className="ti ti-upload text-3xl text-gray-300 mb-2 block" />
                  <p className="text-sm text-gray-500 mb-1">Drag & drop your JMX file here</p>
                  <p className="text-xs text-gray-400 mb-3">or click to browse</p>
                  <label className="cursor-pointer bg-teal-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-teal-700">
                    Browse file
                    <input type="file" accept=".jmx" className="hidden" onChange={e => setJmxFile(e.target.files[0])} />
                  </label>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              <i className="ti ti-info-circle mr-1" />
              Token, auth and all config should already be inside the JMX. Portal runs it as-is.
            </p>
          </div>

          {/* JMX iterations */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-medium text-gray-900">Iteration plan</h2>
                <p className="text-xs text-gray-400 mt-0.5">Runs the JMX with different VU counts sequentially</p>
              </div>
              <span className="text-xs text-gray-400">~{Math.round(jmxIterList.reduce((s,i)=>s+Number(i.duration_seconds),0)/60)}min</span>
            </div>
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-3 mb-1">
              <span className="col-span-1">#</span>
              <span className="col-span-3">VUs</span>
              <span className="col-span-3">Duration (s)</span>
              <span className="col-span-3">Ramp-up (s)</span>
              <span className="col-span-2"></span>
            </div>
            <div className="space-y-2 mb-3">
              {jmxIterList.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg px-3 py-2">
                  <span className="col-span-1 text-xs text-gray-400 font-medium">{i+1}</span>
                  <div className="col-span-3"><input type="number" min="1" value={it.virtual_users} onChange={e => updateJmxIter(i,'virtual_users',e.target.value)} className="text-sm py-1.5" /></div>
                  <div className="col-span-3"><input type="number" min="10" value={it.duration_seconds} onChange={e => updateJmxIter(i,'duration_seconds',e.target.value)} className="text-sm py-1.5" /></div>
                  <div className="col-span-3"><input type="number" min="0" value={it.ramp_up_seconds} onChange={e => updateJmxIter(i,'ramp_up_seconds',e.target.value)} className="text-sm py-1.5" /></div>
                  <div className="col-span-2 flex justify-end">
                    {jmxIterList.length > 1 && <button onClick={() => removeJmxIter(i)} className="text-red-400 hover:text-red-600 p-1"><i className="ti ti-trash text-sm" /></button>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addJmxIter} className="flex items-center gap-1.5 text-xs text-teal-600 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50">
              <i className="ti ti-plus" /> Add iteration
            </button>
            <div className="flex items-center gap-1 mt-4 flex-wrap">
              {jmxIterList.map((it, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="bg-teal-50 border border-teal-200 text-teal-700 text-xs px-2.5 py-1 rounded-lg font-medium">{it.virtual_users} VUs</div>
                  {i < jmxIterList.length-1 && <i className="ti ti-arrow-right text-gray-300 text-xs" />}
                </div>
              ))}
              <i className="ti ti-arrow-right text-gray-300 text-xs" />
              <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-2.5 py-1 rounded-lg font-medium">Report</div>
            </div>
          </div>

          <button onClick={runJmxUpload} disabled={!jmxFile || jmxRunning}
            className="flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-6 py-3 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            <i className={`ti ${jmxRunning ? 'ti-loader-2 animate-spin' : 'ti-player-play'}`} />
            {jmxRunning ? `Running ${jmxIterList.length} iteration${jmxIterList.length>1?'s':''}...` : `Run ${jmxIterList.length} iteration${jmxIterList.length>1?'s':''}`}
          </button>

          {jmxResult && (
            <div className={`border rounded-xl p-5 ${jmxResult.status==='done'?'bg-green-50 border-green-200':'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-3">
                <i className={`ti ${jmxResult.status==='done'?'ti-circle-check text-green-600':'ti-circle-x text-red-600'} text-lg`} />
                <span className="text-sm font-medium">{jmxResult.status==='done'?'JMX run completed':'JMX run failed'}</span>
              </div>
              {jmxResult.report_json && (() => {
                const r = JSON.parse(jmxResult.report_json)
                if (!r.iterations) return null
                return (
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-teal-600 text-white">
                        {['Iter','VUs','Requests','Avg','p90','p99','Error%','Status'].map(h => (
                          <th key={h} className="py-2.5 px-3 text-center font-medium">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {r.iterations.map((it, i) => {
                          const m = it.metrics || {}
                          return (
                            <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                              <td className="py-2 px-3 text-center">{it.iteration}</td>
                              <td className="py-2 px-3 text-center">{it.virtual_users}</td>
                              <td className="py-2 px-3 text-center">{(m.total_requests||0).toLocaleString()}</td>
                              <td className="py-2 px-3 text-center">{m.avg_ms||0}ms</td>
                              <td className="py-2 px-3 text-center">{m.p90_ms||0}ms</td>
                              <td className="py-2 px-3 text-center">{m.p99_ms||0}ms</td>
                              <td className={`py-2 px-3 text-center ${(m.error_rate_pct||0)>0?'text-red-600':'text-green-600'}`}>{(m.error_rate_pct||0).toFixed(1)}%</td>
                              <td className="py-2 px-3 text-center">{it.status==='done'?'✓':'✗'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── PORTAL TAB ── */}
      {mainTab === 'portal' && (
        <div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5"><i className="ti ti-alert-circle mr-2" />{error}</div>}

          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2 space-y-4">

              {/* LOB selector */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-medium text-gray-900 mb-3">Select LOB</h2>
                <div className="flex gap-1 mb-3">
                  {['', 'uat', 'demo', 'prod'].map(e => (
                    <button key={e} onClick={() => setEnvFilter(e)}
                      className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                        envFilter === e
                          ? e===''     ? 'bg-gray-800 text-white border-gray-800'
                          : e==='uat'  ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : e==='demo' ? 'bg-blue-100 text-blue-800 border-blue-300'
                          :              'bg-green-100 text-green-800 border-green-300'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {e === '' ? 'All' : e.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="relative mb-3">
                  <i className="ti ti-search absolute left-3 top-2.5 text-gray-400 text-sm" />
                  <input className="pl-8 text-sm w-full" placeholder="Search LOB..." value={lobSearch} onChange={e => setLobSearch(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {lobs
                    .filter(l => !envFilter || l.environment === envFilter)
                    .filter(l => !lobSearch || l.name.toLowerCase().includes(lobSearch.toLowerCase()))
                    .map(lob => (
                      <button key={lob.id} onClick={() => { setSelectedLob(lob); setRunResult(null); setSuiteResult(null) }}
                        className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          selectedLob?.id === lob.id ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}>
                        <div className="font-medium">{lob.name}</div>
                      </button>
                    ))}
                </div>
              </div>

              {/* Mode toggle */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-medium text-gray-900 mb-3">Test mode</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id:'single', label:'Single run', desc:'One test with fixed VUs and duration.' },
                    { id:'multi',  label:'Progressive iterations', desc:'Scale VUs across multiple runs. Generates combined report.' },
                  ].map(m => (
                    <button key={m.id} onClick={() => setMode(m.id)}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${mode===m.id?'border-indigo-400 bg-indigo-50':'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">{m.label}</span>
                        {mode===m.id && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Selected</span>}
                      </div>
                      <p className="text-xs text-gray-500">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Single run params */}
              {mode === 'single' && (
                <div className="bg-white border border-gray-100 rounded-xl p-5">
                  <h2 className="text-sm font-medium text-gray-900 mb-4">Test parameters</h2>
                  <div className="flex gap-2 mb-4">
                    {PRESETS.map(p => (
                      <button key={p.name} onClick={() => setConfig(c => ({ ...c, virtual_users: p.vus, duration_seconds: p.dur, ramp_up_seconds: p.ramp }))}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700">
                        {p.name} ({p.vus} VUs · {p.dur}s)
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      ['Virtual users', 'virtual_users', 'Concurrent simulated users'],
                      ['Duration (s)',  'duration_seconds', '60s=smoke · 300s=load'],
                      ['Ramp-up (s)',   'ramp_up_seconds', 'Gradual increase to max VUs'],
                      ['Iterations',   'iterations', 'Leave blank to use duration'],
                    ].map(([label, key, hint]) => (
                      <div key={key}>
                        <label className="block text-xs text-gray-500 mb-1 font-medium">{label}</label>
                        <input type="number" min="1" value={config[key]} onChange={e => set(key, e.target.value)} placeholder={key==='iterations'?'Leave blank':''}  />
                        <p className="text-xs text-gray-400 mt-1">{hint}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Multi iteration builder */}
              {mode === 'multi' && (
                <div className="bg-white border border-gray-100 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-medium text-gray-900">Iteration plan</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Runs sequentially — VUs scale progressively</p>
                    </div>
                    <span className="text-xs text-gray-400">~{Math.round(totalDuration/60)}min</span>
                  </div>
                  <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-3 mb-1">
                    <span className="col-span-1">#</span>
                    <span className="col-span-3">VUs</span>
                    <span className="col-span-3">Duration (s)</span>
                    <span className="col-span-3">Ramp-up (s)</span>
                    <span className="col-span-2"></span>
                  </div>
                  <div className="space-y-2 mb-3">
                    {iterList.map((it, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg px-3 py-2">
                        <span className="col-span-1 text-xs text-gray-400 font-medium">{i+1}</span>
                        <div className="col-span-3"><input type="number" min="1" value={it.virtual_users} onChange={e => updateIter(i,'virtual_users',e.target.value)} className="text-sm py-1.5" /></div>
                        <div className="col-span-3"><input type="number" min="10" value={it.duration_seconds} onChange={e => updateIter(i,'duration_seconds',e.target.value)} className="text-sm py-1.5" /></div>
                        <div className="col-span-3"><input type="number" min="0" value={it.ramp_up_seconds} onChange={e => updateIter(i,'ramp_up_seconds',e.target.value)} className="text-sm py-1.5" /></div>
                        <div className="col-span-2 flex justify-end">
                          {iterList.length > 1 && <button onClick={() => removeIter(i)} className="text-red-400 hover:text-red-600 p-1"><i className="ti ti-trash text-sm" /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={addIter} className="flex items-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50">
                    <i className="ti ti-plus" /> Add iteration
                  </button>

                  {/* Stop on failure toggle */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button onClick={() => setStopOnFailure(s => !s)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${stopOnFailure ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                      <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                        style={{transform: stopOnFailure ? 'translateX(18px)' : 'translateX(2px)'}} />
                    </button>
                    <span className="text-xs text-gray-600">
                      Stop if error rate &gt; 50% <span className="text-gray-400">(prevents wasting time on broken token or server issues)</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-4 flex-wrap">
                    {iterList.map((it, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-2.5 py-1 rounded-lg font-medium">{it.virtual_users} VUs</div>
                        {i < iterList.length-1 && <i className="ti ti-arrow-right text-gray-300 text-xs" />}
                      </div>
                    ))}
                    <i className="ti ti-arrow-right text-gray-300 text-xs" />
                    <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-2.5 py-1 rounded-lg font-medium">Final report</div>
                  </div>
                </div>
              )}

              {/* Tool selector */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-medium text-gray-900 mb-3">Test tool</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id:'k6',     label:'k6',     desc:'Modern, lightweight. Runs directly in portal.' },
                    { id:'jmeter', label:'JMeter',  desc:'Enterprise standard. Downloads .jmx or runs headless.' },
                  ].map(t => (
                    <button key={t.id} onClick={() => setTool(t.id)}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${tool===t.id?'border-indigo-400 bg-indigo-50':'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                        {tool===t.id && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Selected</span>}
                      </div>
                      <p className="text-xs text-gray-500">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* API filter */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-medium text-gray-900 mb-3">API filter</h2>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id:'all',  icon:'ti-api',      label:'All APIs',     desc:'Run all mapped APIs' },
                    { id:'get',  icon:'ti-download',  label:'GET only',     desc:'Read-only — safe for prod' },
                    { id:'post', icon:'ti-upload',    label:'POST/PUT only', desc:'Write APIs only' },
                  ].map(f => (
                    <button key={f.id} onClick={() => setApiFilter(f.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-colors ${apiFilter===f.id?'border-indigo-400 bg-indigo-50':'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <i className={`ti ${f.icon} text-sm ${apiFilter===f.id?'text-indigo-600':'text-gray-400'}`} />
                        <span className="text-xs font-semibold text-gray-900">{f.label}</span>
                      </div>
                      <p className="text-xs text-gray-400">{f.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions panel */}
            <div className="col-span-1 space-y-3">
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-medium text-gray-900 mb-4">Actions</h2>
                {!selectedLob && <p className="text-xs text-gray-400 italic mb-4">Select a LOB to enable actions</p>}
                <div className="space-y-2">
                  {mode === 'single' ? (
                    <>
                      <button onClick={() => startRun('single')} disabled={!selectedLob||running}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm px-4 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                        <i className={`ti ${running?'ti-loader-2 animate-spin':'ti-player-play'}`} />
                        {running ? 'Running...' : `Run via ${tool==='k6'?'k6':'JMeter'}`}
                      </button>
                      {tool === 'k6' && (
                        <button onClick={handlePreview} disabled={!selectedLob}
                          className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-50">
                          <i className="ti ti-code" /> Preview script
                        </button>
                      )}
                      <button onClick={() => handleDownload(tool==='k6'?'k6':'jmx')} disabled={!selectedLob||!!downloading}
                        className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-50">
                        <i className={`ti ${downloading?'ti-loader-2 animate-spin':'ti-download'}`} />
                        Download {tool==='k6'?'k6 script':'.jmx file'}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => startRun('suite')} disabled={!selectedLob||running||iterList.length===0}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm px-4 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      <i className={`ti ${running?'ti-loader-2 animate-spin':'ti-player-play'}`} />
                      {running ? `Running ${iterList.length} iterations...` : `Run all ${iterList.length} iterations`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* k6 preview */}
          {showPreview && preview && (
            <div id="preview-section" className="mt-5 bg-white border-2 border-indigo-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <i className="ti ti-code text-indigo-500" />
                  <h2 className="text-sm font-medium text-gray-900">k6 script preview</h2>
                  <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">↓ Scroll down to see</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    navigator.clipboard.writeText(preview)
                    alert('Script copied to clipboard!')
                  }} className="flex items-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50">
                    <i className="ti ti-copy" /> Copy script
                  </button>
                  <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 p-1">
                    <i className="ti ti-x" />
                  </button>
                </div>
              </div>
              <pre className="text-xs font-mono bg-gray-900 text-green-400 border border-gray-200 rounded-xl p-4 overflow-x-auto max-h-96 leading-relaxed">{preview}</pre>
            </div>
          )}

          {/* Single run result */}
          {runResult && (
            <div className={`mt-5 border rounded-xl p-5 ${runResult.status==='done'?'bg-green-50 border-green-200':'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-3">
                <i className={`ti ${runResult.status==='done'?'ti-circle-check text-green-600':'ti-circle-x text-red-600'} text-lg`} />
                <span className="text-sm font-medium">{runResult.status==='done'?'Test completed':'Test failed'} — Run #{runResult.id}</span>
              </div>
              {runResult.report_json && (() => {
                const r = JSON.parse(runResult.report_json)
                const m = r.metrics || {}
                if (!m.total_requests) return null
                return (
                  <div className="grid grid-cols-4 gap-2">
                    {[['Total requests',(m.total_requests||0).toLocaleString()],['Avg response',`${m.avg_ms||0}ms`],['p99',`${m.p99_ms||0}ms`],['Error rate',`${(m.error_rate_pct||0).toFixed(1)}%`]].map(([l,v]) => (
                      <div key={l} className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                        <div className="text-base font-semibold text-gray-900">{v}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{l}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Suite result */}
          {suiteResult && (
            <div className={`mt-5 border rounded-xl p-5 ${suiteResult.status==='done'?'bg-green-50 border-green-200':'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-3">
                <i className={`ti ${suiteResult.status==='done'?'ti-circle-check text-green-600':'ti-circle-x text-red-600'} text-lg`} />
                <span className="text-sm font-medium">Progressive test {suiteResult.status} — Suite #{suiteResult.id}</span>
              </div>
              {suiteResult.report_json && (() => {
                const r = JSON.parse(suiteResult.report_json)
                if (!r.iterations) return null
                return (
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-indigo-600 text-white">
                        {['Iter','VUs','Requests','Avg','p90','p99','Error%','Status'].map(h => (
                          <th key={h} className="py-2.5 px-3 font-medium text-center">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {r.iterations.map((it, i) => {
                          if (it.iteration === 'STOPPED') return (
                            <tr key="stopped" className="bg-amber-50">
                              <td colSpan="8" className="py-3 px-4 text-center text-xs text-amber-700 font-medium">
                                <i className="ti ti-alert-triangle mr-1" />{it.reason}
                              </td>
                            </tr>
                          )
                          const m = it.metrics || {}
                          return (
                            <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                              <td className="py-2 px-3 text-center">{it.iteration}</td>
                              <td className="py-2 px-3 text-center">{it.virtual_users}</td>
                              <td className="py-2 px-3 text-center">{(m.total_requests||0).toLocaleString()}</td>
                              <td className="py-2 px-3 text-center">{m.avg_ms||0}ms</td>
                              <td className="py-2 px-3 text-center">{m.p90_ms||0}ms</td>
                              <td className="py-2 px-3 text-center">{m.p99_ms||0}ms</td>
                              <td className={`py-2 px-3 text-center ${(m.error_rate_pct||0)>0?'text-red-600':'text-green-600'}`}>{(m.error_rate_pct||0).toFixed(1)}%</td>
                              <td className="py-2 px-3 text-center">{it.status==='done'?'✓':'✗'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Prod warning popup */}
      {showProdWarning && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-xl text-center max-w-sm mx-4 border-2 border-red-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ti ti-alert-triangle text-red-500 text-3xl" />
            </div>
            <h2 className="text-lg font-bold text-red-600 mb-2">⚠️ Production Environment</h2>
            <p className="text-sm text-gray-600 mb-2">You are about to run a load test on <strong>{selectedLob?.name}</strong> in <strong>Production</strong>.</p>
            <p className="text-sm text-gray-500 mb-6">Make sure you have approval and are testing during off-peak hours.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setShowProdWarning(false); setPendingRunType(null) }}
                className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={() => { setShowProdWarning(false); _executeRun(pendingRunType) }}
                className="px-5 py-2.5 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700">Yes, proceed</button>
            </div>
          </div>
        </div>
      )}

      {/* Running popup */}
      {showRunningPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-xl text-center max-w-sm mx-4">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ti ti-activity text-indigo-600 text-3xl animate-pulse" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Load testing started</h2>
            <p className="text-sm text-gray-500 mb-1">Please wait for the results.</p>
            <p className="text-xs text-gray-400">{mode==='multi'?`Running ${iterList.length} iterations sequentially...`:`Running via ${tool.toUpperCase()} · ${config.duration_seconds}s`}</p>
            <div className="mt-4 flex gap-1 justify-center">
              {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}} />)}
            </div>
          </div>
        </div>
      )}

      {/* Mapping warning */}
      {showMappingWarning && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-xl text-center max-w-sm mx-4">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ti ti-alert-triangle text-amber-500 text-3xl" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No APIs configured</h2>
            <p className="text-sm text-gray-500 mb-4"><strong>{selectedLob?.name}</strong> has no APIs enabled. Please configure the LOB ↔ API mapping first.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setShowMappingWarning(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => { setShowMappingWarning(false); window.location.href = '/mapping' }} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Go to mapping</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
