import { useState, useEffect } from 'react'
import { lobsApi, mappingsApi } from '../api'

const METHOD_STYLES = {
  GET:    'bg-blue-50 text-blue-700 border-blue-200',
  POST:   'bg-green-50 text-green-700 border-green-200',
  PUT:    'bg-amber-50 text-amber-700 border-amber-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
  PATCH:  'bg-purple-50 text-purple-700 border-purple-200',
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
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [lobSearch, setLobSearch] = useState('')

  useEffect(() => {
    lobsApi.list().then(r => setLobs(r.data)).catch(() => setError('Failed to load LOBs'))
  }, [])

  const loadMappings = async (lob) => {
    setSelectedLob(lob); setLoading(true); setError(null); setSaved(false)
    try {
      const res = await mappingsApi.get(lob.id)
      setMappings(res.data.map(m => ({ ...m })))
    } catch { setError('Failed to load mappings.') }
    finally { setLoading(false) }
  }

  const toggle = (apiId) => { setMappings(prev => prev.map(m => m.api_id === apiId ? { ...m, enabled: !m.enabled } : m)); setSaved(false) }
  const setBody = (apiId, val) => { setMappings(prev => prev.map(m => m.api_id === apiId ? { ...m, custom_body: val } : m)); setSaved(false) }
  const toggleBodyExpand = (apiId) => setExpandedBody(p => ({ ...p, [apiId]: !p[apiId] }))

  const beautifyJson = (apiId) => {
    const m = mappings.find(m => m.api_id === apiId)
    if (!m?.custom_body) return
    try { setBody(apiId, JSON.stringify(JSON.parse(m.custom_body), null, 2)) } catch {}
  }

  const confirmSave = async () => {
    setShowSaveConfirm(false); setSaving(true); setError(null)
    try {
      await mappingsApi.save(selectedLob.id, mappings.map(m => ({
        api_id: m.api_id, enabled: m.enabled, weight: m.weight, custom_body: m.custom_body || null,
      })))
      setSaved(true)
    } catch { setError('Save failed.') }
    finally { setSaving(false) }
  }

  const enabledCount = mappings.filter(m => m.enabled).length
  const filteredLobs = lobs.filter(l => !lobSearch || l.name.toLowerCase().includes(lobSearch.toLowerCase()))

  const ENV_COLORS = {
    prod:    'bg-green-100 text-green-800 border border-green-200',
    uat:     'bg-amber-100 text-amber-800 border border-amber-200',
    demo:    'bg-blue-100 text-blue-800 border border-blue-200',
    staging: 'bg-purple-100 text-purple-800 border border-purple-200',
  }

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <i className="ti ti-arrows-exchange" style={{color:'#0bacaa'}} />
            LOB ↔ API Mapping
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Select which APIs each LOB uses during load testing</p>
        </div>
        {selectedLob && (
          <button onClick={() => setShowSaveConfirm(true)} disabled={saving}
            className={`flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl font-medium transition-all ${
              saved ? 'bg-green-600 text-white' : 'text-white hover:opacity-90'
            }`} style={saved ? {} : {background:'#0bacaa'}}>
            <i className={`ti ${saving ? 'ti-loader-2 animate-spin' : saved ? 'ti-circle-check' : 'ti-device-floppy'}`} />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save mapping'}
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4"><i className="ti ti-alert-circle mr-2" />{error}</div>}

      <div className="grid grid-cols-4 gap-6">

        {/* LOB Sidebar */}
        <div className="col-span-1">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Sidebar header */}
            <div className="px-4 py-3 border-b border-gray-100" style={{background:'#F0FAFA'}}>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{color:'#0bacaa'}}>Select LOB</p>
              <div className="relative">
                <i className="ti ti-search absolute left-2.5 top-2 text-gray-400 text-xs" />
                <input value={lobSearch} onChange={e => setLobSearch(e.target.value)}
                  placeholder="Search..." className="pl-7 text-xs w-full py-1.5 border border-gray-200 rounded-lg" />
              </div>
            </div>
            {/* LOB list */}
            <div className="overflow-y-auto" style={{maxHeight:'calc(100vh - 280px)'}}>
              {filteredLobs.length === 0 && (
                <p className="text-xs text-gray-400 italic p-4">No LOBs found.</p>
              )}
              {filteredLobs.map(lob => (
                <button key={lob.id} onClick={() => loadMappings(lob)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-all ${
                    selectedLob?.id === lob.id
                      ? 'border-l-4 bg-teal-50'
                      : 'border-l-4 border-l-transparent hover:bg-gray-50'
                  }`}
                  style={selectedLob?.id === lob.id ? {borderLeftColor:'#0bacaa'} : {}}>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${selectedLob?.id === lob.id ? 'text-teal-700' : 'text-gray-800'}`}>
                      {lob.name}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${ENV_COLORS[lob.environment]||'bg-gray-100 text-gray-600'}`}>
                      {lob.environment}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {/* Footer count */}
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400">{lobs.length} LOBs total</p>
            </div>
          </div>
        </div>

        {/* Mapping Panel */}
        <div className="col-span-3">
          {!selectedLob ? (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl py-24 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4 border border-gray-200">
                <i className="ti ti-arrows-exchange text-3xl text-gray-300" />
              </div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">No LOB selected</h3>
              <p className="text-xs text-gray-400">Select a LOB from the left to configure its API mapping</p>
            </div>
          ) : loading ? (
            <div className="bg-white border border-gray-100 rounded-2xl py-24 text-center">
              <i className="ti ti-loader-2 animate-spin text-3xl mb-3 block" style={{color:'#0bacaa'}} />
              <p className="text-sm text-gray-400">Loading mappings...</p>
            </div>
          ) : mappings.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl py-24 text-center">
              <i className="ti ti-api text-4xl mb-3 block text-gray-300" />
              <p className="text-sm text-gray-500">No APIs in the library yet.</p>
              <p className="text-xs text-gray-400 mt-1">Add APIs in the API Library first.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Panel header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between" style={{background:'#F0FAFA'}}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                    style={{background:'#0bacaa'}}>{selectedLob.name[0].toUpperCase()}</div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">{selectedLob.name}</h2>
                    <p className="text-xs text-gray-500">{selectedLob.environment?.toUpperCase()} · {selectedLob.base_url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-3 py-1 rounded-full border"
                    style={{background:'#E0F7FA', color:'#0bacaa', borderColor:'#B2EBF2'}}>
                    {enabledCount} of {mappings.length} enabled
                  </span>
                </div>
              </div>

              {/* Filter buttons */}
              <div className="px-5 py-3 border-b border-gray-100 flex gap-2 bg-gray-50">
                <span className="text-xs text-gray-500 self-center mr-1">Quick select:</span>
                {[
                  ['Select all',   () => setMappings(p => p.map(m => ({...m, enabled: true}))),  'border-teal-200 text-teal-700 hover:bg-teal-50'],
                  ['Deselect all', () => setMappings(p => p.map(m => ({...m, enabled: false}))), 'border-gray-200 text-gray-500 hover:bg-gray-100'],
                  ['GET only',     () => setMappings(p => p.map(m => ({...m, enabled: m.api_method==='GET'}))), 'border-blue-200 text-blue-600 hover:bg-blue-50'],
                  ['POST only',    () => setMappings(p => p.map(m => ({...m, enabled: ['POST','PUT','PATCH'].includes(m.api_method)}))), 'border-green-200 text-green-600 hover:bg-green-50'],
                ].map(([label, fn, cls]) => (
                  <button key={label} onClick={() => { fn(); setSaved(false) }}
                    className={`text-xs px-3 py-1.5 border rounded-lg font-medium transition-colors ${cls}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{background:'#0bacaa'}} className="text-white text-xs">
                      <th className="py-3 px-4 text-center font-semibold w-12 border border-teal-500">USE</th>
                      <th className="py-3 px-4 text-left font-semibold border border-teal-500">API NAME</th>
                      <th className="py-3 px-4 text-center font-semibold w-20 border border-teal-500">METHOD</th>
                      <th className="py-3 px-4 text-left font-semibold border border-teal-500">ENDPOINT</th>
                      <th className="py-3 px-4 text-center font-semibold w-24 border border-teal-500">BODY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m, i) => (
                      <>
                        <tr key={m.api_id}
                          className={`transition-colors border-b border-gray-200 ${
                            m.enabled ? i%2===0 ? 'bg-white' : 'bg-gray-50/50' : 'bg-gray-100 opacity-60'
                          }`}>
                          {/* Checkbox */}
                          <td className="py-3 px-4 text-center border border-gray-200">
                            <button onClick={() => toggle(m.api_id)}
                              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center mx-auto transition-all ${
                                m.enabled ? 'border-teal-500 text-white' : 'border-gray-300 bg-white'
                              }`} style={m.enabled ? {background:'#0bacaa'} : {}}>
                              {m.enabled && <i className="ti ti-check text-xs" />}
                            </button>
                          </td>
                          {/* Name */}
                          <td className="py-3 px-4 font-medium text-gray-900 border border-gray-200">{m.api_name}</td>
                          {/* Method */}
                          <td className="py-3 px-4 text-center border border-gray-200">
                            <span className={`text-xs font-bold px-2 py-1 rounded border ${METHOD_STYLES[m.api_method]||'bg-gray-100 text-gray-600'}`}>
                              {m.api_method}
                            </span>
                          </td>
                          {/* Endpoint */}
                          <td className="py-3 px-4 font-mono text-xs text-gray-600 max-w-xs border border-gray-200">
                            <div className="truncate" title={m.api_endpoint}>{m.api_endpoint}</div>
                          </td>
                          {/* Body toggle */}
                          <td className="py-3 px-4 text-center border border-gray-200">
                            {m.enabled && NEEDS_BODY.includes(m.api_method) ? (
                              <button onClick={() => toggleBodyExpand(m.api_id)}
                                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                                  expandedBody[m.api_id]
                                    ? 'text-white border-teal-600'
                                    : 'text-teal-600 border-teal-200 hover:bg-teal-50'
                                }`} style={expandedBody[m.api_id] ? {background:'#0bacaa'} : {}}>
                                {expandedBody[m.api_id] ? 'Hide' : 'Edit'}
                              </button>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        </tr>

                        {/* Body editor row */}
                        {expandedBody[m.api_id] && m.enabled && (
                          <tr key={`${m.api_id}-body`} className="bg-teal-50/30 border-b border-teal-100">
                            <td colSpan={5} className="px-6 py-4 border border-teal-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-teal-700">
                                  <i className="ti ti-code mr-1" />Request body — {m.api_name}
                                </span>
                                <button onClick={() => beautifyJson(m.api_id)}
                                  className="text-xs text-teal-600 border border-teal-200 rounded-lg px-2.5 py-1 hover:bg-teal-50">
                                  <i className="ti ti-wand mr-1" />Beautify JSON
                                </button>
                              </div>
                              <textarea
                                value={m.custom_body || ''}
                                onChange={e => setBody(m.api_id, e.target.value)}
                                rows={5}
                                placeholder='{"outletCode": "1020625", "loginId": "100709"}'
                                className="w-full font-mono text-xs border border-teal-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 resize-y bg-white"
                                style={{'--tw-ring-color':'#0bacaa'}}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  <i className="ti ti-info-circle mr-1" />
                  Changes are not saved until you click Save mapping
                </p>
                <button onClick={() => setShowSaveConfirm(true)} disabled={saving}
                  className="flex items-center gap-2 text-sm px-5 py-2 rounded-xl font-medium text-white disabled:opacity-60"
                  style={{background:'#0bacaa'}}>
                  <i className={`ti ${saving ? 'ti-loader-2 animate-spin' : saved ? 'ti-circle-check' : 'ti-device-floppy'}`} />
                  {saving ? 'Saving...' : saved ? 'Saved!' : 'Save mapping'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save confirmation popup */}
      {showSaveConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-xl max-w-sm mx-4 text-center border border-gray-100">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{background:'#E0F7FA'}}>
              <i className="ti ti-device-floppy text-2xl" style={{color:'#0bacaa'}} />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Save mapping?</h2>
            <p className="text-sm text-gray-500 mb-6">
              This will update the API mapping for <strong>{selectedLob?.name}</strong>.
              Enabled APIs will be used in all future load tests.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowSaveConfirm(false)}
                className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={confirmSave}
                className="px-5 py-2.5 text-sm text-white rounded-xl font-medium"
                style={{background:'#0bacaa'}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
