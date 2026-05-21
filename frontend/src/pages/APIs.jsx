import { useState, useEffect } from 'react'
import { apisApi } from '../api'

const METHOD_STYLES = {
  GET:    'bg-blue-50 text-blue-700',
  POST:   'bg-green-50 text-green-700',
  PUT:    'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
  PATCH:  'bg-purple-50 text-purple-700',
}

const NEEDS_BODY = ['POST', 'PUT', 'PATCH']

const EMPTY_FORM = {
  name: '', method: 'GET', endpoint: '', description: '', default_body: '', base_url_override: '', active: true
}

const SAMPLE_APIS = [
  { name: 'Create order',  method: 'POST',   endpoint: '/v1/orders',      description: 'Creates a new order',    default_body: '{\n  "customerId": "",\n  "items": []\n}' },
  { name: 'Get order',     method: 'GET',    endpoint: '/v1/orders/{id}', description: 'Fetch order by ID',      default_body: '' },
  { name: 'List orders',   method: 'GET',    endpoint: '/v1/orders',      description: 'List all orders',        default_body: '' },
  { name: 'Update order',  method: 'PUT',    endpoint: '/v1/orders/{id}', description: 'Update an order',        default_body: '{\n  "status": ""\n}' },
  { name: 'Cancel order',  method: 'DELETE', endpoint: '/v1/orders/{id}', description: 'Cancel an order',        default_body: '' },
]

export default function APIs() {
  const [apis, setApis] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importTab, setImportTab] = useState('curl')
  const [importParsed, setImportParsed] = useState(null)

  const parseCurl = (curlText) => {
    try {
      // Clean up the curl command - remove line continuations
      const cleaned = curlText.replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim()

      // Extract URL - handle single quotes, double quotes, or no quotes
      const urlPatterns = [
        /curl\s+--location\s+'([^']+)'/i,
        /curl\s+--location\s+"([^"]+)"/i,
        /curl\s+'([^']+)'/i,
        /curl\s+"([^"]+)"/i,
        /curl\s+(https?:\/\/\S+)/i,
      ]
      let fullUrl = null
      for (const pattern of urlPatterns) {
        const m = cleaned.match(pattern)
        if (m) { fullUrl = m[1]; break }
      }
      if (!fullUrl) return null

      // Parse URL safely
      let url
      try { url = new URL(fullUrl) }
      catch { 
        // Try encoding special chars
        try { url = new URL(fullUrl.replace(/'/g, '%27').replace(/\[/g, '%5B').replace(/\]/g, '%5D')) }
        catch { return null }
      }

      const baseUrl = url.origin
      const endpoint = url.pathname + url.search

      // Extract method
      let method = 'GET'
      const methodMatch = cleaned.match(/-X\s+([A-Z]+)/i) || cleaned.match(/--request\s+([A-Z]+)/i)
      if (methodMatch) method = methodMatch[1].toUpperCase()
      if (cleaned.includes('--data') || cleaned.match(/\s-d\s/)) method = method === 'GET' ? 'POST' : method

      // Extract body
      let body = ''
      const bodyPatterns = [
        /--data-raw\s+'([^']+)'/,
        /--data-raw\s+"([^"]+)"/,
        /--data\s+'([^']+)'/,
        /--data\s+"([^"]+)"/,
        /-d\s+'([^']+)'/,
        /-d\s+"([^"]+)"/,
      ]
      for (const pattern of bodyPatterns) {
        const m = cleaned.match(pattern)
        if (m) { body = m[1]; break }
      }

      // Generate name from last path segment
      const parts = url.pathname.split('/').filter(Boolean)
      const lastPart = parts[parts.length - 1] || 'API'
      const name = lastPart.charAt(0).toUpperCase() + lastPart.slice(1)

      const knownBases = ['https://demo.salescode.ai','https://uat.salescode.ai','https://prod.salescode.ai']

      return {
        name,
        method,
        endpoint,
        description: '',
        default_body: body,
        base_url_override: knownBases.includes(baseUrl) ? '' : baseUrl,
      }
    } catch { return null }
  }
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [expanded, setExpanded] = useState({})
  const [seeding, setSeeding] = useState(false)

  const fetchApis = async () => {
    try {
      setLoading(true)
      const res = await apisApi.list(methodFilter || undefined)
      setApis(res.data)
      setError(null)
    } catch {
      setError('Failed to load APIs. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchApis() }, [methodFilter])

  const filtered = apis.filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.endpoint.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setEditId(null); setModal('add') }
  const openEdit = (a) => {
    setForm({ name: a.name, method: a.method, endpoint: a.endpoint, description: a.description || '', default_body: a.default_body || '', base_url_override: a.base_url_override || '', active: a.active })
    setFormError(''); setEditId(a.id); setModal('edit')
  }
  const closeModal = () => { setModal(null); setEditId(null) }

  const handleSave = async () => {
    if (!form.name.trim() || !form.endpoint.trim()) {
      setFormError('Name and endpoint path are required.')
      return
    }
    if (NEEDS_BODY.includes(form.method) && form.default_body.trim()) {
      try { JSON.parse(form.default_body) } catch {
        setFormError('Default body must be valid JSON.')
        return
      }
    }
    setSaving(true)
    try {
      const payload = { ...form, default_body: form.default_body.trim() || null, base_url_override: form.base_url_override.trim() || null }
      if (modal === 'edit') await apisApi.update(editId, payload)
      else await apisApi.create(payload)
      closeModal()
      fetchApis()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return
    try { await apisApi.delete(id); fetchApis() }
    catch { alert('Delete failed.') }
  }

  const seedApis = async () => {
    setSeeding(true)
    for (const a of SAMPLE_APIS) {
      try { await apisApi.create({ ...a, active: true }) } catch {}
    }
    setSeeding(false)
    fetchApis()
  }

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const formatJson = (str) => {
    try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">API library</h1>
          <p className="text-sm text-gray-500 mt-0.5">Master catalog of all available APIs</p>
        </div>
        <div className="flex gap-2">
          {apis.length === 0 && !loading && (
            <button onClick={seedApis} disabled={seeding} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
              <i className="ti ti-download" /> {seeding ? 'Adding...' : 'Add sample APIs'}
            </button>
          )}
          <button onClick={openAdd} className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700">
            <i className="ti ti-plus" /> Add API
          </button>
          <button onClick={() => setModal('import')} className="flex items-center gap-1.5 border border-indigo-200 text-indigo-600 text-sm px-4 py-2 rounded-lg hover:bg-indigo-50">
            <i className="ti ti-file-import" /> Import JSON
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <i className="ti ti-search absolute left-3 top-2.5 text-gray-400 text-sm" />
          <input className="pl-8" placeholder="Search by name or endpoint..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="w-36">
          <option value="">All methods</option>
          {['GET','POST','PUT','DELETE','PATCH'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          <i className="ti ti-alert-circle mr-2" />{error}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">
            <i className="ti ti-loader-2 animate-spin text-2xl mb-2 block" />Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            <i className="ti ti-api text-3xl mb-2 block text-gray-300" />
            {search ? 'No APIs match your search.' : 'No APIs yet. Add one or click "Add sample APIs".'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-gray-500 font-normal w-8"></th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Method</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Endpoint</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Base URL</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Description</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Body</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <>
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {a.default_body && (
                        <button onClick={() => toggleExpand(a.id)} className="text-gray-400 hover:text-gray-600">
                          <i className={`ti ${expanded[a.id] ? 'ti-chevron-down' : 'ti-chevron-right'} text-xs`} />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{a.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-mono font-medium ${METHOD_STYLES[a.method] || 'bg-gray-100 text-gray-600'}`}>
                        {a.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 max-w-xs">
                      <div className="truncate" title={a.endpoint}>{a.endpoint}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {a.base_url_override
                        ? <span className="font-mono text-indigo-500 text-xs" title={a.base_url_override}>Custom URL</span>
                        : <span className="text-gray-300">LOB default</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{a.description || '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {a.default_body
                        ? <button className="text-indigo-500 hover:text-indigo-700" onClick={() => toggleExpand(a.id)}>View body</button>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs ${a.active ? 'text-green-700' : 'text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${a.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {a.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200" aria-label="Edit">
                          <i className="ti ti-edit text-sm" />
                        </button>
                        <button onClick={() => handleDelete(a.id, a.name)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200" aria-label="Delete">
                          <i className="ti ti-trash text-sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded[a.id] && a.default_body && (
                    <tr key={`${a.id}-body`} className="bg-gray-50 border-b border-gray-100">
                      <td colSpan={8} className="px-8 py-3">
                        <p className="text-xs text-gray-500 mb-1.5 font-medium">Default request body</p>
                        <pre className="text-xs font-mono bg-white border border-gray-100 rounded-lg p-3 text-gray-700 overflow-x-auto">{formatJson(a.default_body)}</pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg p-6 shadow-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">{modal === 'edit' ? 'Edit API' : 'Add new API'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <i className="ti ti-x text-lg" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4">{formError}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">API name <span className="text-red-400">*</span></label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Create order" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Method</label>
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                    {['GET','POST','PUT','DELETE','PATCH'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Endpoint path <span className="text-red-400">*</span></label>
                  <input value={form.endpoint} onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))} placeholder="/v1/orders" className="font-mono text-xs" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this API do?" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Base URL override <span className="text-gray-300 font-normal">(optional — leave blank to use LOB's base URL)</span>
                </label>
                <input
                  value={form.base_url_override}
                  onChange={e => setForm(f => ({ ...f, base_url_override: e.target.value }))}
                  placeholder="e.g. https://rewardsdemo.sellina.io"
                  className="font-mono text-xs"
                />
                {form.base_url_override && (
                  <p className="text-xs text-indigo-500 mt-1">
                    <i className="ti ti-info-circle mr-1" />
                    This API will use <span className="font-mono">{form.base_url_override}</span> instead of the LOB base URL
                  </p>
                )}
              </div>
              {NEEDS_BODY.includes(form.method) && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Default request body <span className="text-gray-400 font-normal">(JSON)</span>
                  </label>
                  <textarea
                    value={form.default_body}
                    onChange={e => setForm(f => ({ ...f, default_body: e.target.value }))}
                    placeholder={'{\n  "key": "value"\n}'}
                    rows={6}
                    className="font-mono text-xs resize-y"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-auto" />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
              <button onClick={closeModal} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save API'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal — supports curl and JSON */}
      {modal === 'import' && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Import APIs</h2>
              <button onClick={() => { setModal(null); setImportText(''); setImportError('') }} className="text-gray-400 hover:text-gray-600"><i className="ti ti-x" /></button>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 px-6 pt-4">
              {[
                { id: 'curl', icon: 'ti-terminal', label: 'From cURL' },
                { id: 'json', icon: 'ti-braces', label: 'From JSON' },
              ].map(t => (
                <button key={t.id} onClick={() => { setImportTab(t.id); setImportText(''); setImportError(''); setImportParsed(null) }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    importTab === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  <i className={`ti ${t.icon}`} /> {t.label}
                </button>
              ))}
            </div>

            <div className="px-6 py-4 space-y-3">
              {importTab === 'curl' ? (
                <>
                  <div className="bg-gray-900 rounded-xl p-3 text-xs text-green-400 font-mono">
                    <p className="text-gray-500 mb-1"># Paste any curl command — portal parses it automatically</p>
                    <p>curl 'https://demo.salescode.ai/v1/outletStatus/hierarchy?size=1000' \</p>
                    <p>{'  '}-H 'authorization: Bearer ...' \</p>
                    <p>{'  '}-H 'lob: cokesademo'</p>
                  </div>
                  {importError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{importError}</div>}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 font-medium">Paste curl command</label>
                    <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportError(''); setImportParsed(null) }}
                      rows={6} placeholder="curl 'https://...' -H 'Content-Type: application/json' --data-raw '{...}'"
                      className="font-mono text-xs resize-none w-full" />
                  </div>
                  {/* Preview parsed result */}
                  {importParsed && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs space-y-1">
                      <p className="font-semibold text-green-700 mb-2">✓ Parsed successfully — review before saving:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-gray-500">Name:</span> <input value={importParsed.name} onChange={e => setImportParsed(p => ({...p, name: e.target.value}))} className="text-xs ml-1 border-b border-gray-300 bg-transparent w-40" /></div>
                        <div><span className="text-gray-500">Method:</span> <span className="font-bold text-indigo-600 ml-1">{importParsed.method}</span></div>
                        <div className="col-span-2"><span className="text-gray-500">Endpoint:</span> <span className="font-mono ml-1 text-gray-800">{importParsed.endpoint}</span></div>
                        {importParsed.base_url_override && <div className="col-span-2"><span className="text-gray-500">Base URL:</span> <span className="font-mono ml-1 text-gray-800">{importParsed.base_url_override}</span></div>}
                        {importParsed.default_body && <div className="col-span-2"><span className="text-gray-500">Body:</span> <span className="font-mono ml-1 text-gray-600 break-all">{importParsed.default_body.slice(0,80)}{importParsed.default_body.length>80?'...':''}</span></div>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-700">
                    <p className="font-semibold mb-1">JSON array format:</p>
                    <pre className="font-mono leading-relaxed">{`[{"name":"Outlet Status","method":"GET","endpoint":"/v1/outletStatus","description":"","default_body":""}]`}</pre>
                  </div>
                  {importError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{importError}</div>}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 font-medium">Paste JSON array</label>
                    <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportError('') }}
                      rows={8} placeholder='[{"name": "...", "method": "GET", "endpoint": "/v1/..."}]'
                      className="font-mono text-xs resize-none w-full" />
                  </div>
                </>
              )}
              <p className="text-xs text-gray-400">APIs with the same name will be skipped.</p>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setModal(null); setImportText(''); setImportError(''); setImportParsed(null) }}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>

              {importTab === 'curl' ? (
                <>
                  {!importParsed ? (
                    <button onClick={() => {
                      setImportError('')
                      const parsed = parseCurl(importText.trim())
                      if (!parsed) { setImportError('Could not parse curl — make sure it has a valid URL'); return }
                      setImportParsed(parsed)
                    }} className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50" disabled={!importText.trim()}>
                      <i className="ti ti-search" /> Parse curl
                    </button>
                  ) : (
                    <button onClick={async () => {
                      setImporting(true)
                      try {
                        await apisApi.create({ ...importParsed, active: true })
                        fetchApis(); setModal(null); setImportText(''); setImportParsed(null)
                        alert('API added successfully!')
                      } catch (e) { setImportError(e.response?.data?.detail || 'Failed to add API') }
                      finally { setImporting(false) }
                    }} disabled={importing} className="flex items-center gap-1.5 bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
                      <i className={`ti ${importing ? 'ti-loader-2 animate-spin' : 'ti-check'}`} />
                      {importing ? 'Saving...' : 'Save API'}
                    </button>
                  )}
                </>
              ) : (
                <button disabled={importing || !importText.trim()} onClick={async () => {
                  setImportError('')
                  let parsed
                  try { parsed = JSON.parse(importText.trim()) }
                  catch { setImportError('Invalid JSON'); return }
                  if (!Array.isArray(parsed)) { setImportError('Must be a JSON array [ ... ]'); return }
                  setImporting(true)
                  let added = 0, skipped = 0
                  for (const api of parsed) {
                    if (!api.name || !api.method || !api.endpoint) { skipped++; continue }
                    try {
                      await apisApi.create({ name: api.name, method: api.method.toUpperCase(), endpoint: api.endpoint, description: api.description || '', default_body: api.default_body || '', base_url_override: api.base_url_override || '', active: true })
                      added++
                    } catch { skipped++ }
                  }
                  setImporting(false); fetchApis(); setModal(null); setImportText('')
                  alert(`Import complete — ${added} added, ${skipped} skipped.`)
                }} className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  <i className={`ti ${importing ? 'ti-loader-2 animate-spin' : 'ti-file-import'}`} />
                  {importing ? 'Importing...' : 'Import APIs'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
