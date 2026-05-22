import { useState, useEffect } from 'react'
import {
  lobsApi,
  performanceApi,
  getOpenObserveTestAuth,
  setOpenObserveTestAuth,
  clearOpenObserveTestAuth,
} from '../api'
import PerformanceDashboard from '../components/PerformanceDashboard'
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
  const [logMode, setLogMode] = useState('api_errors')
  const [statsData, setStatsData] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

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
    setError('')
    setActiveTab('stats')
    if (!canFetchLogs(config)) {
      setError('Save browser credentials below, then open this run again')
      return
    }
    await Promise.all([loadStats(run), loadErrors(run, logMode)])
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
              <strong>Run window only (IST):</strong> {formatUtc(win.start)} → {formatUtc(win.end)}
              {win.strict && ' · exact start/end, no buffer'}
            </p>
          )}
        </div>

        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {[
            { id: 'stats', label: 'Performance monitoring' },
            { id: 'errors', label: 'Logs' },
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

        {activeTab === 'stats' && (
          statsLoading ? (
            <div className="py-16 text-center text-gray-400">
              <i className="ti ti-loader-2 animate-spin text-2xl text-teal-400 block mb-2" />Loading metrics…
            </div>
          ) : statsData ? (
            <PerformanceDashboard data={statsData} onReload={() => loadStats(selected)} />
          ) : null
        )}

        {activeTab === 'errors' && (
          <>
            <div className="mb-6 grid lg:grid-cols-2 gap-4">
              <MetricTimelineChart
                timeline={errorData?.timeline || statsData?.timeline}
                title="Response time"
                subtitle="Run window"
                unit="ms"
                peakField="max_ms"
                peakLabel="Peak"
                series={[
                  { key: 'avg_ms', label: 'Avg', color: 'bg-[#0bacaa]' },
                  { key: 'max_ms', label: 'Max', color: 'bg-amber-500' },
                ]}
                heightClass="h-32"
              />
              <MetricTimelineChart
                timeline={errorData?.cpu?.timeline || statsData?.cpu?.timeline}
                title="CPU"
                subtitle="Run window"
                unit="%"
                peakField="max_cpu"
                peakLabel="Peak CPU"
                series={[
                  { key: 'avg_cpu', label: 'Avg', color: 'bg-violet-500' },
                  { key: 'max_cpu', label: 'Max', color: 'bg-fuchsia-600' },
                ]}
                heightClass="h-32"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                value={logMode}
                onChange={(e) => { setLogMode(e.target.value); loadErrors(selected, e.target.value) }}
              >
                <option value="api_errors">HTTP errors (4xx/5xx)</option>
                <option value="generic">App errors (severity / message)</option>
                <option value="all">All logs in run window</option>
              </select>
              <button type="button" onClick={() => loadErrors(selected)} className="text-xs text-teal-600 font-medium">
                Reload
              </button>
              <span className="text-xs text-gray-500">
                Showing logs only between run start and end · full message below each entry
              </span>
            </div>
            {logsLoading ? (
              <div className="py-12 text-center text-gray-400"><i className="ti ti-loader-2 animate-spin text-teal-400" /></div>
            ) : errorData?.logs?.length === 0 ? (
              <div className="bg-white border rounded-2xl py-12 text-center text-gray-400">
                No logs for this filter in the run window.
              </div>
            ) : (
              <LogList logs={errorData.logs} total={errorData.returned} />
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
                  <td className="px-4 py-3 text-xs border border-gray-200">{new Date(run.created_at).toLocaleDateString()}</td>
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
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        <strong>{total ?? logs.length}</strong> log entries in this run window
      </p>
      {logs.map((log, i) => {
        const http = [log.http_method, log.http_route].filter(Boolean).join(' ')
        const status = log.http_status || log.event_status
        const full = log.full_message || log.message || '—'
        const isOpen = expanded[i] ?? true

        return (
          <div key={i} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <button
              type="button"
              className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-2 hover:bg-gray-50 border-b border-gray-100"
              onClick={() => setExpanded((e) => ({ ...e, [i]: !(e[i] ?? true) }))}
            >
              <span className="text-xs text-gray-500 font-mono">{formatUtc(log.timestamp)}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${severityClass(log.severity)}`}>
                {log.severity || '—'}
              </span>
              <span className="text-xs font-medium text-gray-800">{log.service || '—'}</span>
              {http && <span className="text-xs font-mono text-teal-700">{http}</span>}
              {status && <span className="text-xs text-gray-600">status: {status}</span>}
              {log.event_duration_ms != null && (
                <span className="text-xs text-gray-500">{log.event_duration_ms} ms</span>
              )}
              <span className="text-xs text-gray-400 ml-auto">{isOpen ? '▼' : '▶'} full log</span>
            </button>
            {isOpen && (
              <div className="p-4 bg-slate-50">
                <div className="flex justify-end mb-2">
                  <button
                    type="button"
                    onClick={() => copyText(full)}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    Copy full message
                  </button>
                </div>
                <pre className="text-xs text-gray-900 font-mono whitespace-pre-wrap break-words leading-relaxed max-h-none overflow-visible">
                  {full}
                </pre>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
