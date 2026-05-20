import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/lobs',       icon: 'ti-building',       label: 'Lines of business',  desc: 'Manage LOBs & tokens' },
  { to: '/apis',       icon: 'ti-api',             label: 'API library',        desc: 'Catalog of all APIs' },
  { to: '/mapping',    icon: 'ti-arrows-exchange', label: 'LOB ↔ API mapping',  desc: 'Map APIs to LOBs' },
  { to: '/testconfig', icon: 'ti-player-play',     label: 'Test config',        desc: 'Run load tests' },
  { to: '/reports',    icon: 'ti-chart-bar',       label: 'Reports',            desc: 'View & download reports' },
  { to: '/docs',       icon: 'ti-book',            label: 'Documentation',      desc: 'Portal guide' },
]

export default function Sidebar() {
  return (
    <aside className="w-60 min-h-screen flex flex-col" style={{background:'#0bacaa'}}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
            <i className="ti ti-activity" style={{color:'#0bacaa', fontSize:'18px'}} />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Load & Stress Testing Portal</div>
            <div className="text-white/60 text-xs leading-tight">salescode.ai</div>
          </div>
        </div>
        <div className="text-white/40 text-xs mt-2 italic">Sales Uplift Guaranteed</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon, label, desc }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm font-medium'
                  : 'text-white/80 hover:bg-white/15 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <i className={`ti ${icon} text-base flex-shrink-0 ${isActive ? '' : 'text-white/70'}`}
                   style={isActive ? {color:'#0bacaa'} : {}} />
                <div className="min-w-0">
                  <div className="text-sm leading-tight truncate">{label}</div>
                  <div className={`text-xs leading-tight truncate ${isActive ? 'text-gray-400' : 'text-white/40'}`}>{desc}</div>
                </div>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="text-white/40 text-xs">v1.0.0 · local</div>
        <div className="text-white/30 text-xs mt-0.5">© 2026 salescode.ai</div>
      </div>
    </aside>
  )
}
