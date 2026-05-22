import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import LOBs from './pages/LOBs'
import APIs from './pages/APIs'
import Mapping from './pages/Mapping'
import TestConfig from './pages/TestConfig'
import Reports from './pages/Reports'
import Performance from './pages/Performance'
import Docs from './pages/Docs'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/lobs" replace />} />
              <Route path="/lobs" element={<LOBs />} />
              <Route path="/apis" element={<APIs />} />
              <Route path="/mapping" element={<Mapping />} />
              <Route path="/testconfig" element={<TestConfig />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/docs" element={<Docs />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
