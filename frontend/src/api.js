import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

export const lobsApi = {
  list: (env) => api.get('/lobs/', { params: env ? { env } : {} }),
  get: (id) => api.get(`/lobs/${id}`),
  create: (data) => api.post('/lobs/', data),
  update: (id, data) => api.put(`/lobs/${id}`, data),
  delete: (id) => api.delete(`/lobs/${id}`),
  healthcheck: (url) => api.get('/lobs/healthcheck', { params: { url } }),
  generateToken: (id) => api.post(`/lobs/${id}/generate-token`),
}

export const apisApi = {
  list: (method) => api.get('/apis/', { params: method ? { method } : {} }),
  get: (id) => api.get(`/apis/${id}`),
  create: (data) => api.post('/apis/', data),
  update: (id, data) => api.put(`/apis/${id}`, data),
  delete: (id) => api.delete(`/apis/${id}`)
}

export const mappingsApi = {
  get: (lobId) => api.get(`/mappings/${lobId}`),
  save: (lobId, mappings) => api.post(`/mappings/${lobId}`, { mappings }),
}
export const runsApi = {
  previewK6: (config) => api.post('/runs/preview/k6', config),
  downloadK6: (config) => api.post('/runs/download/k6', config, { responseType: 'blob' }),
  downloadJmx: (config) => api.post('/runs/download/jmx', config, { responseType: 'blob' }),
  runK6: (config) => api.post('/runs/run/k6', config),
  runJmeter: (config) => api.post('/runs/run/jmeter', config),
  list: (lobId) => api.get('/runs/', { params: lobId ? { lob_id: lobId } : {} }),
  get: (id) => api.get(`/runs/${id}`),
}

export const reportsApi = {
  list: (lobId) => api.get('/reports/', { params: lobId ? { lob_id: lobId } : {} }),
  get: (id) => api.get(`/reports/${id}`),
  updateNotes: (id, notes) => api.put(`/reports/${id}/notes`, { notes }),
  downloadPdf: (id, audience) => api.get(`/reports/${id}/pdf/${audience}`, { responseType: 'blob' }),
}

export const suitesApi = {
  run: (config) => api.post('/suites/run', config),
  list: (lobId) => api.get('/suites/', { params: lobId ? { lob_id: lobId } : {} }),
  get: (id) => api.get(`/suites/${id}`),
}

const OO_AUTH_KEY = 'oo_test_auth'

export function getOpenObserveTestAuth() {
  try {
    return JSON.parse(sessionStorage.getItem(OO_AUTH_KEY) || '{}')
  } catch {
    return {}
  }
}

export function setOpenObserveTestAuth({ jwt, sctoken, org }) {
  sessionStorage.setItem(OO_AUTH_KEY, JSON.stringify({ jwt: jwt || '', sctoken: sctoken || '', org: org || 'demo' }))
}

export function clearOpenObserveTestAuth() {
  sessionStorage.removeItem(OO_AUTH_KEY)
}

function openObserveHeaders() {
  const a = getOpenObserveTestAuth()
  const h = {}
  if (a.jwt) h['X-OpenObserve-Jwt'] = a.jwt
  if (a.sctoken) h['X-OpenObserve-Sctoken'] = a.sctoken
  return h
}

export const performanceApi = {
  config: () => api.get('/performance/config'),
  listRuns: (lobId) => api.get('/performance/runs', { params: lobId ? { lob_id: lobId } : {} }),
  getRunErrors: (runId, logMode = 'api_errors') =>
    api.get(`/performance/runs/${runId}/errors`, {
      params: { log_mode: logMode },
      headers: openObserveHeaders(),
    }),
  getRunStats: (runId) =>
    api.get(`/performance/runs/${runId}/stats`, { headers: openObserveHeaders() }),
  testSearch: (body) => api.post('/performance/test-search', body),
}

export default api
