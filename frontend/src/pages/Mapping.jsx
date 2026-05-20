import { useState, useEffect } from 'react'
import { lobsApi, mappingsApi } from '../api'

const METHOD_STYLES = {
  GET:    'bg-blue-50 text-blue-700',
  POST:   'bg-green-50 text-green-700',
  PUT:    'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
  PATCH:  'bg-purple-50 text-purple-700',
}

const NEEDS_BODY = ['POST', 'PUT', 'PATCH']

export default function Mapping() {
  const [lobs, setLobs] = useState([])
  const [selectedLob, setSelectedLob] = useState(null)
  const [mappings, setMappings] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [expandedBody, setExpandedBody] = useState({})

  useEffect(() => {
    lobsApi.list().then(r => setLobs(r.data)).catch(() => setError('Failed to load LOBs'))
  }, [])

  const loadMappings = async (lob) => {
    setSelectedLob(lob)
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const res = await mappingsApi.get(lob.id)
      setMappings(res.data.map(m => ({ ...m })))
    } catch {
      setError('Failed to load mappings.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = (apiId) => {
    setMappings(prev => prev.map(m =>
      m.api_id === apiId ? { ...m, enabled: !m.enabled } : m
    ))
    setSaved(false)
  }

  const setWeight = (apiId, val) => {
    const n = Math.min(100, Math.max(1, parseInt(val) || 1))
    setMappings(prev => prev.map(m => m.api_id === apiId ? { ...m, weight: n } : m))
    setSaved(false)
  }

  const setBody = (apiId, val) => {
    setMappings(prev => prev.map(m => m.api_id === apiId ? { ...m, custom_body: val } : m))
    setSaved(false)
  }

  const toggleBodyExpand = (apiId) =>
    setExpandedBody(p => ({ ...p, [apiId]: !p[apiId] }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await mappingsApi.save(selectedLob.id, mappings.map(m => ({
        api_id: m.api_id,
        enabled: m.enabled,
        weight: m.weight,
        custom_body: m.custom_body || null,
      })))
      setSaved(true)
    } catch {
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const enabledCount = mappings.filter(m => m.enabled).length
  const totalWeight = mappings.filter(m => m.enabled).reduce((s, m) => s + m.weight, 0)

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">LOB ↔ API mapping</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select which APIs each LOB uses and configure traffic weights</p>
        </div>
        {selectedLob && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
          >
            <i className={`ti ${saving ? 'ti-loader-2 animate-spin' : saved ? 'ti-check' : 'ti-device-floppy'}`} />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save mapping'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          <i className="ti ti-alert-circle mr-2" />{error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        {/* LOB selector sidebar */}
        <div className="col-span-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Select LOB</p>
          <div className="space-y-1">
            {lobs.length === 0 && (
              <p className="text-xs text-gray-400 italic">No LOBs found. Add one first.</p>
            )}
            {lobs.map(lob => (
              <button
                key={lob.id}
                onClick={() => loadMappings(lob)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  selectedLob?.id === lob.id
                    ? 'bg-indigo-50 text-indigo-700 font-medium border border-indigo-200'
                    : 'text-gray-700 hover:bg-gray-100 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{lob.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    lob.environment === 'prod' ? 'bg-green-50 text-green-700' :
                    lob.environment === 'staging' ? 'bg-amber-50 text-amber-700' :
                    'bg-blue-50 text-blue-700'
                  }`}>{lob.environment}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Mapping table */}
        <div className="col-span-3">
          {!selectedLob ? (
            <div className="bg-white border border-gray-100 rounded-xl py-20 text-center text-sm text-gray-400">
              <i className="ti ti-arrows-exchange text-3xl mb-2 block text-gray-300" />
              Select a LOB from the left to configure its API mapping
            </div>
          ) : loading ? (
            <div className="bg-white border border-gray-100 rounded-xl py-20 text-center text-sm text-gray-400">
              <i className="ti ti-loader-2 animate-spin text-2xl mb-2 block" />Loading...
            </div>
          ) : mappings.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl py-20 text-center text-sm text-gray-400">
              <i className="ti ti-api text-3xl mb-2 block text-gray-300" />
              No APIs in the library yet. Add APIs first.
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="flex items-center gap-4 mb-3 text-sm">
                <span className="text-gray-500">
                  <span className="font-medium text-gray-900">{enabledCount}</span> of {mappings.length} APIs enabled
                </span>
                {enabledCount > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-md ${totalWeight === 100 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    Total weight: {totalWeight}% {totalWeight !== 100 && '(should be 100%)'}
                  </span>
                )}
              </div>

              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-gray-500 font-normal w-12">Use</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-normal">API</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-normal">Method</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-normal">Endpoint</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-normal w-28">Weight %</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-normal w-24">Body</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map(m => (
                      <>
                        <tr
                          key={m.api_id}
                          className={`border-b border-gray-50 transition-colors ${m.enabled ? 'hover:bg-gray-50' : 'opacity-40'}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={m.enabled}
                              onChange={() => toggle(m.api_id)}
                              className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{m.api_name}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-md font-mono font-medium ${METHOD_STYLES[m.api_method] || 'bg-gray-100 text-gray-600'}`}>
                              {m.api_method}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.api_endpoint}</td>
                          <td className="px-4 py-3">
                            {m.enabled ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="1" max="100"
                                  value={m.weight}
                                  onChange={e => setWeight(m.api_id, e.target.value)}
                                  className="w-16 text-xs text-center py-1"
                                />
                                <span className="text-gray-400 text-xs">%</span>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {m.enabled && NEEDS_BODY.includes(m.api_method) ? (
                              <button
                                onClick={() => toggleBodyExpand(m.api_id)}
                                className={`text-xs px-2 py-1 rounded border transition-colors ${
                                  expandedBody[m.api_id]
                                    ? 'border-indigo-200 text-indigo-600 bg-indigo-50'
                                    : 'border-gray-200 text-gray-500 hover:border-indigo-200 hover:text-indigo-600'
                                }`}
                              >
                                {expandedBody[m.api_id] ? 'Hide' : 'Edit body'}
                              </button>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                        {expandedBody[m.api_id] && m.enabled && (
                          <tr key={`${m.api_id}-body`} className="bg-indigo-50/40 border-b border-gray-100">
                            <td colSpan={6} className="px-8 py-3">
                              <div className="flex items-start gap-3">
                                <div className="flex-1">
                                  <p className="text-xs text-gray-500 mb-1.5 font-medium">
                                    Custom request body for <span className="text-indigo-600">{selectedLob.name}</span>
                                    <span className="text-gray-400 font-normal ml-1">(overrides default)</span>
                                  </p>
                                  <textarea
                                    value={m.custom_body ?? m.api_default_body ?? ''}
                                    onChange={e => setBody(m.api_id, e.target.value)}
                                    rows={5}
                                    placeholder={m.api_default_body || '{\n  "key": "value"\n}'}
                                    className="font-mono text-xs resize-y w-full"
                                  />
                                </div>
                                {m.api_default_body && (
                                  <div className="w-56 flex-shrink-0">
                                    <p className="text-xs text-gray-400 mb-1.5">Default body</p>
                                    <pre className="text-xs font-mono bg-white border border-gray-100 rounded-lg p-2 text-gray-400 overflow-x-auto">{m.api_default_body}</pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-400 mt-2">
                Weight determines traffic distribution during load test. Enabled APIs should sum to 100%.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
