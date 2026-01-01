import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Pause, Download, Loader2, CheckCircle, XCircle, List, TerminalSquare } from 'lucide-react';
import { BatchStatus } from '../types';
import { fetchJson, API_BASE } from '../src/lib/http';

export default function BatchExtract() {
  const [urls, setUrls] = useState('');
  const [status, setStatus] = useState<BatchStatus>({ queue: [], isProcessing: false, completedCount: 0, failedCount: 0, totalCount: 0 });

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
      try {
          const data = await fetchJson<BatchStatus>('/api/batch/status');
          setStatus(data);
      } catch (e) { console.error(e); }
  };

  const addToQueue = async () => {
    const list = urls.split('\n').map(u => u.trim()).filter(u => u);
    if (!list.length) return;
    await fetchJson('/api/batch/add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ urls: list })
    });
    setUrls('');
    fetchStatus();
  };

  const toggleProcessing = async () => {
      const endpoint = status.isProcessing ? '/api/batch/stop' : '/api/batch/start';
      await fetchJson(endpoint, { method: 'POST' });
      fetchStatus();
  };

  const clear = async () => {
      await fetchJson('/api/batch/clear', { method: 'POST' });
      fetchStatus();
  };

  const download = () => {
      window.location.href = `${API_BASE}/api/batch/download`;
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end border-b border-white/10 pb-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight uppercase flex items-center gap-3">
             <List className="text-katana" /> Batch Processor
          </h2>
          <p className="text-steel font-mono text-xs mt-1 tracking-wider">&gt;&gt; AWAITING INPUT STREAM</p>
        </div>
        <div className="flex gap-3">
           <button onClick={toggleProcessing} disabled={status.queue.length === 0} className={`px-6 py-2 uppercase text-xs font-bold tracking-widest flex items-center gap-2 transition-all border ${status.isProcessing ? 'border-yellow-500 text-yellow-500 hover:bg-yellow-500/10' : 'bg-katana text-black border-katana hover:bg-red-600'}`}>
               {status.isProcessing ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4 fill-current" /> Engage</>}
           </button>
           <button onClick={download} disabled={status.completedCount === 0} className="border border-white/20 text-white hover:border-katana hover:text-katana px-6 py-2 uppercase text-xs font-bold tracking-widest flex items-center gap-2 transition-all disabled:opacity-30">
             <Download className="w-4 h-4" /> Archive
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
        <div className="bg-armor border border-white/10 p-1 flex flex-col h-full">
           <textarea
            className="flex-1 w-full p-4 bg-void text-steel focus:outline-none focus:bg-black font-mono text-xs resize-none placeholder:text-gray-800"
            placeholder="PASTE URLS [ONE PER LINE]..."
            value={urls}
            onChange={e => setUrls(e.target.value)}
          />
          <button onClick={addToQueue} className="w-full bg-white/5 text-white py-3 hover:bg-katana hover:text-black border-t border-white/10 font-mono text-xs uppercase tracking-widest flex justify-center items-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Add to Queue
          </button>
        </div>

        <div className="lg:col-span-2 bg-armor border border-white/10 flex flex-col min-h-0">
           <div className="p-3 bg-white/5 border-b border-white/5 flex justify-between items-center">
               <div className="flex gap-4 font-mono text-xs">
                   <span className="text-steel">TOTAL: <span className="text-white">{status.totalCount}</span></span>
                   <span className="text-steel">OK: <span className="text-green-500">{status.completedCount}</span></span>
                   <span className="text-steel">FAIL: <span className="text-katana">{status.failedCount}</span></span>
               </div>
               <button onClick={clear} className="text-steel hover:text-katana"><Trash2 className="w-4 h-4"/></button>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar">
               <table className="w-full text-left font-mono text-xs">
                   <thead className="text-steel bg-black/20 sticky top-0">
                       <tr>
                           <th className="px-4 py-2">State</th>
                           <th className="px-4 py-2">Payload</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                       {status.queue.map(item => (
                           <tr key={item.id} className="hover:bg-white/5">
                               <td className="px-4 py-2 w-32">
                                   {item.status === 'pending' && <span className="text-steel">WAITING</span>}
                                   {item.status === 'processing' && <span className="text-blue-400 flex gap-2 items-center"><Loader2 className="w-3 h-3 animate-spin"/> RUNNING</span>}
                                   {item.status === 'success' && <span className="text-green-500 flex gap-2 items-center"><CheckCircle className="w-3 h-3"/> OK</span>}
                                   {item.status === 'failed' && <span className="text-katana flex gap-2 items-center"><XCircle className="w-3 h-3"/> FAIL</span>}
                               </td>
                               <td className="px-4 py-2 truncate max-w-xs">
                                   <div className="text-white truncate">{item.result?.title || item.url}</div>
                                   {item.error && <div className="text-red-500">{item.error}</div>}
                               </td>
                           </tr>
                       ))}
                   </tbody>
               </table>
               {status.queue.length === 0 && (
                   <div className="flex flex-col items-center justify-center h-full opacity-20 gap-4">
                       <TerminalSquare className="w-12 h-12"/>
                       <span className="font-mono text-xs tracking-widest">BUFFER EMPTY</span>
                   </div>
               )}
           </div>
        </div>
      </div>
    </div>
  );
}