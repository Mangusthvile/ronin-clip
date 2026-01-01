import React, { useState } from 'react';
import { Play, Copy, Download, Loader2, AlertCircle, Terminal, FileText } from 'lucide-react';
import { ExtractedChapter, ExtractionResponse } from '../types';
import { fetchJson } from '../src/lib/http';

export default function SingleExtract() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedChapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const resp = await fetchJson<ExtractionResponse>('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      if (resp.success && resp.data) {
          setResult(resp.data);
      } else {
          setError(resp.error || 'Unknown error');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string) => navigator.clipboard.writeText(text);

  const download = () => {
    if (!result) return;
    const blob = new Blob([`${result.title}\n\n${result.content}`], {type: 'text/plain'});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${result.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="border-l-4 border-katana pl-4">
        <h2 className="text-3xl font-bold text-white tracking-tight uppercase">Single Extraction</h2>
        <p className="text-steel font-mono text-sm">Target singular web entity for processing.</p>
      </div>

      <div className="bg-armor border border-white/10 p-1 flex">
        <div className="flex-1 bg-plate relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Terminal className="h-4 w-4 text-steel" />
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ENTER TARGET URL..."
              className="w-full bg-transparent text-white p-4 pl-12 focus:outline-none font-mono text-sm"
              onKeyDown={e => e.key === 'Enter' && handleExtract()}
            />
        </div>
        <button
            onClick={handleExtract}
            disabled={loading || !url}
            className="bg-katana hover:bg-red-600 text-black px-8 font-bold uppercase tracking-widest disabled:opacity-50 transition-all flex items-center gap-2"
        >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
            Execute
        </button>
      </div>

      {error && (
        <div className="bg-red-950/30 text-red-400 p-4 border border-red-900/50 flex items-center gap-3 font-mono text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>&gt; ERR: {error}</p>
        </div>
      )}

      {result && (
        <div className="bg-armor border border-white/10 relative flex flex-col h-[600px]">
          <div className="bg-black/40 px-6 py-4 border-b border-white/5 flex justify-between items-center backdrop-blur-sm">
            <div>
              <h3 className="font-bold text-white text-lg tracking-wide">{result.title}</h3>
              <p className="text-[10px] text-katana font-mono uppercase tracking-wider truncate max-w-md">{result.url}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => copy(result.title)} className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs font-mono uppercase border border-white/10">Copy Title</button>
              <button onClick={() => copy(result.content)} className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs font-mono uppercase border border-white/10">Copy Body</button>
              <button onClick={download} className="px-3 py-1 bg-katana hover:bg-red-600 text-black text-xs font-mono uppercase font-bold flex items-center gap-2"><Download className="w-3 h-3"/> TXT</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <pre className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-gray-300 font-light max-w-3xl mx-auto">
              {result.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}