import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Pause, Download, Loader2, CheckCircle, XCircle, List, TerminalSquare, RotateCcw, BoxSelect, X, BookOpen, Hash, ArrowUpDown } from 'lucide-react';
import { BatchStatus } from '../types';
import { fetchJson, API_BASE } from '../src/lib/http';

export default function BatchExtract() {
  const [urls, setUrls] = useState('');
  const [status, setStatus] = useState<BatchStatus>({ queue: [], isProcessing: false, completedCount: 0, failedCount: 0, totalCount: 0 });
  const [format, setFormat] = useState<'talevox' | 'generic'>('talevox');
  const [isDownloading, setIsDownloading] = useState(false);

  // Modal State
  const [showConfig, setShowConfig] = useState(false);
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [config, setConfig] = useState({
      seriesTitle: '',
      startIndex: 1
  });

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

  const handleFlip = () => {
      if (!urls) return;
      const lines = urls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
      setUrls(lines.reverse().join('\n'));
  };

  const handleAddClick = () => {
      const list = urls.split('\n').map(u => u.trim()).filter(u => u);
      if (!list.length) return;

      if (format === 'talevox') {
          // Open Modal for TaleVox
          setPendingUrls(list);
          setShowConfig(true);
      } else {
          // Add immediately for Generic
          submitToQueue(list);
      }
  };

  const submitToQueue = async (list: string[], meta?: { seriesTitle: string, startIndex: number }) => {
    await fetchJson('/api/batch/add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            urls: list,
            seriesTitle: meta?.seriesTitle,
            startIndex: meta?.startIndex
        })
    });
    setUrls('');
    setPendingUrls([]);
    setShowConfig(false);
    fetchStatus();
  };

  const toggleProcessing = async () => {
      const endpoint = status.isProcessing ? '/api/batch/stop' : '/api/batch/start';
      await fetchJson(endpoint, { method: 'POST' });
      fetchStatus();
  };

  const retryFailed = async () => {
      await fetchJson('/api/batch/retry', { method: 'POST' });
      fetchStatus();
  };

  const clear = async () => {
      await fetchJson('/api/batch/clear', { method: 'POST' });
      fetchStatus();
  };

  const download = async () => {
      setIsDownloading(true);
      try {
          const filename = `ronin_batch_${format}.zip`;
          
          // 1. Fetch the Blob
          const response = await fetch(`${API_BASE}/api/batch/download?format=${format}`);
          if (!response.ok) throw new Error('Network response was not ok');
          const blob = await response.blob();

          // 2. Try modern "Save As" (File System Access API)
          if ('showSaveFilePicker' in window) {
              try {
                  const opts = {
                      suggestedName: filename,
                      types: [{
                          description: 'ZIP Archive',
                          accept: { 'application/zip': ['.zip'] },
                      }],
                  };
                  // @ts-ignore
                  const handle = await window.showSaveFilePicker(opts);
                  const writable = await handle.createWritable();
                  await writable.write(blob);
                  await writable.close();
                  return; // Success
              } catch (err: any) {
                  if (err.name === 'AbortError') return;
              }
          }

          // 3. Fallback: Standard Download Link
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          
          setTimeout(() => {
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
          }, 100);

      } catch (e) {
          console.error('Download failed', e);
          alert("Failed to download archive. See console for details.");
      } finally {
          setIsDownloading(false);
      }
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500 relative">
      
      {/* TaleVox Configuration Modal */}
      {showConfig && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
            <div className="bg-armor border border-katana/50 w-full max-w-md shadow-[0_0_50px_rgba(220,38,38,0.2)]">
                <div className="bg-katana/10 border-b border-katana/20 p-4 flex justify-between items-center">
                    <h3 className="text-white font-bold uppercase tracking-widest flex items-center gap-2">
                        <BoxSelect className="w-5 h-5 text-katana" /> TaleVox Configuration
                    </h3>
                    <button onClick={() => setShowConfig(false)} className="text-steel hover:text-white"><X className="w-5 h-5"/></button>
                </div>
                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-steel uppercase tracking-wider flex items-center gap-2">
                            <BookOpen className="w-4 h-4" /> Series Title
                        </label>
                        <input 
                            type="text" 
                            className="w-full bg-void border border-white/10 p-3 text-white focus:border-katana focus:outline-none font-mono text-sm"
                            placeholder="e.g. The Lost World"
                            value={config.seriesTitle}
                            onChange={e => setConfig({...config, seriesTitle: e.target.value})}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-steel uppercase tracking-wider flex items-center gap-2">
                            <Hash className="w-4 h-4" /> Starting Chapter Index
                        </label>
                        <input 
                            type="number" 
                            min="1"
                            className="w-full bg-void border border-white/10 p-3 text-white focus:border-katana focus:outline-none font-mono text-sm"
                            value={config.startIndex}
                            onChange={e => setConfig({...config, startIndex: parseInt(e.target.value) || 1})}
                        />
                        <p className="text-[10px] text-steel font-mono">
                            Detected {pendingUrls.length} links. Chapters will be indexed {config.startIndex} to {config.startIndex + pendingUrls.length - 1}.
                        </p>
                    </div>
                    <button 
                        onClick={() => submitToQueue(pendingUrls, config)}
                        className="w-full bg-katana hover:bg-red-600 text-black py-3 font-bold uppercase tracking-widest flex justify-center items-center gap-2 transition-all shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                    >
                        <Plus className="w-4 h-4" /> Confirm & Add
                    </button>
                </div>
            </div>
        </div>
      )}

      <div className="flex justify-between items-end border-b border-white/10 pb-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight uppercase flex items-center gap-3">
             <List className="text-katana" /> Batch Processor
          </h2>
          <p className="text-steel font-mono text-xs mt-1 tracking-wider">&gt;&gt; AWAITING INPUT STREAM</p>
        </div>
        <div className="flex gap-3 items-center">
           {!status.isProcessing && status.failedCount > 0 && (
               <button onClick={retryFailed} className="border border-red-500/50 text-red-400 hover:bg-red-500/10 px-6 py-2 uppercase text-xs font-bold tracking-widest flex items-center gap-2 transition-all">
                   <RotateCcw className="w-4 h-4" /> Retry Failures
               </button>
           )}
           
           {/* Controls Container */}
           <div className="flex gap-2 mr-2">
                {/* Format Toggle */}
                <div className="flex items-center border border-white/10 rounded overflow-hidden">
                        <button 
                            onClick={() => setFormat('talevox')} 
                            className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${format === 'talevox' ? 'bg-katana text-black' : 'bg-void text-steel hover:text-white'}`}
                        >
                            TaleVox
                        </button>
                        <div className="w-px h-full bg-white/10"></div>
                        <button 
                            onClick={() => setFormat('generic')} 
                            className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${format === 'generic' ? 'bg-katana text-black' : 'bg-void text-steel hover:text-white'}`}
                        >
                            Generic
                        </button>
                </div>
           </div>
           
           <button onClick={toggleProcessing} disabled={status.queue.length === 0} className={`px-6 py-2 uppercase text-xs font-bold tracking-widest flex items-center gap-2 transition-all border ${status.isProcessing ? 'border-yellow-500 text-yellow-500 hover:bg-yellow-500/10' : 'bg-katana text-black border-katana hover:bg-red-600'}`}>
               {status.isProcessing ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4 fill-current" /> Engage</>}
           </button>
           <button onClick={download} disabled={status.completedCount === 0 || isDownloading} className="border border-white/20 text-white hover:border-katana hover:text-katana px-6 py-2 uppercase text-xs font-bold tracking-widest flex items-center gap-2 transition-all disabled:opacity-30">
             {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
             Archive
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
        <div className="bg-armor border border-white/10 flex flex-col h-full">
           <div className="p-3 bg-white/5 border-b border-white/5 flex justify-between items-center">
               <span className="text-xs font-bold text-steel uppercase tracking-wider font-mono">Input Source</span>
               <button onClick={handleFlip} className="bg-black/20 hover:bg-katana hover:text-black text-steel border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all">
                   <ArrowUpDown className="w-3 h-3" /> Flip
               </button>
           </div>
           <textarea
            className="flex-1 w-full p-4 bg-void text-steel focus:outline-none focus:bg-black font-mono text-xs resize-none placeholder:text-gray-800 border-b border-white/10"
            placeholder="PASTE URLS [ONE PER LINE]..."
            value={urls}
            onChange={e => setUrls(e.target.value)}
          />
          <button onClick={handleAddClick} className="w-full bg-white/5 text-white py-3 hover:bg-katana hover:text-black font-mono text-xs uppercase tracking-widest flex justify-center items-center gap-2 transition-colors">
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
                           <th className="px-4 py-2">Meta</th>
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
                               <td className="px-4 py-2 w-24 text-steel">
                                   {item.manualChapterIndex ? <span className="text-white">#{item.manualChapterIndex}</span> : '-'}
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