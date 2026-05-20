import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/lobs',      icon: 'ti-building',      label: 'Lines of business' },
  { to: '/apis',      icon: 'ti-api',            label: 'API library' },
  { to: '/mapping',   icon: 'ti-arrows-exchange', label: 'LOB ↔ API mapping' },
  { to: '/testconfig',icon: 'ti-player-play',    label: 'Test config' },
  { to: '/reports',   icon: 'ti-chart-bar',      label: 'Reports' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-100 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <i className="ti ti-activity text-white text-sm" />
          </div>
          <span className="font-semibold text-sm text-gray-900">LoadTest Portal</span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <i className={`ti ${icon} text-base`} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">v1.0.0 — local</p>
      </div>
    </aside>
  )
}
