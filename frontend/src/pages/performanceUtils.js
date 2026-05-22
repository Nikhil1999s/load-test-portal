export function formatUtc(iso) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  return d.toLocaleString(undefined, { timeZone: 'Asia/Kolkata', hour12: false })
}

export function severityClass(sev) {
  const s = String(sev).toUpperCase()
  if (['ERROR', '17', 'FATAL', '21', 'CRITICAL'].some((x) => s.includes(x))) return 'text-red-700 bg-red-50'
  if (['WARN', '13'].some((x) => s.includes(x))) return 'text-amber-700 bg-amber-50'
  return 'text-gray-600 bg-gray-50'
}
