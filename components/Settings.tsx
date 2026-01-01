import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { fetchJson } from '../src/lib/http';
import { Save, Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetchJson<AppSettings>('/api/settings').then(setSettings);
  }, []);

  const save = async () => {
    if (!settings) return;
    await fetchJson('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(settings)
    });
    setMsg('SAVED');
    setTimeout(() => setMsg(''), 2000);
  };

  if (!settings) return <div className="p-10 text-katana font-mono animate-pulse">LOADING SYSTEM...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom-5 duration-500">
      <div className="border-l-4 border-katana pl-4">
        <h2 className="text-3xl font-bold text-white tracking-tight uppercase flex items-center gap-3">
           System Configuration
        </h2>
        <p className="text-steel font-mono text-xs mt-1 tracking-wider">&gt;&gt; GLOBAL PARAMETER ADJUSTMENT</p>
      </div>

      <div className="bg-armor border border-white/10 p-8 relative overflow-hidden">
        <SettingsIcon className="absolute -top-10 -right-10 w-64 h-64 text-white opacity-5 rotate-12" />

        <div className="relative z-10 space-y-10">
            <section>
              <h3 className="text-sm font-bold text-katana uppercase tracking-widest mb-6 border-b border-white/5 pb-2">Core Performance</h3>
              <div className="grid grid-cols-2 gap-8">
                 <div className="space-y-2">
                   <label className="block text-xs font-bold text-steel uppercase tracking-wider font-mono">Concurrency Limit</label>
                   <input 
                      type="number" min="1" max="10"
                      value={settings.concurrency}
                      onChange={e => setSettings({...settings, concurrency: parseInt(e.target.value) || 1})}
                      className="w-full bg-plate border border-white/10 p-3 text-white focus:border-katana focus:outline-none font-mono"
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="block text-xs font-bold text-steel uppercase tracking-wider font-mono">Rate Limit (req/min)</label>
                   <input 
                      type="number" min="1"
                      value={settings.rateLimitPerMinute}
                      onChange={e => setSettings({...settings, rateLimitPerMinute: parseInt(e.target.value) || 10})}
                      className="w-full bg-plate border border-white/10 p-3 text-white focus:border-katana focus:outline-none font-mono"
                   />
                 </div>
              </div>
            </section>

            <section>
               <h3 className="text-sm font-bold text-katana uppercase tracking-widest mb-6 border-b border-white/5 pb-2">Output</h3>
               <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-steel uppercase tracking-wider font-mono">Filename Pattern</label>
                    <input 
                        type="text"
                        value={settings.filenamePattern}
                        onChange={e => setSettings({...settings, filenamePattern: e.target.value})}
                        className="w-full bg-plate border border-white/10 p-3 text-white focus:border-katana focus:outline-none font-mono text-sm"
                    />
                    <p className="text-[10px] text-steel font-mono">Variables: &#123;title&#125;</p>
                  </div>
               </div>
            </section>

            <div className="pt-6 flex items-center justify-end gap-4 border-t border-white/5">
               {msg && <span className="text-green-500 font-mono text-xs uppercase tracking-widest animate-pulse">{msg}</span>}
               <button onClick={save} className="bg-katana hover:bg-red-600 text-black px-8 py-3 font-bold uppercase tracking-widest flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(220,38,38,0.5)]">
                 <Save className="w-5 h-5" /> Commit Changes
               </button>
            </div>
        </div>
      </div>
    </div>
  );
}