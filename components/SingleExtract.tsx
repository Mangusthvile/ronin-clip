import React, { useState } from 'react';
import { Play, Download, Loader2, AlertCircle, Terminal, FileText, Bug, Microscope, Scroll } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ExtractedChapter, ExtractionResponse } from '../types';
import { fetchJson } from '../src/lib/http';
import { formatChapterContent, parseChapterMetadata, debugChapterMetadata, ChapterMetaDebug } from '../src/lib/talevox';

export default function SingleExtract() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedChapter | null>(null);
  const [parsedMeta, setParsedMeta] = useState<{index: number | null, title: string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  // New state for Title Analysis
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ChapterMetaDebug | null>(null);

  const handleExtract = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setParsedMeta(null);
    setDebugInfo(null);
    setShowAnalysis(false);
    setAnalysisResult(null);

    try {
      const resp = await fetchJson<ExtractionResponse>('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      
      if (resp.success && resp.data) {
          setResult(resp.data);
          // Parse metadata immediately for display
          const meta = parseChapterMetadata(resp.data.title);
          setParsedMeta(meta);
          
          // @ts-ignore
          if (resp.data.debugMetadata) setDebugInfo(resp.data.debugMetadata);

          if (resp.data.hasImages) {
              navigate('/scrolls');
          }
      } else {
          setError(resp.error || 'Unknown error');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeepAnalyze = () => {
      if (!result) return;
      const debugData = debugChapterMetadata(result.title);
      setAnalysisResult(debugData);
      setShowAnalysis(true);
  };

  const copy = (text: string) => navigator.clipboard.writeText(text);

  const getFormattedContent = () => {
      if (!result) return '';
      const meta = parseChapterMetadata(result.title);
      return formatChapterContent(meta.index, meta.title, result.content);
  };

  const getDisplayHeader = () => {
      if (!parsedMeta) return '';
      if (parsedMeta.index !== null) {
          return parsedMeta.title 
            ? `Chapter ${parsedMeta.index}: ${parsedMeta.title}`
            : `Chapter ${parsedMeta.index}`;
      }
      return parsedMeta.title || result?.title || 'Unknown Chapter';
  };

  const download = () => {
    if (!result || !parsedMeta) return;
    
    const formatted = getFormattedContent();
    const isMd = result.hasRichContent;
    const ext = isMd ? 'md' : 'txt';

    const blob = new Blob([formatted], {type: 'text/plain'});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // Use parsed title for filename if available
    const safeTitle = (parsedMeta.title || 'chapter').replace(/[^a-z0-9]/gi, '_');
    a.download = `${safeTitle}.${ext}`;
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

      {result && parsedMeta && (
        <div className="space-y-4">
          <div className="bg-armor border border-white/10 relative flex flex-col h-[600px]">
            <div className="bg-black/40 px-6 py-4 border-b border-white/5 flex justify-between items-center backdrop-blur-sm">
              <div>
                <h3 className="font-bold text-white text-lg tracking-wide">
                  {getDisplayHeader()}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] bg-katana text-black px-2 py-0.5 font-bold uppercase">TaleVox Format</span>
                    <p className="text-[10px] text-steel font-mono uppercase tracking-wider truncate max-w-md">
                        ORIGINAL: {result.title}
                    </p>
                </div>
              </div>
              <div className="flex gap-2">
                {result.hasImages && (
                    <button 
                        onClick={() => navigate('/scrolls')} 
                        className="px-3 py-1 bg-katana/20 hover:bg-katana/40 text-katana text-xs font-mono uppercase border border-katana/30 flex items-center gap-2"
                    >
                        <Scroll className="w-3 h-3" /> Open in Scrolls
                    </button>
                )}
                <button 
                    onClick={handleDeepAnalyze} 
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs font-mono uppercase border border-white/10 flex items-center gap-2 text-steel hover:text-white"
                >
                    <Microscope className="w-3 h-3" /> Deep Analyze
                </button>
                <button onClick={() => copy(getFormattedContent())} className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs font-mono uppercase border border-white/10">Copy All</button>
                <button onClick={download} className="px-3 py-1 bg-katana hover:bg-red-600 text-black text-xs font-mono uppercase font-bold flex items-center gap-2">
                    <Download className="w-3 h-3"/> Download
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex min-h-0">
                {/* Content Preview */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar border-r border-white/5">
                  <pre className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-gray-300 font-light max-w-3xl mx-auto">
                    {getFormattedContent()}
                  </pre>
                </div>
                
                {/* Debug Panel */}
                {debugInfo && (
                    <div className="w-64 bg-black/20 p-4 overflow-y-auto custom-scrollbar font-mono text-[10px] space-y-4">
                        <div className="flex items-center gap-2 text-katana font-bold uppercase border-b border-white/10 pb-2">
                            <Bug className="w-3 h-3" /> Extraction Debug
                        </div>
                        
                        <div>
                            <span className="text-steel block mb-1">USED SELECTOR</span>
                            <code className="text-white break-all bg-white/5 p-1 block">{debugInfo.usedSelector}</code>
                        </div>
                        
                        <div>
                            <span className="text-steel block mb-1">TITLE SOURCE</span>
                            <code className="text-white break-all bg-white/5 p-1 block">{debugInfo.titleSelector}</code>
                        </div>

                        {/* Explicitly show parsed data for debugging */}
                        <div>
                            <span className="text-steel block mb-1">PARSED META</span>
                            <div className="bg-white/5 p-2 space-y-1 font-mono text-white">
                                <div>Index: {parsedMeta.index !== null ? parsedMeta.index : 'NULL'}</div>
                                <div>Title: "{parsedMeta.title}"</div>
                            </div>
                        </div>

                        {debugInfo.removedElements && debugInfo.removedElements.length > 0 && (
                            <div>
                                <span className="text-steel block mb-1">REMOVED ELEMENTS</span>
                                <div className="space-y-1">
                                    {debugInfo.removedElements.map((el: string, i: number) => (
                                        <div key={i} className="text-red-400 truncate border-l border-red-900 pl-1">{el}</div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
          </div>

          {/* Deep Analysis Panel */}
          {showAnalysis && analysisResult && (
              <div className="bg-black/40 border border-katana/30 p-4 animate-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                      <Microscope className="w-4 h-4 text-katana" />
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Title Parsing Analysis</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono text-xs">
                      {/* Input Column */}
                      <div className="space-y-2">
                          <span className="text-steel uppercase text-[10px] font-bold">Raw Input</span>
                          <div className="bg-void p-2 border border-white/10 text-white break-all">
                              {analysisResult.original}
                          </div>
                          <span className="text-steel uppercase text-[10px] font-bold">Normalized</span>
                          <div className="bg-void p-2 border border-white/10 text-gray-400 break-all">
                              {analysisResult.normalized}
                          </div>
                      </div>

                      {/* Matching Column */}
                      <div className="space-y-2">
                          <div className="flex justify-between">
                              <span className="text-steel uppercase text-[10px] font-bold">Strategy Used</span>
                              <span className="text-katana font-bold">{analysisResult.strategy}</span>
                          </div>
                          
                          {analysisResult.match && (
                              <>
                                  <div className="bg-white/5 p-2 space-y-1">
                                      <div className="text-gray-400">Match: <span className="text-white">"{analysisResult.match.full}"</span></div>
                                      <div className="text-gray-400">Group 1 (Num): <span className="text-white">"{analysisResult.match.numberGroup}"</span></div>
                                      <div className="text-gray-400">Regex: <span className="text-gray-500 text-[10px]">{analysisResult.regexUsed}</span></div>
                                  </div>
                              </>
                          )}
                      </div>

                      {/* Output Column */}
                      <div className="space-y-2">
                          <span className="text-steel uppercase text-[10px] font-bold">Split Results</span>
                          <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white/5 p-2">
                                  <div className="text-[10px] text-steel">PREFIX</div>
                                  <div className="text-white truncate">"{analysisResult.prefix || ''}"</div>
                              </div>
                              <div className="bg-white/5 p-2">
                                  <div className="text-[10px] text-steel">SUFFIX</div>
                                  <div className="text-white truncate">"{analysisResult.suffix || ''}"</div>
                              </div>
                              <div className="bg-white/5 p-2 col-span-2">
                                  <div className="text-[10px] text-steel">CLEAN SUFFIX (Title Candidate)</div>
                                  <div className="text-katana font-bold">"{analysisResult.cleanSuffix || ''}"</div>
                              </div>
                          </div>
                          <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                              <span className="text-white">FINAL TITLE:</span>
                              <span className="bg-katana text-black px-2 font-bold">"{analysisResult.finalTitle}"</span>
                          </div>
                      </div>
                  </div>
              </div>
          )}
        </div>
      )}
    </div>
  );
}