import { formatUtc } from '../pages/performanceUtils.js'

/**
 * Configurable time-series bar chart (no chart library).
 * series: [{ key, label, color, formatValue? }]
 * peak: { key, label } — which field to highlight in peak badge
 */
export default function MetricTimelineChart({
  timeline,
  title,
  subtitle,
  series = [],
  peakField,
  peakLabel,
  unit = '',
  emptyMessage = 'No data in this run window.',
  heightClass = 'h-44',
}) {
  const points = timeline?.points || []
  if (points.length === 0) {
    return (
      <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-8 text-center">
        <i className="ti ti-chart-line text-3xl text-slate-300 mb-2 block" />
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      </div>
    )
  }

  const allVals = points.flatMap((p) => series.map((s) => Number(p[s.key]) || 0))
  const maxVal = Math.max(...allVals, 0.001)
  const peak = timeline?.peak
  const peakKey = peakField || series[1]?.key || series[0]?.key

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm h-full flex flex-col">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {peak && peak[peakKey] != null && (
          <div className="text-xs bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 text-amber-950 px-3 py-2 rounded-xl shadow-sm">
            <span className="font-semibold">{peakLabel || 'Peak'}:</span>{' '}
            {formatValue(peak[peakKey], unit)}
            <span className="text-amber-800/80 block mt-0.5 font-normal">{formatUtc(peak.time)}</span>
          </div>
        )}
      </div>

      <div
        className={`flex items-end gap-px ${heightClass} border-b border-l border-slate-200 pl-1 pb-1 overflow-x-auto flex-1 min-h-[120px]`}
      >
        {points.map((p, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-end flex-1 min-w-[6px] max-w-[20px]"
            title={series.map((s) => `${s.label}: ${formatValue(p[s.key], unit)}`).join('\n')}
          >
            <div className={`w-full flex items-end justify-center gap-px ${heightClass === 'h-44' ? 'h-40' : 'h-32'}`}>
              {series.map((s) => {
                const v = Number(p[s.key]) || 0
                const h = (v / maxVal) * 100
                return (
                  <div
                    key={s.key}
                    className={`flex-1 ${s.color} rounded-t-sm opacity-90 hover:opacity-100 transition-opacity`}
                    style={{ height: `${h}%`, minHeight: v > 0 ? 3 : 0 }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${s.color}`} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-mono">
        <span>{formatUtc(points[0]?.time)}</span>
        <span>{formatUtc(points[points.length - 1]?.time)}</span>
      </div>
    </div>
  )
}

function formatValue(v, unit) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return unit === '%' ? `${n.toFixed(1)}%` : unit === 'ms' ? `${n} ms` : `${n}${unit ? ` ${unit}` : ''}`
}
