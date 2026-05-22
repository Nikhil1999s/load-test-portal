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
    const errThresh = t.error_rate_max_pct || 5
    const overall = has && (m.error_rate_pct||0) <= errThresh

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

            {/* Executive Summary */}
            {has && (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{background:'#F0FAFA'}}>
                  <div className="flex items-center gap-2">
                    <i className="ti ti-clipboard-text text-teal-600" />
                    <h2 className="text-sm font-semibold text-gray-900">1. Executive Summary</h2>
                  </div>
                  <PassBadge pass={overall} />
                </div>

                <div className="p-6 space-y-5">

                  {/* 1.1 Purpose & Scope */}
                  <div>
                    <h3 className="text-xs font-bold text-navy-700 uppercase tracking-wide mb-2" style={{color:'#1565C0'}}>1.1 Purpose & Scope</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      This report presents results of load and stress testing conducted on the{' '}
                      <span className="font-semibold">{detail.lob?.name}</span> API platform using{' '}
                      <span className="font-semibold">{detail.run?.tool?.toUpperCase()}</span> in the{' '}
                      <span className="font-semibold">{detail.lob?.environment?.toUpperCase()}</span> environment.
                      Testing was executed with <span className="font-semibold">{detail.run?.virtual_users} virtual {detail.run?.virtual_users===1?'user':'users'}</span> over
                      a {detail.run?.ramp_up_seconds}s ramp-up period, sustained for <span className="font-semibold">{detail.run?.duration_seconds} seconds</span>.
                    </p>
                  </div>

                  {/* 1.2 Test Outcome */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{color:'#1565C0'}}>1.2 Test Outcome</h3>
                    <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed border ${overall ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                      {overall ? (
                        <>
                          The <strong>{detail.lob?.name}</strong> platform demonstrated <strong>stable and acceptable performance</strong> throughout the test.
                          A total of <strong>{(m.total_requests||0).toLocaleString()} requests</strong> were executed across{' '}
                          <strong>{Object.keys(m.by_endpoint||{}).length} endpoints</strong>, achieving an average response of{' '}
                          <strong>{m.avg_ms||0}ms</strong> and throughput of <strong>{(m.rps||0).toFixed(1)} req/s</strong>.
                          Error rate remained at <strong>{(m.error_rate_pct||0).toFixed(2)}%</strong> — within the {t.error_rate_max_pct||5}% limit.
                          p99 latency of <strong>{m.p99_ms||0}ms</strong> was within the {t.p99_max_ms||2000}ms SLA.{' '}
                          <strong>All performance thresholds were met. Overall verdict: PASS.</strong>
                        </>
                      ) : (
                        <>
                          The <strong>{detail.lob?.name}</strong> platform encountered <strong>performance issues</strong> during load testing.
                          Out of <strong>{(m.total_requests||0).toLocaleString()} requests</strong>,{' '}
                          <strong>{m.errors||0} failed</strong> ({(m.error_rate_pct||0).toFixed(2)}% error rate).
                          {m.p99_ms > (t.p99_max_ms||2000) && <> p99 latency of <strong>{m.p99_ms}ms</strong> exceeded the {t.p99_max_ms||2000}ms threshold.</>}
                          {' '}<strong>Immediate investigation is recommended before the next release.</strong>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 1.3 Scope of Testing */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{color:'#1565C0'}}>1.3 Scope of Testing</h3>
                    <div className="overflow-hidden rounded-xl border border-gray-200">
                      <table className="w-full text-xs">
                        <tbody>
                          {[
                            ['Tested Endpoints', `${Object.keys(m.by_endpoint||{}).length} API endpoint${Object.keys(m.by_endpoint||{}).length!==1?'s':''}`],
                            ['Test Type', 'Load & Stress Testing — simulated concurrent users'],
                            ['Environment', `${detail.lob?.environment?.toUpperCase()} — ${detail.lob?.base_url}`],
                            ['Tool', `${detail.run?.tool?.toUpperCase()} — automated script execution`],
                            ['Virtual Users', `${detail.run?.virtual_users} concurrent virtual ${detail.run?.virtual_users===1?'user':'users'}`],
                            ['Test Duration', `${detail.run?.duration_seconds}s (${Math.floor((detail.run?.duration_seconds||0)/60)}m ${(detail.run?.duration_seconds||0)%60}s)`],
                            ['Ramp-up Period', `${detail.run?.ramp_up_seconds}s — gradual load increase`],
                            ['Execution Date', new Date(detail.run?.created_at).toLocaleString()],
                          ].map(([l,v],i) => (
                            <tr key={l} className={i%2===0?'bg-white':'bg-gray-50'}>
                              <td className="px-4 py-2.5 font-semibold text-gray-500 w-40 border-r border-gray-200">{l}</td>
                              <td className="px-4 py-2.5 text-gray-800">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 1.4 Key Findings */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{color:'#1565C0'}}>1.4 Key Findings at a Glance</h3>
                    <div className="overflow-hidden rounded-xl border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{background:'#0bacaa'}} className="text-white">
                            {['METRIC','RESULT','SLA TARGET','STATUS'].map(h=>(
                              <th key={h} className="py-2.5 px-4 text-center font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['Total Requests',              (m.total_requests||0).toLocaleString(), '—',                              true],
                            ['Average Response Time',       `${m.avg_ms||0}ms`,                     'For reference',                  null],
                            ['p90 Response Time',           `${m.p90_ms||0}ms`,                     'For reference',                  null],
                            ['p99 Response Time (Worst)',   `${m.p99_ms||0}ms`,                     'For reference',                  null],
                            ['Error Rate',                  `${(m.error_rate_pct||0).toFixed(2)}%`, `< ${errThresh}%`,                (m.error_rate_pct||0) <= errThresh],
                            ['Throughput',                  `${(m.rps||0).toFixed(1)} req/s`,       '> 0 req/s',                      true],
                            ['System Availability',         `${((1-(m.error_rate_pct||0)/100)*100).toFixed(2)}%`, '> 99.0%',          (m.error_rate_pct||0) < 1],
                          ].map(([metric, result, sla, pass], i) => (
                            <tr key={metric} className={i%2===0?'bg-white':'bg-gray-50'}>
                              <td className="py-2.5 px-4 text-gray-800">{metric}</td>
                              <td className="py-2.5 px-4 text-center font-semibold text-gray-900">{result}</td>
                              <td className="py-2.5 px-4 text-center text-gray-400 text-xs">{sla}</td>
                              <td className="py-2.5 px-4 text-center">
                                {pass === null
                                  ? <span className="text-gray-400 text-xs">—</span>
                                  : <span className={`font-bold text-xs ${pass?'text-green-600':'text-red-600'}`}>{pass?'PASS':'FAIL'}</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* 2. Test Environment */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2" style={{background:'#EEF2FF'}}>
                <i className="ti ti-server text-indigo-600" />
                <h2 className="text-sm font-semibold" style={{color:'#1565C0'}}>2. Test Environment & Configuration</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Environment', detail.lob?.environment?.toUpperCase()],
                    ['Base URL', detail.lob?.base_url],
                    ['Tool', detail.run?.tool?.toUpperCase()],
                    ['Virtual Users', `${detail.run?.virtual_users} concurrent users`],
                    ['Duration', `${detail.run?.duration_seconds}s`],
                    ['Ramp-up Period', `${detail.run?.ramp_up_seconds}s`],
                    ['Iterations', detail.run?.iterations || 'Duration-based'],
                    ['Start Time', new Date(detail.run?.created_at).toLocaleString()],
                    ['End Time', detail.run?.finished_at ? new Date(detail.run?.finished_at).toLocaleString() : 'N/A'],
                    ['Run ID', `#${detail.run?.id}`],
                  ].map(([l,v]) => (
                    <div key={l} className="flex gap-2 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                      <span className="font-semibold text-gray-500 w-28 flex-shrink-0">{l}</span>
                      <span className="text-gray-800 font-medium truncate">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Response Time Analysis Table */}
            {has && m.by_endpoint && Object.keys(m.by_endpoint).length > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2" style={{background:'#EEF2FF'}}>
                  <i className="ti ti-chart-bar text-indigo-600" />
                  <h2 className="text-sm font-semibold" style={{color:'#1565C0'}}>3. Response Time Analysis — Per Endpoint</h2>
                </div>
                <div className="p-6">
                  <p className="text-xs text-gray-400 mb-3">Color key: 🟢 Fast · 🟡 Moderate (70–100% of avg) · 🔴 Slow (above avg)</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="text-xs" style={{minWidth:'700px',width:'100%'}}>
                      <thead>
                        <tr style={{background:'#0bacaa'}} className="text-white">
                          {['ENDPOINT','METHOD','REQUESTS','AVG','P50','P90','P99','ERRORS','STATUS'].map(h=>(
                            <th key={h} className="py-2.5 px-3 text-center font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(m.by_endpoint).map(([ep, d], i) => {
                          const errPct = d.count > 0 ? (d.errors/d.count*100) : 0
                          const epPass = errPct <= errThresh
                          const avg = m.avg_ms || 100
                          const latColor = (v) => v > avg*1.5 ? 'text-red-600 font-bold' : v > avg*0.7 ? 'text-amber-600 font-semibold' : 'text-green-600'
                          const method = d.method || 'GET'
                          const MC = {GET:'bg-blue-50 text-blue-700',POST:'bg-green-50 text-green-700',PUT:'bg-amber-50 text-amber-700',DELETE:'bg-red-50 text-red-700'}
                          const short = ep.length > 35 ? ep.slice(0,33)+'..' : ep
                          return (
                            <tr key={ep} className={i%2===0?'bg-white':'bg-gray-50'}>
                              <td className="py-2 px-3 font-mono text-gray-700 max-w-xs" title={ep}>{short}</td>
                              <td className="py-2 px-3 text-center"><span className={`font-semibold px-2 py-0.5 rounded text-xs ${MC[method]||'bg-gray-100 text-gray-600'}`}>{method}</span></td>
                              <td className="py-2 px-3 text-center text-gray-600">{d.count}</td>
                              <td className={`py-2 px-3 text-center ${latColor(d.p50_ms)}`}>{d.p50_ms}ms</td>
                              <td className={`py-2 px-3 text-center ${latColor(d.p50_ms)}`}>{d.p50_ms}ms</td>
                              <td className={`py-2 px-3 text-center ${latColor(d.p90_ms)}`}>{d.p90_ms}ms</td>
                              <td className={`py-2 px-3 text-center ${latColor(d.p99_ms)}`}>{d.p99_ms}ms</td>
                              <td className={`py-2 px-3 text-center font-semibold ${d.errors>0?'text-red-600':'text-green-600'}`}>{d.errors}</td>
                              <td className="py-2 px-3 text-center"><span className={`font-bold text-xs ${epPass?'text-green-600':'text-red-600'}`}>{epPass?'PASS':'FAIL'}</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Throughput & Error Rates */}
            {has && (
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2" style={{background:'#EEF2FF'}}>
                  <i className="ti ti-activity text-indigo-600" />
                  <h2 className="text-sm font-semibold" style={{color:'#1565C0'}}>4. Throughput & Error Rate Summary</h2>
                </div>
                <div className="p-6">
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{background:'#0bacaa'}} className="text-white">
                          {['SCENARIO','VIRTUAL USERS','TOTAL REQUESTS','AVG TPS','ERROR RATE','RESULT'].map(h=>(
                            <th key={h} className="py-2.5 px-4 text-center font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-white">
                          <td className="py-3 px-4 font-medium">{detail.lob?.name} — {detail.run?.tool?.toUpperCase()}</td>
                          <td className="py-3 px-4 text-center">{detail.run?.virtual_users}</td>
                          <td className="py-3 px-4 text-center font-semibold">{(m.total_requests||0).toLocaleString()}</td>
                          <td className="py-3 px-4 text-center">{(m.rps||0).toFixed(1)}</td>
                          <td className={`py-3 px-4 text-center font-bold ${(m.error_rate_pct||0)>0?'text-red-600':'text-green-600'}`}>{(m.error_rate_pct||0).toFixed(2)}%</td>
                          <td className="py-3 px-4 text-center"><span className={`font-bold ${overall?'text-green-600':'text-red-600'}`}>{overall?'PASS':'FAIL'}</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                    <i className="ti ti-info-circle text-gray-400" />
                    Pass/Fail is determined by error rate threshold only. Current threshold: <strong className="mx-1">{errThresh}%</strong>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Error Analysis — always show if errors */}
            {has && (m.error_rate_pct||0) > 0 && (
              <div className="bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-red-200 flex items-center gap-2 bg-red-50">
                  <i className="ti ti-alert-triangle text-red-600" />
                  <h2 className="text-sm font-semibold text-red-800">5. Defects & Error Analysis</h2>
                  <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{m.errors} failed requests · {(m.error_rate_pct||0).toFixed(2)}% error rate</span>
                </div>
                <div className="p-6 space-y-4">
                  {m.status_summary?.details && (
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-2">HTTP STATUS CODE BREAKDOWN</p>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(m.status_summary.details||{}).map(([code,count]) => {
                          const bg = code.startsWith('2') ? 'bg-green-100 text-green-800 border-green-300' : code.startsWith('4') ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300'
                          return <div key={code} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${bg}`}>
                            <span className="font-mono font-bold">{code}</span>
                            <span>{_statusText(parseInt(code))}</span>
                            <span className="font-bold">×{count}</span>
                          </div>
                        })}
                      </div>
                    </div>
                  )}
                  {m.error_samples?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-2">SAMPLE FAILED REQUESTS</p>
                      <div className="overflow-hidden rounded-xl border border-red-200">
                        <table className="w-full text-xs">
                          <thead><tr className="bg-red-600 text-white">
                            {['METHOD','ENDPOINT','STATUS','ERROR','LATENCY'].map(h=>(
                              <th key={h} className="py-2.5 px-3 font-medium text-center">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {m.error_samples.map((s,i)=>(
                              <tr key={i} className={i%2===0?'bg-white':'bg-red-50'}>
                                <td className="py-2 px-3 text-center"><span className={`font-mono font-semibold px-2 py-0.5 rounded text-xs ${s.method==='GET'?'bg-blue-50 text-blue-700':'bg-green-50 text-green-700'}`}>{s.method}</span></td>
                                <td className="py-2 px-3 font-mono text-gray-700 truncate max-w-xs" title={s.endpoint}>{s.endpoint}</td>
                                <td className="py-2 px-3 text-center font-bold text-red-600">{s.status_code}</td>
                                <td className="py-2 px-3 text-center text-amber-700">{s.status_text}</td>
                                <td className="py-2 px-3 text-center text-gray-600">{s.latency_ms}ms</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                        <i className="ti ti-bulb mr-1" />
                        {m.error_samples[0]?.status_code===401 && 'HTTP 401 — Token expired. Refresh token in Lines of Business and re-run.'}
                        {m.error_samples[0]?.status_code===403 && 'HTTP 403 — Forbidden. Check LOB permissions for this API.'}
                        {m.error_samples[0]?.status_code===404 && 'HTTP 404 — Endpoint not found. Verify the API URL in the API library.'}
                        {m.error_samples[0]?.status_code===500 && 'HTTP 500 — Server error under load. Check if request body/params are correct for this LOB.'}
                        {m.error_samples[0]?.status_code===429 && 'HTTP 429 — Rate limited. Reduce virtual users and re-run.'}
                        {m.error_samples[0]?.status_code===503 && 'HTTP 503 — Server overloaded. Reduce VUs or retry during off-peak hours.'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. Threshold Config */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{background:'#EEF2FF'}}>
                <div className="flex items-center gap-2">
                  <i className="ti ti-adjustments text-indigo-600" />
                  <h2 className="text-sm font-semibold" style={{color:'#1565C0'}}>6. Pass/Fail Threshold</h2>
                </div>
                {!threshEdit && <button onClick={() => setThreshEdit(true)} className="text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1 hover:bg-indigo-50"><i className="ti ti-edit mr-1"/>Edit</button>}
              </div>
              <div className="p-6">
                {threshEdit ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Error Rate Threshold (%)</label>
                      <input type="number" min="0" max="100" step="0.5" value={threshForm.error_rate_max_pct}
                        onChange={e => setThreshForm(f => ({...f, error_rate_max_pct: parseFloat(e.target.value)}))}
                        className="text-sm w-40" />
                      <p className="text-xs text-gray-400 mt-1">Test FAILS if error rate exceeds this value</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveThresholds} disabled={threshSaving}
                        className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                        <i className={`ti ${threshSaving?'ti-loader-2 animate-spin':'ti-check'}`} />{threshSaving?'Saving...':'Save'}
                      </button>
                      <button onClick={() => setThreshEdit(false)} className="text-xs border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="bg-gray-50 rounded-xl px-5 py-3 border border-gray-200 text-center">
                      <div className="text-2xl font-bold text-indigo-600">{t.error_rate_max_pct||5}%</div>
                      <div className="text-xs text-gray-500 mt-0.5">Max error rate</div>
                    </div>
                    <p className="text-xs text-gray-500">If the error rate exceeds <strong>{t.error_rate_max_pct||5}%</strong>, the test is marked as <span className="text-red-600 font-bold">FAIL</span>. Response time metrics are shown for reference only.</p>
                  </div>
                )}
              </div>
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
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0bacaa] text-white">
                {['Run','Date','LOB','Env','Tool','Errors %','Result',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium border border-[#099e9c]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr key={run.id} className={`hover:bg-teal-50/30 cursor-pointer transition-colors ${i%2!==0?'bg-gray-50/50':'bg-white'}`}
                  onClick={() => openReport(run)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 border border-gray-200">#{run.id}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 border border-gray-200">{new Date(run.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900 border border-gray-200">{run.lob_name}</td>
                  <td className="px-4 py-3 border border-gray-200">
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${ENV_STYLE[run.lob_env]||'bg-gray-50 text-gray-600'}`}>{run.lob_env}</span>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase font-medium text-gray-600 border border-gray-200">{run.tool}</td>
                  <td className={`px-4 py-3 text-xs font-semibold border border-gray-200 ${run.error_rate_pct>0?'text-red-600':'text-green-600'}`}>
                    {run.error_rate_pct?.toFixed(1)??'—'}%
                  </td>
                  <td className="px-4 py-3 border border-gray-200">
                    {run.status === 'failed'
                      ? <span className="text-xs font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">Failed</span>
                      : run.error_rate_pct > 0
                        ? <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Errors</span>
                        : <span className="text-xs font-semibold bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Pass</span>
                    }
                  </td>
                  <td className="px-4 py-3 border border-gray-200">
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
