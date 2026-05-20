import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import LOBs from './pages/LOBs'
import APIs from './pages/APIs'
import Mapping from './pages/Mapping'
import TestConfig from './pages/TestConfig'
import Reports from './pages/Reports'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto min-h-screen">
          <Routes>
            <Route path="/" element={<Navigate to="/lobs" replace />} />
            <Route path="/lobs" element={<LOBs />} />
            <Route path="/apis" element={<APIs />} />
            <Route path="/mapping" element={<Mapping />} />
            <Route path="/testconfig" element={<TestConfig />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
