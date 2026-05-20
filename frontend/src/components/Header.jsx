export default function Header() {
  return (
    <header className="h-12 bg-white border-b border-gray-100 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="salescode.ai" className="h-6" onError={e => e.target.style.display='none'} />
        <div className="w-px h-4 bg-gray-200" />
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{background:'#0bacaa'}}>
            <i className="ti ti-activity text-white" style={{fontSize:'11px'}} />
          </div>
          <span className="text-sm font-medium text-gray-700">Load & Stress Testing Portal</span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        System online
      </div>
    </header>
  )
}
