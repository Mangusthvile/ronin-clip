import React, { useState, useEffect } from 'react';
import { ProtocolTemplate, DiagnosticResult } from '../types';
import { fetchJson } from '../src/lib/http';
import { Plus, Trash, Save, LayoutTemplate, ScanLine, Play, AlertTriangle } from 'lucide-react';

export default function Protocols() {
  const [protocols, setProtocols] = useState<ProtocolTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<ProtocolTemplate>>({});
  const [testUrl, setTestUrl] = useState('');
  const [diag, setDiag] = useState<DiagnosticResult | null>(null);

  useEffect(() => {
    loadProtocols();
  }, []);

  const loadProtocols = () => fetchJson<ProtocolTemplate[]>('/api/templates').then(setProtocols);

  const save = async () => {
      if (!editing.domain || !editing.titleSelector || !editing.contentSelector) return;
      await fetchJson('/api/templates', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(editing)
      });
      setEditing({});
      loadProtocols();
  };

  const remove = async (id: string) => {
      await fetchJson(`/api/templates/${id}`, { method: 'DELETE' });
      loadProtocols();
      if (editing.id === id) setEditing({});
  };

  const runDiagnostics = async () => {
      if (!testUrl || !editing.titleSelector || !editing.contentSelector) return;
      setDiag(null);
      try {
          const res = await fetchJson<DiagnosticResult>('/api/protocol/diagnostics', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                  url: testUrl,
                  domain: editing.domain,
                  titleSelector: editing.titleSelector,
                  contentSelector: editing.contentSelector,
                  removeSelectors: editing.removeSelectors
              })
          });
          setDiag(res);
      } catch (e: any) {
          setDiag({ error: e.message } as DiagnosticResult);
      }
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
           <h2 className="text-3xl font-bold text-white tracking-tight uppercase flex items-center gap-3">
              <ScanLine className="text-katana" /> Protocols
           </h2>
           <p className="text-steel font-mono text-xs mt-1 tracking-wider">&gt;&gt; DOMAIN SPECIFIC SELECTOR CONFIGURATION</p>
        </div>
        <button onClick={() => setEditing({ id: '', domain: '', titleSelector: '', contentSelector: '', removeSelectors: [] })} className="bg-white/10 hover:bg-katana hover:text-black text-white px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all">
           <Plus className="w-4 h-4" /> Initialize New
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
        <div className="bg-armor border border-white/10 flex flex-col">
           <div className="p-3 bg-white/5 border-b border-white/5 font-mono text-xs font-bold text-steel uppercase tracking-wider">Stored Domains</div>
           <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
             {protocols.map(p => (
               <div key={p.id} onClick={() => setEditing(p)} className={`p-4 border border-white/5 bg-void hover:border-katana/50 cursor-pointer group ${editing.id === p.id ? 'border-katana bg-white/5' : ''}`}>
                 <div className="flex justify-between items-start">
                    <div>
                        <div className="font-bold text-white font-mono">{p.domain}</div>
                        <div className="text-[10px] text-steel mt-1 font-mono">{p.contentSelector}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); remove(p.id); }} className="text-steel hover:text-katana p-1 opacity-0 group-hover:opacity-100"><Trash className="w-3 h-3"/></button>
                 </div>
               </div>
             ))}
           </div>
        </div>

        <div className="lg:col-span-2 bg-armor border border-white/10 p-8 overflow-y-auto custom-scrollbar relative">
          {editing.domain !== undefined ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                 <h3 className="text-lg font-bold text-white uppercase tracking-widest">Configuration</h3>
                 <span className="text-xs font-mono text-katana animate-pulse">EDIT MODE</span>
              </div>
              
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-steel uppercase tracking-wider font-mono">Domain (Hostname)</label>
                  <input 
                    type="text" 
                    value={editing.domain || ''} 
                    onChange={e => setEditing({...editing, domain: e.target.value})}
                    className="w-full bg-plate border border-white/10 p-3 text-white focus:border-katana focus:outline-none font-mono text-sm"
                    placeholder="example.com"
                  />
                </div>

                <div className="p-6 bg-black/40 border border-white/5 space-y-4">
                  <h4 className="text-xs font-bold text-katana uppercase tracking-wider">Diagnostics</h4>
                  <div className="flex gap-2">
                     <input 
                       type="text" 
                       placeholder="Test URL" 
                       value={testUrl}
                       onChange={e => setTestUrl(e.target.value)}
                       className="flex-1 bg-void border border-white/10 p-2 text-white text-xs font-mono focus:border-katana focus:outline-none"
                     />
                     <button onClick={runDiagnostics} className="bg-white/5 border border-white/10 text-white hover:bg-white/10 px-4 py-2 text-xs font-mono uppercase flex items-center gap-2">
                        <Play className="w-3 h-3" /> Test
                     </button>
                  </div>
                  {diag && (
                      <div className="text-xs font-mono bg-black p-4 border-l-2 border-katana space-y-2">
                          {diag.error ? <div className="text-red-500">ERR: {diag.error}</div> : (
                              <>
                                <div className="grid grid-cols-2 gap-4 border-b border-white/10 pb-2 mb-2">
                                    <div>HOST: <span className="text-white">{diag.host}</span></div>
                                    <div>TITLE MATCH: <span className={diag.titleMatches ? "text-green-500" : "text-red-500"}>{diag.titleMatches}</span></div>
                                    <div>CONTENT MATCH: <span className={diag.contentMatches ? "text-green-500" : "text-red-500"}>{diag.contentMatches}</span></div>
                                    <div>PARAGRAPHS: <span className="text-white">{diag.paragraphCount}</span></div>
                                </div>
                                <div>
                                    <div className="text-steel mb-1">TITLE PREVIEW &gt;</div>
                                    <div className="text-white mb-2">{diag.titlePreview || "NONE"}</div>
                                    <div className="text-steel mb-1">BODY PREVIEW &gt;</div>
                                    <div className="text-white opacity-70 whitespace-pre-wrap line-clamp-4">{diag.contentPreview || "NONE"}</div>
                                </div>
                              </>
                          )}
                      </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-steel uppercase tracking-wider font-mono">Title Selector</label>
                    <input 
                      type="text" 
                      value={editing.titleSelector || ''} 
                      onChange={e => setEditing({...editing, titleSelector: e.target.value})}
                      placeholder="h1"
                      className="w-full bg-plate border border-white/10 p-3 text-katana focus:border-katana focus:outline-none font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-steel uppercase tracking-wider font-mono">Content Selector (Root)</label>
                    <input 
                      type="text" 
                      value={editing.contentSelector || ''} 
                      onChange={e => setEditing({...editing, contentSelector: e.target.value})}
                      placeholder="#content"
                      className="w-full bg-plate border border-white/10 p-3 text-katana focus:border-katana focus:outline-none font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                   <label className="block text-xs font-bold text-steel uppercase tracking-wider font-mono">Removal Selectors (CSV)</label>
                   <input 
                      type="text" 
                      value={editing.removeSelectors?.join(', ') || ''} 
                      onChange={e => setEditing({...editing, removeSelectors: e.target.value.split(',').map(s => s.trim())})}
                      placeholder=".ad, .share"
                      className="w-full bg-plate border border-white/10 p-3 text-red-400 focus:border-katana focus:outline-none font-mono text-sm"
                    />
                </div>
                
                <div className="pt-6 border-t border-white/10 flex justify-end">
                   <button onClick={save} className="px-6 py-2 bg-katana text-black hover:bg-red-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-[0_0_10px_rgba(220,38,38,0.4)]">
                     <Save className="w-4 h-4" /> Save Protocol
                   </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-steel opacity-30">
               <LayoutTemplate className="w-24 h-24 mb-4 stroke-1" />
               <p className="font-mono text-sm uppercase tracking-widest">Select Protocol</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}