import { useState, useEffect } from 'react'
import { lobsApi } from '../api'
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })
const reportsApi = {
  list: (lobId) => api.get('/reports/', { params: lobId ? { lob_id: lobId } : {} }),
  get: (id) => api.get(`/reports/${id}`),
  pdf: (payload) => api.post('/reports/pdf', payload, { responseType: 'blob' }),
}
const thresholdsApi = {
  get: (lobId) => api.get(`/thresholds/${lobId}`),
  save: (lobId, data) => api.put(`/thresholds/${lobId}`, data),
}

const ENV_STYLE = {
  prod: 'bg-green-50 text-green-700', staging: 'bg-amber-50 text-amber-700',
  demo: 'bg-blue-50 text-blue-700', uat: 'bg-amber-50 text-amber-700',
}

const METRIC_INFO = {
  'Total requests': 'Total API calls made during the entire test across all virtual users.',
  'Avg response': 'Average server response time. Above 1s is usually a concern.',
  'Error rate': 'Percentage of failed requests (4xx/5xx). Should be 0% ideally.',
  'Peak RPS': 'Peak requests per second — API calls at the busiest moment.',
  'p50': 'Median: 50% of requests were faster than this. Typical user experience.',
  'p90': '90% of requests were faster than this. What most users experience.',
  'p99': '99% of requests were faster than this. Worst-case for 1 in 100 users.',
}

function InfoTooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block ml-1">
      <button type="button" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        className="text-teal-400 hover:text-teal-600 transition-colors">
        <i className="ti ti-info-circle text-xs" />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 leading-relaxed shadow-xl pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  )
}

function _statusText(code) {
  const t = {400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',408:'Timeout',429:'Rate Limited',500:'Server Error',502:'Bad Gateway',503:'Unavailable',504:'Gateway Timeout'}
  return t[code] || `HTTP ${code}`
}

function PassBadge({ pass }) {
  return pass ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-green-50 text-green-700 border-2 border-green-400 px-3 py-1 rounded-full">
      <i className="ti ti-check text-sm" /> PASS
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-50 text-red-700 border-2 border-red-400 px-3 py-1 rounded-full">
      <i className="ti ti-x text-sm" /> FAIL
    </span>
  )
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const [lobs, setLobs] = useState([])
  const [lobFilter, setLobFilter] = useState('')
  const [lobSearch, setLobSearch] = useState('')
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [customObs, setCustomObs] = useState('')
  const [obsSaved, setObsSaved] = useState(false)
  const [qaName, setQaName] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [showPdfOptions, setShowPdfOptions] = useState(false)
  const [view, setView] = useState('list')
  const [thresholds, setThresholds] = useState(null)
  const [threshEdit, setThreshEdit] = useState(false)
  const [threshForm, setThreshForm] = useState({})
  const [threshSaving, setThreshSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { lobsApi.list().then(r => setLobs(r.data)).catch(() => {}) }, [])

  useEffect(() => {
    setLoading(true)
    reportsApi.list(lobFilter || undefined)
      .then(r => setRuns(r.data))
      .catch(() => setError('Failed to load reports'))
      .finally(() => setLoading(false))
  }, [lobFilter])

  const filteredLobs = lobs.filter(l => !lobSearch || l.name.toLowerCase().includes(lobSearch.toLowerCase()))

  const openReport = async (run) => {
    setSelected(run); setDetail(null); setCustomObs(''); setObsSaved(false); setThresholds(null)
    setThreshEdit(false); setView('detail'); setDetailLoading(true)
    try {
      const [rep, thresh] = await Promise.all([reportsApi.get(run.id), thresholdsApi.get(run.lob_id)])
      setDetail(rep.data); setThresholds(thresh.data)
      setThreshForm({ p99_max_ms: thresh.data.p99_max_ms, p90_max_ms: thresh.data.p90_max_ms, error_rate_max_pct: thresh.data.error_rate_max_pct, min_rps: thresh.data.min_rps })
      const m = rep.data?.metrics || {}
      if (m.total_requests > 0) {
        const passed = m.p99_ms <= thresh.data.p99_max_ms && m.error_rate_pct <= thresh.data.error_rate_max_pct
        setCustomObs(passed
          ? `${rep.data.lob?.name} passed all thresholds. p99 ${m.p99_ms}ms within ${thresh.data.p99_max_ms}ms limit, ${m.error_rate_pct?.toFixed(1)}% error rate across ${m.total_requests?.toLocaleString()} requests.`
          : `${rep.data.lob?.name} failed load test. Review metrics below.`)
      }
    } catch { setError('Failed to load report') }
    finally { setDetailLoading(false) }
  }

  const saveThresholds = async () => {
    setThreshSaving(true)
    try { const r = await thresholdsApi.save(selected.lob_id, threshForm); setThresholds(r.data); setThreshEdit(false) }
    catch { alert('Failed to save') } finally { setThreshSaving(false) }
  }

  const downloadPdf = async () => {
    setPdfLoading(true)
    try {
      const res = await reportsApi.pdf({ run_id: selected.id, custom_obs: customObs, qa_name: qaName })
      downloadBlob(res.data, `${selected.lob_name}_run${selected.id}_report.pdf`)
    } catch { alert('PDF failed. Run must have metrics.') }
    finally { setPdfLoading(false) }
  }

  // ── DETAIL VIEW ─────────────────────────────────────────────
  if (view === 'detail' && selected) {
    const m = detail?.metrics || {}
    const t = thresholds || {}
    const has = (m.total_requests || 0) > 0
    const overall = has && m.p99_ms <= (t.p99_max_ms||2000) && m.error_rate_pct <= (t.error_rate_max_pct||5)

    return (
      <div className="p-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
            <i className="ti ti-arrow-left" /> Reports
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">{selected.lob_name} · Run #{selected.id}</span>
          {has && <span className="ml-auto"><PassBadge pass={overall} /></span>}
        </div>

        {detailLoading ? (
          <div className="py-20 text-center text-gray-400">
            <i className="ti ti-loader-2 animate-spin text-3xl mb-3 block text-teal-500" />Loading report...
          </div>
        ) : detail ? (
          <div className="space-y-4">

            {/* Header card with logo */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <img src="/logo.png" alt="salescode.ai" className="h-8 mb-3" onError={e => { e.target.style.display='none' }} />
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-xs text-gray-500">LOB Name</span>
                      <h1 className="text-xl text-gray-900">{detail.lob?.name}</h1>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">API Performance Testing — Load &amp; Stress Test Report</p>
                </div>
                {/* Download button - top right */}
                <div className="text-right">
                  <button onClick={downloadPdf} disabled={pdfLoading}
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl shadow-sm disabled:opacity-60"
                    style={{background:'#007B8A'}}>
                    <i className={`ti ${pdfLoading?'ti-loader-2 animate-spin':'ti-file-download'}`} />
                    {pdfLoading ? 'Generating...' : 'Download Report'}
                  </button>
                  <p className="text-xs text-gray-400 mt-1.5 italic">Please find more details in the report</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs">
                {[
                  ['Environment', detail.lob?.environment?.toUpperCase()],
                  ['Tool', detail.run?.tool?.toUpperCase()],
                  ['Date', new Date(detail.run?.created_at).toLocaleDateString()],
                  ['Run ID', `#${detail.run?.id}`],
                ].map(([l,v]) => (
                  <div key={l} className="bg-white rounded-lg p-2.5 border border-blue-100">
                    <div className="text-gray-400 mb-0.5">{l}</div>
                    <div className="text-gray-800">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {!has && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                <i className="ti ti-alert-triangle mr-2" />Old run — no metrics. Run a new test to see full report.
              </div>
            )}

            {/* Executive summary */}
            {has && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center justify-between">
                Executive summary
                {has && <PassBadge pass={overall} />}
              </h2>
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {[
                    ['Total requests', (m.total_requests||0).toLocaleString()],
                    ['Avg response', `${m.avg_ms||0}ms`],
                    ['Error rate', `${(m.error_rate_pct||0).toFixed(1)}%`, (m.error_rate_pct||0) > (t.error_rate_max_pct||5)],
                    ['Throughput', `${(m.rps||0).toFixed(1)}/s`],
                    ['Max VUs', detail.run?.virtual_users],
                  ].map(([l, v, danger]) => (
                    <div key={l} className={`rounded-xl p-3 text-center border ${danger ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                      <div className={`text-xl font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{v}</div>
                      <div className="text-xs text-gray-500 flex items-center justify-center gap-0.5 mt-0.5">
                        {l}{METRIC_INFO[l] && <InfoTooltip text={METRIC_INFO[l]} />}
                      </div>
                    </div>
                  ))}
                </div>
                <label className="block text-xs text-gray-500 mb-1.5">Observation <span className="text-gray-300">(editable before sharing)</span></label>
                <textarea value={customObs} onChange={e => { setCustomObs(e.target.value); setObsSaved(false) }} rows={3}
                  className="text-sm resize-none w-full border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-gray-400">Edit this text before downloading the PDF</p>
                  <button onClick={() => setObsSaved(true)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      obsSaved ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <i className={`ti ${obsSaved ? 'ti-check' : 'ti-device-floppy'} text-xs`} />
                    {obsSaved ? 'Saved' : 'Save observation'}
                  </button>
                </div>
              </div>
            )}

            {/* Test parameters */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Test parameters</h2>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  ['Virtual users', detail.run?.virtual_users],
                  ['Duration', `${detail.run?.duration_seconds}s`],
                  ['Ramp-up', `${detail.run?.ramp_up_seconds}s`],
                  ['Iterations', detail.run?.iterations || 'Duration-based'],
                  ['Tool', detail.run?.tool?.toUpperCase()],
                  ['Base URL', detail.lob?.base_url],
                ].map(([l,v]) => (
                  <div key={l} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                    <div className="text-gray-400 mb-0.5">{l}</div>
                    <div className="font-medium text-gray-800 truncate">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Error details — only shown when errors > 0 */}
            {has && (m.error_rate_pct||0) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-red-800 mb-4 flex items-center gap-2">
                  <i className="ti ti-alert-triangle text-red-600" />
                  Error Analysis
                  <span className="ml-auto text-xs font-normal text-red-500">{m.errors} failed requests</span>
                </h2>

                {/* Status code breakdown */}
                {m.status_summary && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-red-700 mb-2">HTTP status code breakdown:</p>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(m.status_summary.details || {}).map(([code, count]) => {
                        const is4xx = code.startsWith('4')
                        const is5xx = code.startsWith('5')
                        const is2xx = code.startsWith('2')
                        const bg = is2xx ? 'bg-green-100 text-green-800 border-green-300' : is4xx ? 'bg-amber-100 text-amber-800 border-amber-300' : is5xx ? 'bg-red-100 text-red-800 border-red-300' : 'bg-gray-100 text-gray-700 border-gray-300'
                        return (
                          <div key={code} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${bg}`}>
                            <span className="font-mono font-bold">{code}</span>
                            <span>{_statusText(parseInt(code))}</span>
                            <span className="font-bold">×{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Error samples table */}
                {m.error_samples && m.error_samples.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-700 mb-2">Sample failed requests (up to 10):</p>
                    <div className="overflow-hidden rounded-xl border border-red-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-red-600 text-white">
                            {['Method','Endpoint','Status','Error','Latency'].map(h => (
                              <th key={h} className={`py-2.5 px-3 font-medium ${h==='Endpoint'?'text-left':'text-center'}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {m.error_samples.map((s, i) => (
                            <tr key={i} className={i%2===0?'bg-white':'bg-red-50/50'}>
                              <td className="py-2 px-3 text-center">
                                <span className={`font-mono font-semibold px-2 py-0.5 rounded text-xs ${s.method==='GET'?'bg-blue-50 text-blue-700':'bg-green-50 text-green-700'}`}>{s.method}</span>
                              </td>
                              <td className="py-2 px-3 font-mono text-gray-700 max-w-xs truncate">{s.endpoint}</td>
                              <td className="py-2 px-3 text-center font-bold text-red-600 font-mono">{s.status_code}</td>
                              <td className="py-2 px-3 text-center text-amber-700 font-medium">{s.status_text}</td>
                              <td className="py-2 px-3 text-center text-gray-600">{s.latency_ms}ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-red-400 mt-2">
                      <i className="ti ti-info-circle mr-1" />
                      {m.error_samples[0]?.status_code === 401 && 'HTTP 401 — Token expired or invalid. Refresh the token in Lines of Business and re-run.'}
                      {m.error_samples[0]?.status_code === 403 && 'HTTP 403 — Forbidden. Check if the LOB has permission to access this API.'}
                      {m.error_samples[0]?.status_code === 404 && 'HTTP 404 — Endpoint not found. Verify the API URL in the API library.'}
                      {m.error_samples[0]?.status_code === 500 && 'HTTP 500 — Server error. The API is returning errors under load. Reduce VUs or check server logs.'}
                      {m.error_samples[0]?.status_code === 429 && 'HTTP 429 — Rate limited. The server is rejecting requests due to too many concurrent calls. Reduce VUs.'}
                      {m.error_samples[0]?.status_code === 503 && 'HTTP 503 — Service unavailable. Server is overloaded. Reduce VUs or wait and retry.'}
                    </p>
                  </div>
                )}
              </div>
            )}
            {has && m.by_endpoint && Object.keys(m.by_endpoint).length > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Per-endpoint breakdown</h2>
                <div className="overflow-hidden rounded-xl border border-gray-100" style={{fontFamily:'Arial,Helvetica,sans-serif'}}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#0bacaa] text-white">
                        {['Method','Endpoint','Requests','p50','p90','p99','Errors','Status'].map(h => (
                          <th key={h} className={`py-2.5 px-3 font-medium ${h==='Endpoint'?'text-left':'text-center'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(m.by_endpoint).map(([ep, d], i) => {
                        const epPass = d.p99_ms<=(t.p99_max_ms||2000) && (d.errors/Math.max(d.count,1)*100)<=(t.error_rate_max_pct||5)
                        const METHOD_COLORS = { GET:'bg-blue-50 text-blue-700', POST:'bg-green-50 text-green-700', PUT:'bg-amber-50 text-amber-700', DELETE:'bg-red-50 text-red-700', PATCH:'bg-purple-50 text-purple-700' }
                        const method = d.method || 'GET'
                        return (
                          <tr key={ep} className={i%2===0?'bg-white':'bg-gray-50'}>
                            <td className="py-2 px-3 text-center">
                              <span className={`font-mono font-semibold px-2 py-0.5 rounded text-xs ${METHOD_COLORS[method]||'bg-gray-100 text-gray-600'}`}>{method}</span>
                            </td>
                            <td className="py-2 px-3 font-mono text-gray-700 max-w-xs truncate">{ep}</td>
                            <td className="py-2 px-3 text-center text-gray-600">{d.count}</td>
                            <td className="py-2 px-3 text-center text-gray-600">{d.p50_ms}ms</td>
                            <td className="py-2 px-3 text-center text-gray-600">{d.p90_ms}ms</td>
                            <td className={`py-2 px-3 text-center font-medium ${d.p99_ms>(t.p99_max_ms||2000)?'text-red-600':'text-gray-700'}`}>{d.p99_ms}ms</td>
                            <td className={`py-2 px-3 text-center ${d.errors>0?'text-red-600':'text-gray-400'}`}>{d.errors}</td>
                            <td className="py-2 px-3 text-center"><PassBadge pass={epPass} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Thresholds */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Pass/fail thresholds — {detail.lob?.name}</h2>
                {!threshEdit
                  ? <button onClick={() => setThreshEdit(true)} className="text-xs text-teal-600 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 flex items-center gap-1"><i className="ti ti-edit" />Edit</button>
                  : <div className="flex gap-2">
                      <button onClick={() => setThreshEdit(false)} className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">Cancel</button>
                      <button onClick={saveThresholds} disabled={threshSaving} className="text-xs bg-[#0bacaa] text-white px-3 py-1.5 rounded-lg hover:bg-[#099e9c] disabled:opacity-60">{threshSaving?'Saving...':'Save'}</button>
                    </div>
                }
              </div>
              {!threshEdit ? (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ['p99 max', `${t.p99_max_ms}ms`, 'FAIL if exceeded'],
                    ['p90 max', `${t.p90_max_ms}ms`, 'FAIL if exceeded'],
                    ['Error rate max', `${t.error_rate_max_pct}%`, 'FAIL if exceeded'],
                    ['Min RPS', t.min_rps>0?t.min_rps:'No limit', 'FAIL if below'],
                  ].map(([l,v,h]) => (
                    <div key={l} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-gray-900">{v}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{l}</div>
                      <div className="text-xs text-gray-400 mt-1">{h}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {[['p99 max (ms)','p99_max_ms'],['p90 max (ms)','p90_max_ms'],['Error rate max (%)','error_rate_max_pct'],['Min RPS','min_rps']].map(([l,k]) => (
                    <div key={k}>
                      <label className="block text-xs text-gray-500 mb-1">{l}</label>
                      <input type="number" value={threshForm[k]} onChange={e => setThreshForm(f=>({...f,[k]:parseFloat(e.target.value)||0}))} className="text-sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : <div className="py-20 text-center text-sm text-gray-400">Failed to load.</div>}
      </div>
    )
  }

  // ── LIST VIEW ────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">All completed test runs</p>
        </div>
        {/* Searchable LOB filter */}
        <div className="relative w-56">
          <i className="ti ti-search absolute left-3 top-2.5 text-gray-400 text-xs" />
          <input
            className="pl-7 text-sm w-full"
            placeholder="Filter by LOB..."
            value={lobSearch}
            onChange={e => { setLobSearch(e.target.value); if (!e.target.value) setLobFilter('') }}
          />
          {lobSearch && filteredLobs.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
              <button onClick={() => { setLobFilter(''); setLobSearch('') }}
                className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 border-b border-gray-100">
                All LOBs
              </button>
              {filteredLobs.map(l => (
                <button key={l.id} onClick={() => { setLobFilter(l.id); setLobSearch(l.name) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between">
                  <span>{l.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${ENV_STYLE[l.environment]||'bg-gray-50 text-gray-500'}`}>{l.environment}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-gray-400"><i className="ti ti-loader-2 animate-spin text-2xl mb-2 block text-teal-400" />Loading...</div>
        ) : runs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <i className="ti ti-chart-bar text-4xl mb-3 block text-gray-200" />No completed runs yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0bacaa] text-white">
                {['Run','Date','LOB','Env','Tool','Errors %',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr key={run.id} className={`border-b border-gray-50 hover:bg-teal-50/30 cursor-pointer transition-colors ${i%2!==0?'bg-gray-50/50':''}`}
                  onClick={() => openReport(run)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">#{run.id}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{new Date(run.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{run.lob_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${ENV_STYLE[run.lob_env]||'bg-gray-50 text-gray-600'}`}>{run.lob_env}</span>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase font-medium text-gray-600">{run.tool}</td>
                  <td className={`px-4 py-3 text-xs font-semibold ${run.error_rate_pct>0?'text-red-600':'text-green-600'}`}>
                    {run.error_rate_pct?.toFixed(1)??'—'}%
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-xs text-teal-600 font-medium">
                      View <i className="ti ti-arrow-right text-xs" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
