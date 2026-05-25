import MetricTimelineChart from './MetricTimelineChart'
import { formatUtc } from '../pages/performanceUtils'

const HEALTH = {
  healthy: { label: 'Healthy', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: 'ti-circle-check' },
  warning: { label: 'Warning', cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: 'ti-alert-triangle' },
  degraded: { label: 'Degraded', cls: 'bg-red-50 text-red-800 border-red-200', icon: 'ti-alert-circle' },
}

export default function PerformanceDashboard({ data, onReload }) {
  const k6 = data?.k6 || {}
  const http = data?.http?.summary || {}
  const cpu = data?.cpu?.summary || {}
  const health = HEALTH[data?.health] || HEALTH.warning

  const k6TotalReq = k6.total_requests
  const pulseTotalReq = http.total_requests
  const errPct = k6.error_rate_pct ?? 0
  const httpErrors = data?.errors_timeline?.total_errors ?? 0

  // Check if there's a significant mismatch between k6 and Pulse
  const hasMismatch = k6TotalReq && pulseTotalReq && Math.abs(k6TotalReq - pulseTotalReq) > 5

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${health.cls}`}>
            <i className={`ti ${health.icon}`} />
            {health.label}
          </span>
          <span className="text-xs text-slate-500">Run window only</span>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="text-xs font-medium text-[#0bacaa] hover:text-teal-800 flex items-center gap-1"
        >
          <i className="ti ti-refresh" /> Refresh metrics
        </button>
      </div>

      {data?.partial_errors?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-xl">
          {data.partial_errors.join(' · ')}
        </div>
      )}

      {hasMismatch && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs px-4 py-3 rounded-xl">
          <i className="ti ti-info-circle mr-1" />
          <strong>Note:</strong> k6 recorded {k6TotalReq} requests, Pulse shows {pulseTotalReq} logged.
          <span className="text-blue-600 ml-1">(Not all endpoints may be instrumented in OpenObserve)</span>
        </div>
      )}

      {/* k6 Metrics Section */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">k6</span>
          Load test tool metrics (actual requests made)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Total requests" value={k6TotalReq} icon="ti-arrows-shuffle" source="k6" />
          <KpiCard label="Avg latency" value={k6.avg_ms != null ? `${k6.avg_ms} ms` : null} icon="ti-clock" accent source="k6" />
          <KpiCard label="p90 latency" value={k6.p90_ms != null ? `${k6.p90_ms} ms` : null} icon="ti-chart-line" source="k6" />
          <KpiCard label="p99 latency" value={k6.p99_ms != null ? `${k6.p99_ms} ms` : null} icon="ti-chart-line" source="k6" />
          <KpiCard
            label="Error rate"
            value={errPct != null ? `${Number(errPct).toFixed(2)}%` : null}
            icon="ti-bug"
            warn={errPct > 1}
            source="k6"
          />
        </div>
      </section>

      {/* Pulse/OpenObserve Metrics Section */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded">Pulse</span>
          OpenObserve logged metrics (backend instrumentation)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Logged requests" value={pulseTotalReq} icon="ti-database" source="pulse" />
          <KpiCard label="Avg response" value={http.avg_response_ms ? `${http.avg_response_ms} ms` : null} icon="ti-clock" source="pulse" />
          <KpiCard label="Max response" value={http.max_response_ms ? `${http.max_response_ms} ms` : null} icon="ti-bolt" accent source="pulse" />
          <KpiCard
            label="HTTP errors"
            value={httpErrors}
            icon="ti-alert-triangle"
            warn={httpErrors > 0}
            source="pulse"
          />
          <KpiCard
            label="Max CPU"
            value={cpu.max_cpu_percent != null ? `${cpu.max_cpu_percent}%` : null}
            icon="ti-cpu"
            warn={cpu.max_cpu_percent > 80}
            source="pulse"
          />
        </div>
      </section>

      {/* Primary charts */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Time series (30s buckets)
        </h2>
        <div className="grid lg:grid-cols-2 gap-4">
          <MetricTimelineChart
            timeline={data?.timeline}
            title="Response time"
            subtitle="api_request · avg vs max per bucket"
            unit="ms"
            peakField="max_ms"
            peakLabel="Peak latency"
            series={[
              { key: 'avg_ms', label: 'Avg RT', color: 'bg-[#0bacaa]' },
              { key: 'max_ms', label: 'Max RT', color: 'bg-amber-500' },
            ]}
            emptyMessage="No API request traffic in this run window."
          />
          <MetricTimelineChart
            timeline={data?.cpu?.timeline}
            title="CPU utilization"
            subtitle="JVM · all services (Pulse metrics stream)"
            unit="%"
            peakField="max_cpu"
            peakLabel="Peak CPU"
            series={[
              { key: 'avg_cpu', label: 'Avg CPU', color: 'bg-violet-500' },
              { key: 'max_cpu', label: 'Max CPU', color: 'bg-fuchsia-600' },
            ]}
            emptyMessage="No JVM CPU metrics in this window. Check host prefix (10.10.*) or run timing."
          />
        </div>
      </section>

      {/* Secondary charts */}
      <section className="grid lg:grid-cols-2 gap-4">
        <MetricTimelineChart
          timeline={{
            points: (data?.timeline?.points || []).map((p) => ({
              ...p,
              volume: p.hits,
            })),
            peak: data?.timeline?.points?.length
              ? {
                  ...data.timeline.peak,
                  volume: data.timeline.peak.hits,
                }
              : null,
          }}
          title="Request volume"
          subtitle="Hits per 30s bucket"
          unit=""
          peakField="volume"
          peakLabel="Peak throughput"
          series={[{ key: 'volume', label: 'Requests', color: 'bg-sky-500' }]}
          heightClass="h-36"
          emptyMessage="No request volume data."
        />
        <MetricTimelineChart
          timeline={data?.errors_timeline}
          title="HTTP errors"
          subtitle="4xx / 5xx per bucket"
          unit=""
          peakField="error_count"
          peakLabel="Peak errors"
          series={[{ key: 'error_count', label: 'Errors', color: 'bg-red-500' }]}
          heightClass="h-36"
          emptyMessage="No HTTP errors in this window — good sign."
        />
      </section>

      {/* Comparison + tables */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">k6 vs Pulse comparison</h3>
          <div className="space-y-3 text-sm">
            <CompareRow label="Total requests" k6={k6TotalReq} pulse={pulseTotalReq} unit="" note="Pulse only shows instrumented endpoints" />
            <CompareRow label="Avg latency" k6={k6.avg_ms} pulse={http.avg_response_ms} unit="ms" />
            <CompareRow label="Tail (p99/max)" k6={k6.p99_ms} pulse={http.max_response_ms} unit="ms" note="Pulse uses max in window" />
            <CompareRow label="Errors" k6={k6TotalReq && errPct ? Math.round(k6TotalReq * errPct / 100) : null} pulse={httpErrors} unit="" note="k6 calculated from error rate" />
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">CPU by service (peak in run)</h3>
          {data?.cpu?.services?.length > 0 ? (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {data.cpu.services.slice(0, 8).map((s, i) => (
                <li key={i} className="flex justify-between items-center text-xs gap-2">
                  <span className="font-mono text-slate-700 truncate">{s.service_host}</span>
                  <span className={`font-semibold tabular-nums ${s.cpu_percent > 80 ? 'text-red-600' : 'text-slate-900'}`}>
                    {s.cpu_percent}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No CPU breakdown available.</p>
          )}
        </div>
      </section>

      {/* Endpoint Coverage Comparison */}
      {data?.endpoint_comparison?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Endpoint coverage: k6 vs Pulse
            <span className="ml-2 text-xs font-normal text-slate-500">
              (Why request counts differ)
            </span>
          </h3>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-700 text-white text-xs">
                  {['Endpoint', 'Method', 'k6 Requests', 'k6 Errors', 'Status Codes', 'In Pulse?'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.endpoint_comparison.map((ep, i) => (
                  <tr key={i} className={`${i % 2 ? 'bg-slate-50/60' : 'bg-white'} ${!ep.in_pulse ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-800 max-w-xs truncate" title={ep.endpoint}>
                      {ep.endpoint}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-slate-600">{ep.method || '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums">{ep.k6_requests || '—'}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${ep.k6_errors > 0 ? 'text-red-600 font-medium' : ''}`}>
                      {ep.k6_errors || 0}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {Object.entries(ep.k6_status_codes || {}).map(([code, count]) => (
                        <span key={code} className={`inline-block mr-1 px-1.5 py-0.5 rounded ${
                          parseInt(code) >= 400 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {code}: {count}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-2.5">
                      {ep.in_pulse ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                          ✓ Logged
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                          ✗ Missing
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            <strong>Missing = not logged to OpenObserve</strong>. The target backend doesn't instrument these endpoints with event_type='api_request' and matching LOB.
          </p>
        </section>
      )}

      {data?.http?.paths?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Top API endpoints (Pulse)</h3>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0bacaa] text-white text-xs">
                  {['Endpoint', 'Status', 'Avg', 'Max', 'Hits', 'Result'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.http.paths.slice(0, 15).map((p, i) => (
                  <tr key={i} className={i % 2 ? 'bg-slate-50/60' : 'bg-white'}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-800 max-w-xs truncate" title={p.path}>
                      {p.path}
                    </td>
                    <td className="px-4 py-2.5 text-xs">{p.status_code}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.average_ms} ms</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium">{p.max_ms} ms</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.hits}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.status === 'FAILURE' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-[10px] text-slate-400 text-center pb-2">
        <strong>k6:</strong> Metrics from load test tool (actual requests made) ·
        <strong>Pulse:</strong> OpenObserve logs (only instrumented endpoints with matching LOB)
      </p>
    </div>
  )
}

function KpiCard({ label, value, icon, accent, warn, sub, source }) {
  const sourceColors = {
    k6: 'bg-indigo-100 text-indigo-600',
    pulse: 'bg-teal-100 text-teal-600',
  }
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md ${
        warn ? 'border-red-200 bg-red-50/50' : accent ? 'border-teal-100 bg-teal-50/30' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <i className={`ti ${icon} text-lg ${warn ? 'text-red-400' : 'text-[#0bacaa]/60'}`} />
      </div>
      <p className={`text-xl font-bold mt-2 tabular-nums ${warn ? 'text-red-700' : 'text-slate-900'}`}>{value ?? '—'}</p>
      {source && (
        <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded mt-1 ${sourceColors[source] || 'bg-slate-100 text-slate-500'}`}>
          {source === 'k6' ? 'from k6' : 'from Pulse'}
        </span>
      )}
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

function CompareRow({ label, k6, pulse, unit, note }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
      <span className="text-slate-600">{label}</span>
      <div className="text-right">
        <span className="font-mono font-medium text-slate-900">
          k6: {k6 != null ? `${k6} ${unit}` : '—'}
        </span>
        <span className="text-slate-400 mx-2">|</span>
        <span className="font-mono text-slate-700">
          Pulse: {pulse != null ? `${pulse} ${unit}` : '—'}
        </span>
        {note && <span className="block text-[10px] text-slate-400">{note}</span>}
      </div>
    </div>
  )
}

