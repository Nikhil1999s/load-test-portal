import { useState, useEffect } from 'react'
import {
  lobsApi,
  performanceApi,
  getOpenObserveTestAuth,
  setOpenObserveTestAuth,
  clearOpenObserveTestAuth,
} from '../api'
import MetricTimelineChart from '../components/MetricTimelineChart'
import { formatUtc, severityClass } from './performanceUtils'

const ENV_STYLE = {
  prod: 'bg-green-50 text-green-700',
  staging: 'bg-amber-50 text-amber-700',
  demo: 'bg-blue-50 text-blue-700',
  uat: 'bg-amber-50 text-amber-700',
}

function canFetchLogs(config) {
  if (config?.configured) return true
  const a = getOpenObserveTestAuth()
  return Boolean(a.jwt || a.sctoken)
}

function usingHardcoded(config) {
  return config?.auth_mode === 'hardcoded_curl'
}

export default function Performance() {
  const [config, setConfig] = useState(null)
  const [lobs, setLobs] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [lobFilter, setLobFilter] = useState('')
  const [lobSearch, setLobSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [errorData, setErrorData] = useState(null)
  const [logsLoading, setLogsLoading] = useState(false)
  const [error, setError] = useState('')
  const [testJwt, setTestJwt] = useState('')
  const [testSctoken, setTestSctoken] = useState('')
  const [testOrg, setTestOrg] = useState('demo')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [activeTab, setActiveTab] = useState('stats')
  const [logMode, setLogMode] = useState('all')
  const [statsData, setStatsData] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [dashboardData, setDashboardData] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)

  useEffect(() => {
    performanceApi.config().then((r) => setConfig(r.data)).catch(() => {})
    lobsApi.list().then((r) => setLobs(r.data)).catch(() => {})
    const saved = getOpenObserveTestAuth()
    if (saved.jwt) setTestJwt(saved.jwt)
    if (saved.sctoken) setTestSctoken(saved.sctoken)
    if (saved.org) setTestOrg(saved.org)
  }, [])

  useEffect(() => {
    setLoading(true)
    performanceApi
      .listRuns(lobFilter || undefined)
      .then((r) => setRuns(r.data))
      .catch((e) => setError(e.response?.data?.detail || 'Failed to load runs'))
      .finally(() => setLoading(false))
  }, [lobFilter])

  const filteredLobs = lobs.filter((l) =>
    l.name.toLowerCase().includes(lobSearch.toLowerCase())
  )

  function saveTestAuth() {
    setOpenObserveTestAuth({ jwt: testJwt.trim(), sctoken: testSctoken.trim(), org: testOrg })
    setTestResult(null)
    setError('')
  }

  async function runApiTest(run) {
    if (!testJwt.trim() && !testSctoken.trim()) {
      setError('Paste jwt (and optional sctoken) from Pulse cookies first')
      return
    }
    saveTestAuth()
    setTestLoading(true)
    setTestResult(null)
    setError('')
    try {
      const body = {
        jwt: testJwt.trim(),
        sctoken: testSctoken.trim() || undefined,
        org: testOrg,
        errors_only: false,
      }
      if (run) {
        body.run_id = run.id
        body.lob = run.lob_name
      } else {
        body.lob = 'demounnati'
      }
      const res = await performanceApi.testSearch(body)
      setTestResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'OpenObserve test failed')
    } finally {
      setTestLoading(false)
    }
  }

  async function loadStats(run) {
    setStatsLoading(true)
    try {
      const res = await performanceApi.getRunStats(run.id)
      setStatsData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch performance stats')
    } finally {
      setStatsLoading(false)
    }
  }

  async function loadDashboard(run) {
    setDashboardLoading(true)
    try {
      const res = await performanceApi.getRunDashboard(run.id)
      setDashboardData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch dashboard data')
    } finally {
      setDashboardLoading(false)
    }
  }

  async function loadErrors(run, mode = logMode) {
    setLogsLoading(true)
    try {
      const res = await performanceApi.getRunErrors(run.id, mode)
      setErrorData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch error logs')
    } finally {
      setLogsLoading(false)
    }
  }

  async function openRun(run) {
    setSelected(run)
    setErrorData(null)
    setStatsData(null)
    setDashboardData(null)
    setError('')
    setActiveTab('performance')
    if (!canFetchLogs(config)) {
      setError('Save browser credentials below, then open this run again')
      return
    }
    await Promise.all([loadStats(run), loadErrors(run, logMode), loadDashboard(run)])
  }

  const TestAuthPanel = ({ compact }) => (
    <div className={`bg-slate-50 border border-slate-200 rounded-xl ${compact ? 'p-4 mb-4' : 'p-4 mb-6'}`}>
      <p className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2">
        <i className="ti ti-key" /> Test with Pulse cookies (no .env)
      </p>
      <p className="text-xs text-slate-600 mb-3">
        DevTools → Application → Cookies → pulse.salescode.ai → copy <strong>jwt</strong> and{' '}
        <strong>sctoken</strong>. Same auth as your curl.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs text-slate-500 block mb-1">jwt</label>
          <input
            className="w-full text-xs font-mono"
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            value={testJwt}
            onChange={(e) => setTestJwt(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-slate-500 block mb-1">sctoken (optional)</label>
          <input
            className="w-full text-xs font-mono"
            placeholder="Basic Y2tjb2VkZW1v..."
            value={testSctoken}
            onChange={(e) => setTestSctoken(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">org</label>
          <input className="w-full text-sm" value={testOrg} onChange={(e) => setTestOrg(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" onClick={saveTestAuth} className="text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">
          Save for session
        </button>
        <button
          type="button"
          disabled={testLoading}
          onClick={() => runApiTest(selected || runs[0])}
          className="text-xs px-3 py-1.5 bg-[#0bacaa] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {testLoading ? 'Calling API…' : 'Test API (all logs, like curl)'}
        </button>
        <button
          type="button"
          onClick={() => { clearOpenObserveTestAuth(); setTestJwt(''); setTestSctoken(''); setTestResult(null) }}
          className="text-xs px-3 py-1.5 text-slate-600 hover:text-slate-900"
        >
          Clear
        </button>
      </div>
      {testResult?.ok && (
        <div className="mt-3 text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <strong>API OK</strong> — total {testResult.total}, returned {testResult.returned} logs
          <span className="text-green-700 block mt-1 font-mono truncate" title={testResult.sql}>{testResult.sql}</span>
        </div>
      )}
    </div>
  )

  if (selected) {
    const win = statsData?.window || errorData?.window
    return (
      <div className="p-8 max-w-[1400px]">
        <button
          type="button"
          onClick={() => { setSelected(null); setErrorData(null); setStatsData(null); setError('') }}
          className="text-sm text-teal-600 hover:text-teal-800 mb-4 flex items-center gap-1"
        >
          <i className="ti ti-arrow-left" /> Back to runs
        </button>

        {!config?.configured && !usingHardcoded(config) && <TestAuthPanel compact />}

        <div className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Run #{selected.id} — {selected.lob_name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {selected.lob_env} · {selected.tool} · {selected.virtual_users} VUs ·{' '}
            {formatUtc(statsData?.run?.created_at || selected.created_at)}
          </p>
          {win && (
            <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 mt-2">
              <strong>Query window (IST):</strong> {formatUtc(win.start)} → {formatUtc(win.end)}
              {win.strict && ' · exact start/end, no buffer'}
              {!win.strict && win.end_buffer_seconds && (
                <span className="block mt-1 text-teal-600">
                  <strong>Buffer:</strong> -{win.start_buffer_seconds || 30}s before start, +{win.end_buffer_seconds}s ({Math.round(win.end_buffer_seconds / 60)} min) after end to capture delayed logs/CPU
                </span>
              )}
              {statsData?.run?.test_started_at && (
                <span className="block mt-1 text-teal-600">
                  <strong>Test started:</strong> {formatUtc(statsData.run.test_started_at)}
                  {statsData?.run?.finished_at && (
                    <> · <strong>Finished:</strong> {formatUtc(statsData.run.finished_at)}</>
                  )}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {[
            { id: 'performance', label: 'Performance' },
            { id: 'logs', label: 'Logs' },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === id ? 'border-[#0bacaa] text-[#0bacaa]' : 'border-transparent text-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        {activeTab === 'performance' && (
          (dashboardLoading || statsLoading) ? (
            <div className="py-16 text-center text-gray-400">
              <i className="ti ti-loader-2 animate-spin text-2xl text-teal-400 block mb-2" />Loading performance data…
            </div>
          ) : (dashboardData || statsData) ? (
            <PerformanceTab
              dashboardData={dashboardData}
              statsData={statsData}
              onReloadDashboard={() => loadDashboard(selected)}
              onReloadStats={() => loadStats(selected)}
            />
          ) : (
            <div className="py-16 text-center text-gray-400">No performance data available.</div>
          )
        )}

        {activeTab === 'logs' && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-sm font-medium text-gray-700">Error Logs</span>
              <button type="button" onClick={() => loadErrors(selected, 'api_errors')} className="text-xs text-teal-600 font-medium">
                Reload
              </button>
              <span className="text-xs text-gray-500">
                Showing error logs (HTTP 4xx/5xx) during test run
              </span>
            </div>
            {logsLoading ? (
              <div className="py-12 text-center text-gray-400"><i className="ti ti-loader-2 animate-spin text-teal-400" /></div>
            ) : errorData?.logs?.length === 0 ? (
              <div className="bg-white border rounded-2xl py-12 text-center text-gray-400">
                No error logs found in the run window.
              </div>
            ) : (
              <LogList logs={errorData?.logs || []} total={errorData?.returned} />
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Performance</h1>
          <p className="text-sm text-gray-500 mt-0.5">OpenObserve logs per test run</p>
        </div>
        <div className="relative w-56">
          <i className="ti ti-search absolute left-3 top-2.5 text-gray-400 text-xs" />
          <input
            className="pl-7 text-sm w-full"
            placeholder="Filter by LOB..."
            value={lobSearch}
            onChange={(e) => { setLobSearch(e.target.value); if (!e.target.value) setLobFilter('') }}
          />
          {lobSearch && filteredLobs.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
              <button type="button" onClick={() => { setLobFilter(''); setLobSearch('') }}
                className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 border-b">All LOBs</button>
              {filteredLobs.map((l) => (
                <button key={l.id} type="button" onClick={() => { setLobFilter(l.id); setLobSearch(l.name) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                  <span>{l.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${ENV_STYLE[l.environment] || ''}`}>{l.environment}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {usingHardcoded(config) ? (
        <div className="bg-teal-50 border border-teal-100 text-teal-800 text-xs px-4 py-2 rounded-lg mb-4">
          <i className="ti ti-cloud-check" /> Using hardcoded Pulse curl · {config.base_url} · org {config.org_default}
          <span className="text-teal-600 block mt-0.5">LOB + run start/end time applied per run (same API as your curl).</span>
        </div>
      ) : config?.configured ? (
        <div className="bg-teal-50 border border-teal-100 text-teal-800 text-xs px-4 py-2 rounded-lg mb-4">
          <i className="ti ti-cloud-check" /> Using backend/.env · {config.base_url}
        </div>
      ) : (
        <TestAuthPanel />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-gray-400"><i className="ti ti-loader-2 animate-spin text-2xl text-teal-400 block mb-2" />Loading…</div>
        ) : runs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">No completed runs yet.</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0bacaa] text-white">
                {['Run', 'Date', 'LOB', 'Env', 'Tool', 'VUs', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium border border-[#099e9c]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr key={run.id} className={`hover:bg-teal-50/30 cursor-pointer ${i % 2 ? 'bg-gray-50/50' : 'bg-white'}`}
                  onClick={() => openRun(run)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 border border-gray-200">#{run.id}</td>
                  <td className="px-4 py-3 text-xs border border-gray-200">{formatUtc(run.created_at)}</td>
                  <td className="px-4 py-3 font-semibold border border-gray-200">{run.lob_name}</td>
                  <td className="px-4 py-3 border border-gray-200">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${ENV_STYLE[run.lob_env] || 'bg-gray-50'}`}>{run.lob_env}</span>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase border border-gray-200">{run.tool}</td>
                  <td className="px-4 py-3 text-xs border border-gray-200">{run.virtual_users}</td>
                  <td className="px-4 py-3 border border-gray-200">
                    <span className="text-xs text-teal-600 font-medium">View logs <i className="ti ti-arrow-right" /></span>
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

function LogList({ logs, total }) {
  const [expanded, setExpanded] = useState({})

  function copyText(text) {
    navigator.clipboard?.writeText(text)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 mb-3">
        <strong>{total ?? logs.length}</strong> log entries in this run window
      </p>
      {logs.map((log, i) => {
        const body = log.body || log.message || log.full_message || '—'
        const bodyPreview = body.length > 200 ? body.substring(0, 200) + '...' : body
        const isOpen = expanded[i] ?? false  // Collapsed by default

        return (
          <div key={i} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Collapsed view - shows body preview */}
            <div
              className="px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400">{isOpen ? '▼' : '▶'}</span>
                <span className="text-xs text-gray-500 font-mono">{formatUtc(log.timestamp)}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${severityClass(log.severity)}`}>
                  {log.severity || '—'}
                </span>
                <span className="text-xs font-medium text-gray-800">{log.service || '—'}</span>
                {log.event_type && <span className="text-xs text-blue-600">{log.event_type}</span>}
              </div>
              <p className="text-sm text-gray-700 font-mono break-words leading-relaxed">
                {bodyPreview}
              </p>
            </div>

            {/* Expanded view - shows full details */}
            {isOpen && (
              <div className="px-4 py-3 bg-slate-50 border-t border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-gray-600">Full Details</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); copyText(JSON.stringify(log, null, 2)) }}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    Copy JSON
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  {log.lob && <div><span className="text-gray-500">LOB:</span> <span className="font-medium">{log.lob}</span></div>}
                  {log.service && <div><span className="text-gray-500">Service:</span> <span className="font-medium">{log.service}</span></div>}
                  {log.instance_id && <div><span className="text-gray-500">Instance:</span> <span className="font-mono">{log.instance_id}</span></div>}
                  {log.event_type && <div><span className="text-gray-500">Event Type:</span> <span className="font-medium">{log.event_type}</span></div>}
                  {log.event_status && <div><span className="text-gray-500">Status:</span> <span className="font-medium">{log.event_status}</span></div>}
                  {log.event_duration_ms != null && <div><span className="text-gray-500">Duration:</span> <span className="font-medium">{log.event_duration_ms} ms</span></div>}
                  {log.http_method && <div><span className="text-gray-500">HTTP:</span> <span className="font-mono">{log.http_method} {log.http_route}</span></div>}
                  {log.http_status && <div><span className="text-gray-500">HTTP Status:</span> <span className="font-medium">{log.http_status}</span></div>}
                  {log.user_name && <div><span className="text-gray-500">User:</span> <span className="font-medium">{log.user_name}</span></div>}
                </div>
                <div className="mt-3">
                  <span className="text-xs font-semibold text-gray-600 block mb-1">Body:</span>
                  <pre className="text-xs text-gray-900 font-mono whitespace-pre-wrap break-words leading-relaxed bg-white p-3 rounded border max-h-96 overflow-auto">
                    {body}
                  </pre>
                </div>
                {log.exception_message && (
                  <div className="mt-3">
                    <span className="text-xs font-semibold text-red-600 block mb-1">Exception:</span>
                    <pre className="text-xs text-red-800 font-mono whitespace-pre-wrap break-words leading-relaxed bg-red-50 p-3 rounded border border-red-200 max-h-48 overflow-auto">
                      {log.exception_message}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ===================== DASHBOARD PANELS COMPONENT =====================

function BarChart({ data, title, unit = '', color = 'bg-[#0bacaa]' }) {
  const maxVal = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
      {data.length === 0 ? (
        <div className="text-xs text-gray-400 py-4 text-center">No data available</div>
      ) : (
        <div className="space-y-2">
          {data.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 group cursor-pointer"
              title={`${item.name}: ${item.value}${unit}`}
            >
              <span className="text-xs text-gray-600 w-32 truncate group-hover:text-gray-900" title={item.name}>
                {item.name || '—'}
              </span>
              <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden relative">
                <div
                  className={`h-full ${color} transition-all duration-300 group-hover:opacity-80`}
                  style={{ width: `${(item.value / maxVal) * 100}%` }}
                />
                {/* Tooltip on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs font-semibold text-white drop-shadow-md">
                    {item.value}{unit}
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono text-gray-700 w-16 text-right">{item.value}{unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PercentilesChart({ timeline }) {
  const points = timeline?.points || []
  const summary = timeline?.summary || {}

  if (points.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Percentiles</h3>
        <div className="text-xs text-gray-400 py-4 text-center">No percentile data available</div>
      </div>
    )
  }

  const maxVal = Math.max(...points.map(p => p.max || 0), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">Percentiles (Response Time)</h3>
      <p className="text-xs text-gray-500 mb-3">p50, p90, p95, p99, max in ms</p>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {[
          { label: 'P50 Avg', value: summary.p50_avg, color: 'text-green-600' },
          { label: 'P90 Avg', value: summary.p90_avg, color: 'text-blue-600' },
          { label: 'P95 Avg', value: summary.p95_avg, color: 'text-amber-600' },
          { label: 'P99 Avg', value: summary.p99_avg, color: 'text-orange-600' },
          { label: 'Max', value: summary.max_overall, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
            <div className={`text-lg font-bold ${color}`}>{value ?? '—'}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Timeline chart */}
      <div className="h-32 flex items-end gap-1">
        {points.slice(-30).map((p, i) => {
          const height = (p.max / maxVal) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative" title={`${p.time}\np50: ${p.p50}ms\np90: ${p.p90}ms\np95: ${p.p95}ms\np99: ${p.p99}ms\nmax: ${p.max}ms`}>
              <div className="w-full bg-gray-100 rounded-t flex flex-col justify-end" style={{ height: '100%' }}>
                <div className="w-full bg-red-400 rounded-t" style={{ height: `${(p.max / maxVal) * 100}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{points[0]?.time?.split('T')[1]?.slice(0, 5) || ''}</span>
        <span>{points[points.length - 1]?.time?.split('T')[1]?.slice(0, 5) || ''}</span>
      </div>
    </div>
  )
}

function PercentilesCountChart({ timeline }) {
  const points = timeline?.points || []
  const totalRequests = timeline?.total_requests || 0

  if (points.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Request Distribution</h3>
        <div className="text-xs text-gray-400 py-4 text-center">No data available</div>
      </div>
    )
  }

  const maxVal = Math.max(...points.map(p => p.total_requests || 0), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">Request Distribution</h3>
      <p className="text-xs text-gray-500 mb-3">Total: {totalRequests.toLocaleString()} requests</p>

      {/* Timeline chart */}
      <div className="h-32 flex items-end gap-1">
        {points.slice(-30).map((p, i) => {
          const height = (p.total_requests / maxVal) * 100
          return (
            <div
              key={i}
              className="flex-1 bg-[#0bacaa] rounded-t transition-all duration-200 hover:bg-[#099e9c]"
              style={{ height: `${height}%` }}
              title={`${p.time}\nTotal: ${p.total_requests}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{points[0]?.time?.split('T')[1]?.slice(0, 5) || ''}</span>
        <span>{points[points.length - 1]?.time?.split('T')[1]?.slice(0, 5) || ''}</span>
      </div>
    </div>
  )
}

function PerformanceTab({ dashboardData, statsData, onReloadDashboard, onReloadStats }) {
  const cpu = dashboardData?.cpu || statsData?.cpu || { services: [], summary: {}, timeline: { points: [] } }
  const errors = [...(dashboardData?.partial_errors || []), ...(statsData?.partial_errors || [])]

  // CPU summary values
  const peakCpu = cpu.summary?.max_cpu_percent || 0
  const avgCpu = cpu.summary?.avg_cpu_percent || 0
  const serviceCount = cpu.summary?.service_count || 0

  return (
    <div className="space-y-6">
      {/* Reload button */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { onReloadDashboard(); onReloadStats(); }}
          className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1"
        >
          <i className="ti ti-refresh" /> Reload
        </button>
      </div>

      {/* Errors if any */}
      {errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2 rounded-lg">
          <strong>Partial errors:</strong> {errors.join(', ')}
        </div>
      )}

      {/* CPU Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow" title={`Peak CPU: ${peakCpu.toFixed(2)}%`}>
          <div className="text-2xl font-bold text-violet-600">{peakCpu.toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Peak CPU</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow" title={`Average CPU: ${avgCpu.toFixed(2)}%`}>
          <div className="text-2xl font-bold text-fuchsia-600">{avgCpu.toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Avg CPU</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow" title={`${serviceCount} services monitored`}>
          <div className="text-2xl font-bold text-gray-700">{serviceCount}</div>
          <div className="text-xs text-gray-500">Services</div>
        </div>
      </div>

      {/* CPU Timeline */}
      <CpuTimelineChart timeline={cpu.timeline} />

      {/* CPU by Service Bar Chart */}
      <CpuByServiceChart services={cpu.services || []} />
    </div>
  )
}

function CpuTimelineChart({ timeline }) {
  const points = timeline?.points || []
  const peak = timeline?.peak

  if (points.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">CPU Utilization</h3>
        <div className="text-xs text-gray-400 py-8 text-center">No CPU data available</div>
      </div>
    )
  }

  const maxVal = Math.max(...points.map(p => p.max_cpu || 0), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">CPU Utilization</h3>
          <p className="text-xs text-gray-500">JVM metrics over time</p>
        </div>
        {peak && (
          <div className="text-right">
            <div className="text-xs text-gray-500">Peak</div>
            <div className="text-sm font-bold text-violet-600">{peak.max_cpu?.toFixed(1)}%</div>
            <div className="text-xs text-gray-400">{peak.time?.split('T')[1]?.slice(0, 8) || ''}</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-violet-500" />
          <span className="text-gray-600">Avg CPU</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-fuchsia-600" />
          <span className="text-gray-600">Max CPU</span>
        </div>
      </div>

      {/* Timeline chart */}
      <div className="h-48 flex items-end gap-0.5">
        {points.map((p, i) => {
          const maxHeight = (p.max_cpu / maxVal) * 100
          const avgHeight = (p.avg_cpu / maxVal) * 100
          return (
            <div
              key={i}
              className="flex-1 h-full relative group cursor-pointer"
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                  <div className="font-semibold mb-1">{p.time?.split('T')[1]?.slice(0, 8) || ''}</div>
                  <div className="flex justify-between gap-3">
                    <span className="text-violet-300">Avg:</span>
                    <span className="font-mono">{p.avg_cpu?.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-fuchsia-300">Max:</span>
                    <span className="font-mono">{p.max_cpu?.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
              </div>

              {/* Max CPU bar (background) */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-fuchsia-500 rounded-t transition-all duration-200 group-hover:bg-fuchsia-400"
                style={{ height: `${maxHeight}%` }}
              />
              {/* Avg CPU bar (foreground) */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-violet-600 rounded-t transition-all duration-200 group-hover:bg-violet-500"
                style={{ height: `${avgHeight}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>{points[0]?.time?.split('T')[1]?.slice(0, 5) || ''}</span>
        <span>{points[Math.floor(points.length / 2)]?.time?.split('T')[1]?.slice(0, 5) || ''}</span>
        <span>{points[points.length - 1]?.time?.split('T')[1]?.slice(0, 5) || ''}</span>
      </div>
    </div>
  )
}

function CpuByServiceChart({ services }) {
  if (!services || services.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">CPU by Service</h3>
        <div className="text-xs text-gray-400 py-8 text-center">No service data available</div>
      </div>
    )
  }

  const maxVal = Math.max(...services.map(s => s.cpu_percent || 0), 1)
  const sortedServices = [...services].sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">CPU by Service</h3>
      <div className="space-y-3">
        {sortedServices.map((service, i) => (
          <div
            key={i}
            className="group cursor-pointer"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-700 truncate max-w-[200px] group-hover:text-gray-900" title={service.service_host}>
                {service.service_host || '—'}
              </span>
              <span className="text-xs font-mono font-semibold text-violet-600">{service.cpu_percent?.toFixed(1)}%</span>
            </div>
            <div className="h-6 bg-gray-100 rounded overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded transition-all duration-300 group-hover:from-violet-400 group-hover:to-fuchsia-400"
                style={{ width: `${(service.cpu_percent / maxVal) * 100}%` }}
              />
              {/* Hover tooltip overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs font-bold text-white drop-shadow-md bg-black/30 px-2 py-0.5 rounded">
                  {service.service_host}: {service.cpu_percent?.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
