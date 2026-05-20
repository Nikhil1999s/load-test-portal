import { useState, useEffect } from 'react'
import { lobsApi } from '../api'

const ENV_URLS = {
  uat:  'https://uat.salescode.ai',
  demo: 'https://demo.salescode.ai',
  prod: 'https://prod.salescode.ai',
}

const ENV_STYLES = {
  uat:  'bg-amber-50 text-amber-700',
  demo: 'bg-blue-50 text-blue-700',
  prod: 'bg-green-50 text-green-700',
}

const EMPTY_FORM = {
  env: 'demo',
  lobSelection: '',
  customLobName: '',
  useCustomLob: false,
  useCustomUrl: false,
  customUrl: '',
  login_id: '',
  login_password: '',
  auth_type: 'custom',
  auth_header_name: 'authorization',
  auth_header_value: '',
  active: true,
}

export default function LOBs() {
  const [lobs, setLobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [envFilter, setEnvFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showToken, setShowToken] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [healthCheck, setHealthCheck] = useState(null)
  const [lobNames, setLobNames] = useState([])
  const [lobNamesLoading, setLobNamesLoading] = useState(false)

  const [generatingToken, setGeneratingToken] = useState(false)
  const [tokenStatus, setTokenStatus] = useState(null)

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const fetchLobs = async () => {
    try {
      setLoading(true)
      const res = await lobsApi.list(envFilter || undefined)
      setLobs(res.data)
      setError(null)
    } catch {
      setError('Failed to load LOBs. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLobs() }, [envFilter])

  const fetchLobNames = async (env) => {
    const url = ENV_URLS[env]
    setLobNamesLoading(true)
    setLobNames([])
    setHealthCheck(null)
    try {
      const res = await lobsApi.healthcheck(url)
      if (res.data.lob_names && res.data.lob_names.length > 0) {
        setLobNames(res.data.lob_names.sort())
      }
      setHealthCheck(res.data)
    } catch (e) {
      setHealthCheck({ reachable: false, message: 'Failed to reach environment' })
    } finally {
      setLobNamesLoading(false)
    }
  }

  const handleEnvChange = (env) => {
    setForm(f => ({ ...f, env, lobSelection: '', useCustomLob: false, customLobName: '', useCustomUrl: false, customUrl: '' }))
    setHealthCheck(null)
    fetchLobNames(env)
  }

  const getLobName = () => form.useCustomLob ? form.customLobName.trim() : form.lobSelection
  const getBaseUrl = () => form.useCustomUrl ? form.customUrl.trim() : ENV_URLS[form.env]

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setFormError('')
    setEditId(null)
    setHealthCheck(null)
    setLobNames([])
    setModal('add')
    fetchLobNames(EMPTY_FORM.env)
  }

  const openEdit = (lob) => {
    const knownUrl = Object.values(ENV_URLS).includes(lob.base_url)
    setForm({
      env: lob.environment,
      lobSelection: lob.name,
      customLobName: '',
      useCustomLob: false,
      useCustomUrl: !knownUrl,
      customUrl: !knownUrl ? lob.base_url : '',
      login_id: lob.login_id || '',
      login_password: '',
      auth_type: lob.auth_type,
      auth_header_name: lob.auth_header_name,
      auth_header_value: lob.auth_header_value,
      active: lob.active,
    })
    setFormError('')
    setEditId(lob.id)
    setHealthCheck(null)
    setTokenStatus(null)
    setModal('edit')
    fetchLobNames(lob.environment)
  }

  const closeModal = () => { setModal(null); setEditId(null) }

  const handleSave = async () => {
    const name = getLobName()
    const base_url = getBaseUrl()
    if (!name) { setFormError('LOB name is required.'); return }
    if (!base_url) { setFormError('Base URL is required.'); return }
    // Auth header value is optional if credentials are provided (token will be generated)
    if (!form.auth_header_value.trim() && !form.login_id.trim()) {
      setFormError('Either credentials (login ID + password) or a token is required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name, base_url, environment: form.env,
        auth_type: form.auth_type,
        auth_header_name: form.auth_header_name.trim(),
        auth_header_value: form.auth_header_value.trim(),
        login_id: form.login_id.trim() || null,
        login_password: form.login_password.trim() || null,
        active: form.active,
      }
      if (modal === 'edit') await lobsApi.update(editId, payload)
      else await lobsApi.create(payload)
      closeModal()
      fetchLobs()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return
    try { await lobsApi.delete(id); fetchLobs() }
    catch { alert('Delete failed.') }
  }

  const filtered = lobs.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.base_url.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 max-w-6xl">
      {/* Overview banner */}
      <div className="rounded-2xl p-5 mb-6 text-white" style={{background:'linear-gradient(135deg, #0bacaa 0%, #005F6B 100%)'}}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <img src="/logo.png" alt="salescode.ai" className="h-5 brightness-0 invert" onError={e=>e.target.style.display='none'} />
            </div>
            <h2 className="text-lg font-bold mb-1">Load & Stress Testing Portal</h2>
            <p className="text-white/80 text-sm max-w-xl">
              Automated API load testing for all Lines of Business. Add your LOBs, map APIs, configure tests and generate professional reports — without writing a single line of test script.
            </p>
          </div>
          <a href="/docs" className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
            <i className="ti ti-book text-sm" /> View documentation
          </a>
        </div>
        <div className="grid grid-cols-5 gap-3 mt-4">
          {[
            { icon: 'ti-building', label: 'Lines of business', desc: 'Add & manage LOBs' },
            { icon: 'ti-api', label: 'API library', desc: 'Master API catalog' },
            { icon: 'ti-arrows-exchange', label: 'LOB ↔ API mapping', desc: 'Configure per-LOB APIs' },
            { icon: 'ti-player-play', label: 'Test config', desc: 'Run load tests' },
            { icon: 'ti-chart-bar', label: 'Reports', desc: 'PDF with charts' },
          ].map((s, i) => (
            <div key={i} className="bg-white/10 rounded-xl p-3 text-center">
              <i className={`ti ${s.icon} text-xl block mb-1`} />
              <div className="text-xs font-medium">{s.label}</div>
              <div className="text-white/60 text-xs">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Lines of business</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage LOB credentials, tokens, and environments</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700">
          <i className="ti ti-plus" /> Add new line of business (LOB)
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <i className="ti ti-search absolute left-3 top-2.5 text-gray-400 text-sm" />
          <input className="pl-8" placeholder="Search LOBs..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={envFilter} onChange={e => setEnvFilter(e.target.value)} className="w-36">
          <option value="">All environments</option>
          <option value="uat">UAT</option>
          <option value="demo">Demo</option>
          <option value="prod">Prod</option>
        </select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4"><i className="ti ti-alert-circle mr-2" />{error}</div>}

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400"><i className="ti ti-loader-2 animate-spin text-2xl mb-2 block" />Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            <i className="ti ti-building text-3xl mb-2 block text-gray-300" />
            {search ? 'No LOBs match your search.' : 'No LOBs yet. Add your first one.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-gray-500 font-normal">LOB name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Base URL</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Environment</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Token status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-normal">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(lob => (
                <tr key={lob.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{lob.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{lob.base_url}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${ENV_STYLES[lob.environment] || 'bg-gray-50 text-gray-600'}`}>{lob.environment}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{lob.auth_header_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {lob.auth_header_value ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                            <i className="ti ti-circle-check" /> Token ready
                          </span>
                          {lob.login_id && (
                            <button onClick={async (e) => {
                              e.stopPropagation()
                              const btn = e.currentTarget
                              btn.disabled = true
                              btn.innerHTML = '<i class="ti ti-loader-2 animate-spin text-xs"></i>'
                              try { await lobsApi.generateToken(lob.id); fetchLobs() }
                              catch (err) { alert(err.response?.data?.detail || 'Token refresh failed') }
                              finally { btn.disabled = false }
                            }} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 border border-gray-200 hover:border-teal-300 px-2 py-1 rounded-lg transition-colors" title="Regenerate token">
                              <i className="ti ti-refresh text-xs" /> Refresh
                            </button>
                          )}
                        </div>
                      ) : lob.login_id ? (
                        <button onClick={async (e) => {
                          e.stopPropagation()
                          try { await lobsApi.generateToken(lob.id); fetchLobs() }
                          catch (err) { alert(err.response?.data?.detail || 'Token generation failed') }
                        }} className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors">
                          <i className="ti ti-bolt" /> Generate token
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 border border-gray-200 px-2.5 py-1 rounded-full">
                          <i className="ti ti-alert-triangle" /> No credentials
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1.5 text-xs ${lob.active ? 'text-green-700' : 'text-gray-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${lob.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                      {lob.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => openEdit(lob)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200"><i className="ti ti-edit text-sm" /></button>
                      <button onClick={() => handleDelete(lob.id, lob.name)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200"><i className="ti ti-trash text-sm" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg p-6 shadow-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">{modal === 'edit' ? 'Edit LOB' : 'Add new LOB'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><i className="ti ti-x text-lg" /></button>
            </div>

            {formError && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4">{formError}</div>}

            <div className="space-y-4">

              {/* Step 1: Environment */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Step 1 — Select environment</label>
                <div className="grid grid-cols-3 gap-2">
                  {['uat','demo','prod'].map(env => (
                    <button key={env} type="button" onClick={() => handleEnvChange(env)}
                      className={`py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        form.env === env
                          ? env==='uat'  ? 'border-amber-400 bg-amber-50 text-amber-700'
                          : env==='demo' ? 'border-blue-400 bg-blue-50 text-blue-700'
                          :                'border-green-400 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {env.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: LOB name */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Step 2 — Select or add LOB</label>
                {healthCheck && (
                  <p className={`text-xs mb-1.5 flex items-center gap-1 ${healthCheck.reachable ? 'text-green-600' : 'text-red-500'}`}>
                    <i className={`ti ${healthCheck.reachable ? 'ti-circle-check' : 'ti-circle-x'}`} />
                    {healthCheck.message}
                    {healthCheck.reachable && lobNames.length > 0 && <span className="text-gray-400">· {lobNames.length} LOBs loaded</span>}
                  </p>
                )}
                {!form.useCustomLob ? (
                  <div className="flex gap-2">
                    <select
                      value={form.lobSelection}
                      onChange={e => setF('lobSelection', e.target.value)}
                      className="flex-1 text-sm"
                      disabled={lobNamesLoading}
                    >
                      <option value="">
                        {lobNamesLoading ? 'Loading LOBs...' : lobNames.length === 0 ? 'No LOBs loaded...' : `Select a LOB (${lobNames.length} available)...`}
                      </option>
                      {lobNames.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button type="button" onClick={() => setF('useCustomLob', true)}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                      + New LOB
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input value={form.customLobName} onChange={e => setF('customLobName', e.target.value)} placeholder="Enter LOB name..." className="flex-1 text-sm" />
                    <button type="button" onClick={() => { setF('useCustomLob', false); setF('customLobName', '') }}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">
                      Pick from list
                    </button>
                  </div>
                )}
              </div>

              {/* Step 3: Base URL */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Step 3 — Base URL</label>
                {!form.useCustomUrl ? (
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-600">
                      {ENV_URLS[form.env]}
                    </div>
                    <button type="button" onClick={() => setF('useCustomUrl', true)}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                      Custom URL
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input value={form.customUrl} onChange={e => setF('customUrl', e.target.value)}
                      placeholder="https://your-custom-url.com" className="flex-1 text-sm font-mono" />
                    <button type="button" onClick={() => { setF('useCustomUrl', false); setF('customUrl', '') }}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 whitespace-nowrap">
                      Use default
                    </button>
                  </div>
                )}
              </div>

              {/* Step 4: Credentials & Token */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Step 4 — Credentials & token</label>

                {/* Credentials */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Login ID / Username</label>
                    <input value={form.login_id} onChange={e => setF('login_id', e.target.value)}
                      placeholder="e.g. 100709" className="text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Password</label>
                    <input type="password" value={form.login_password} onChange={e => setF('login_password', e.target.value)}
                      placeholder="Enter password" className="text-sm" />
                  </div>
                </div>

                {/* Generate token button */}
                {modal === 'edit' && editId && (
                  <button type="button" disabled={generatingToken || !form.login_id || !form.login_password}
                    onClick={async () => {
                      // Save credentials first, then generate token
                      setSaving(true)
                      try {
                        await lobsApi.update(editId, {
                          login_id: form.login_id.trim(),
                          login_password: form.login_password.trim(),
                        })
                      } catch {}
                      setSaving(false)
                      setGeneratingToken(true)
                      setTokenStatus(null)
                      try {
                        await lobsApi.generateToken(editId)
                        setTokenStatus({ success: true, message: 'Token generated and saved successfully!' })
                        fetchLobs()
                      } catch (e) {
                        setTokenStatus({ success: false, message: e.response?.data?.detail || 'Token generation failed' })
                      } finally { setGeneratingToken(false) }
                    }}
                    className="flex items-center gap-2 text-sm px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 mb-2">
                    <i className={`ti ${generatingToken ? 'ti-loader-2 animate-spin' : 'ti-refresh'}`} />
                    {generatingToken ? 'Generating token...' : 'Generate token automatically'}
                  </button>
                )}

                {modal === 'add' && (
                  <p className="text-xs text-teal-600 mb-2">
                    <i className="ti ti-info-circle mr-1" />
                    Save the LOB first, then click "Generate token" to auto-fetch the token.
                  </p>
                )}

                {tokenStatus && (
                  <div className={`text-xs px-3 py-2 rounded-lg mb-2 flex items-center gap-2 ${tokenStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <i className={`ti ${tokenStatus.success ? 'ti-circle-check' : 'ti-circle-x'}`} />
                    {tokenStatus.message}
                  </div>
                )}

                {/* Manual token override */}
                <details className="mt-1">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                    Or paste token manually (advanced)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Header name</label>
                        <input value={form.auth_header_name} onChange={e => setF('auth_header_name', e.target.value)}
                          placeholder="authorization" className="text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Auth type</label>
                        <select value={form.auth_type} onChange={e => setF('auth_type', e.target.value)} className="text-sm">
                          <option value="custom">Custom key:value</option>
                          <option value="bearer">Bearer token</option>
                          <option value="basic">Basic auth (user:pass)</option>
                          <option value="api_key_header">API key (header)</option>
                          <option value="api_key_query">API key (query param)</option>
                        </select>
                      </div>
                    </div>
                    <textarea value={form.auth_header_value}
                      onChange={e => {
                        const val = e.target.value
                        setF('auth_header_value', val)
                        if (val.includes(':') && !val.startsWith('eyJ')) setF('auth_type', 'custom')
                        else if (val.startsWith('eyJ') && !val.includes(':')) setF('auth_type', 'bearer')
                      }}
                      placeholder="YXV0aA==:eyJraWQi..." rows={3}
                      className="font-mono text-xs resize-none w-full" />
                    {form.auth_header_value && (
                      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 font-mono break-all">
                        {form.auth_header_name||'authorization'}: {form.auth_header_value.slice(0,40)}...
                      </div>
                    )}
                  </div>
                </details>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setF('active', e.target.checked)} className="w-auto" />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
              <button onClick={closeModal} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save LOB'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
