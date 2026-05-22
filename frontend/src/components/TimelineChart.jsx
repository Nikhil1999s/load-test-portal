import { formatUtc } from '../pages/performanceUtils.js'

/** Simple dual-series bar chart (avg + max ms) — no external chart lib. */
export default function TimelineChart({ timeline, title = 'Response time during run' }) {
  const points = timeline?.points || []
  if (points.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-center text-sm text-gray-500">
        No api_request timeline data in this run window.
      </div>
    )
  }

  const maxVal = Math.max(...points.map((p) => p.max_ms), 1)
  const peak = timeline?.peak

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex flex-wrap justify-between items-start gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">30s buckets · api_request events only</p>
        </div>
        {peak && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 rounded-lg">
            <strong>Peak max:</strong> {peak.max_ms} ms at {formatUtc(peak.time)}
            <span className="text-amber-700 block">Avg in bucket: {peak.avg_ms} ms · {peak.hits} requests</span>
          </div>
        )}
      </div>

      <div className="flex items-end gap-0.5 h-40 border-b border-l border-gray-200 pl-1 pb-1 overflow-x-auto">
        {points.map((p, i) => {
          const avgH = (p.avg_ms / maxVal) * 100
          const maxH = (p.max_ms / maxVal) * 100
          return (
            <div
              key={i}
              className="flex flex-col items-center justify-end flex-1 min-w-[8px] max-w-[24px] group relative"
              title={`${formatUtc(p.time)}\navg: ${p.avg_ms}ms\nmax: ${p.max_ms}ms\nhits: ${p.hits}`}
            >
              <div className="w-full flex items-end justify-center gap-px h-36">
                <div
                  className="w-[40%] bg-teal-400/80 rounded-t-sm"
                  style={{ height: `${avgH}%`, minHeight: p.avg_ms > 0 ? 2 : 0 }}
                />
                <div
                  className="w-[40%] bg-amber-500/90 rounded-t-sm"
                  style={{ height: `${maxH}%`, minHeight: p.max_ms > 0 ? 2 : 0 }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-teal-400/80 rounded-sm" /> Avg RT (ms)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-amber-500/90 rounded-sm" /> Max RT (ms)
        </span>
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-2 font-mono">
        <span>{formatUtc(points[0]?.time)}</span>
        <span>{formatUtc(points[points.length - 1]?.time)}</span>
      </div>
    </div>
  )
}
