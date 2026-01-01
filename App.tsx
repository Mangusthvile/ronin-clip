import React from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Scissors, Layers, Settings as SettingsIcon, LayoutTemplate, FileText, Sword, Activity } from 'lucide-react';
import SingleExtract from './components/SingleExtract';
import BatchExtract from './components/BatchExtract';
import Protocols from './components/Protocols';
import Settings from './components/Settings';

const NavItem = ({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <NavLink
      to={to}
      className={`group relative flex items-center gap-4 px-6 py-4 text-sm font-medium transition-all duration-300 ${
        isActive
          ? 'text-katana bg-white/5'
          : 'text-steel hover:text-white hover:bg-white/5'
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-katana transition-all duration-300 ${isActive ? 'opacity-100 shadow-[0_0_10px_#DC2626]' : 'opacity-0'}`} />
      <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-[0_0_5px_rgba(220,38,38,0.8)]' : 'group-hover:text-white'}`} />
      <span className="tracking-wide uppercase text-xs font-bold">{label}</span>
    </NavLink>
  );
};

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-screen bg-void font-sans text-mist">
        <aside className="w-72 bg-void border-r border-white/10 flex flex-col shrink-0 z-10">
          <div className="p-8 flex items-center gap-4 border-b border-white/10">
            <div className="relative">
              <div className="absolute inset-0 bg-katana blur-md opacity-50"></div>
              <div className="relative bg-black border border-katana p-2 rotate-45">
                <Sword className="w-5 h-5 text-katana -rotate-45" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-widest uppercase font-mono">
                Ronin<span className="text-katana">Clip</span>
              </h1>
              <p className="text-[10px] text-steel uppercase tracking-[0.2em]">Extraction Tool</p>
            </div>
          </div>
          
          <nav className="flex-1 py-8 space-y-2">
            <NavItem to="/" icon={FileText} label="Extraction" />
            <NavItem to="/batch" icon={Layers} label="Batch Queue" />
            <NavItem to="/protocols" icon={LayoutTemplate} label="Protocols" />
            <NavItem to="/settings" icon={SettingsIcon} label="System" />
          </nav>

          <div className="p-6 border-t border-white/10">
            <div className="bg-armor border border-white/5 p-4 rounded-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-steel uppercase tracking-wider">System</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-katana opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-katana"></span>
                </span>
              </div>
              <p className="text-xs font-mono text-white">CORE: <span className="text-katana">ONLINE</span></p>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-auto bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
          <div className="max-w-7xl mx-auto p-10 h-full flex flex-col">
            <Routes>
              <Route path="/" element={<SingleExtract />} />
              <Route path="/batch" element={<BatchExtract />} />
              <Route path="/protocols" element={<Protocols />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </main>
      </div>
    </HashRouter>
  );
}