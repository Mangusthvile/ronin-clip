import React, { useState, useEffect, useRef } from 'react';
import { Book, Image as ImageIcon, CheckCircle, AlertCircle, Loader2, Play, Save, Eye, Edit3, RefreshCw, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { fetchJson } from '../src/lib/http';
import type { BatchStatus, BatchItem } from '../../types';

// --- Types ---
type GemStatus = 'ready' | 'processing' | 'completed' | 'error';

interface GemData {
  id: string; // The markdown image string, e.g., ![image](url)
  url: string;
  status: GemStatus;
  htmlResult: string | null;
}

const IMAGE_REGEX = /!\[.*?\]\((.*?)\)/g;

const extractImagesFromText = (text: string) => {
  const matches = [...text.matchAll(IMAGE_REGEX)];
  return matches.map(match => {
    const id = match[0];
    const url = match[1];
    const index = match.index!;
    // Extract context snippet
    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + id.length + 30);
    let snippet = text.substring(start, end).replace(/\n/g, ' ');
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    return { id, url, index, snippet };
  });
};

export default function Scrolls() {
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [isTransmuting, setIsTransmuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [gems, setGems] = useState<Record<string, GemData>>({});
  const [activeContent, setActiveContent] = useState<string>('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchQueue = async () => {
    try {
      const status = await fetchJson<BatchStatus>('api/batch/status');
      const itemsWithImages = status.queue.filter(i => i.status === 'success' && i.result?.hasImages);
      setQueue(itemsWithImages);
      if (itemsWithImages.length > 0 && !activeId) {
        handleSelectScroll(itemsWithImages[0]);
      }
    } catch (e) {
      console.error("Failed to fetch queue", e);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectScroll = (item: BatchItem) => {
    setActiveId(item.id);
    setActiveContent(item.result?.content || '');
    
    // Initialize gems
    const extracted = extractImagesFromText(item.result?.content || '');
    const initialGems: Record<string, GemData> = {};
    extracted.forEach(gem => {
      initialGems[gem.id] = {
        id: gem.id,
        url: gem.url,
        status: 'ready',
        htmlResult: null
      };
    });
    setGems(initialGems);
    setViewMode('editor');
  };

  const activeScroll = queue.find(g => g.id === activeId);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setActiveContent(e.target.value);
  };

  const handleSave = async () => {
    if (!activeId) return;
    setIsSaving(true);
    try {
      await fetchJson(`api/batch/update/${activeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: activeContent })
      });
      // Refresh queue to reflect changes
      await fetchQueue();
    } catch (e) {
      console.error("Failed to save", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!activeScroll || !activeScroll.result) return;
    const isMd = activeScroll.result.hasRichContent;
    const ext = isMd ? 'md' : 'txt';
    const blob = new Blob([activeContent], {type: 'text/plain'});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const safeTitle = (activeScroll.result.title || 'chapter').replace(/[^a-z0-9]/gi, '_');
    a.download = `${safeTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const transmuteGem = async (gemId: string) => {
    const gem = gems[gemId];
    if (!gem || !gem.url) return;

    setGems(prev => ({
      ...prev,
      [gemId]: { ...prev[gemId], status: 'processing' }
    }));

    try {
      const res = await fetchJson<{success: boolean, html: string}>('api/transmute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: gem.url })
      });

      setGems(prev => ({
        ...prev,
        [gemId]: { ...prev[gemId], status: 'completed', htmlResult: res.html }
      }));

    } catch (error) {
      console.error("Transmute error", error);
      setGems(prev => ({
        ...prev,
        [gemId]: { ...prev[gemId], status: 'error' }
      }));
    }
  };

  const insertGem = (gemId: string) => {
    const gem = gems[gemId];
    if (gem && gem.htmlResult) {
      setActiveContent(prev => prev.split(gemId).join(`\n${gem.htmlResult}\n`));
    }
  };

  const handleTransmuteAll = async () => {
    setIsTransmuting(true);
    const extractedGems = extractImagesFromText(activeContent);
    const readyGemIds = extractedGems
      .map(g => g.id)
      .filter(id => gems[id]?.status === 'ready' || gems[id]?.status === 'error');

    for (const gemId of readyGemIds) {
      await transmuteGem(gemId);
    }
    setIsTransmuting(false);
  };

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-steel">
        <Book className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-bold text-white mb-2">No Scrolls Require Transmutation</h2>
        <p className="text-sm">Chapters with images extracted in the Batch Queue will appear here.</p>
        <button onClick={fetchQueue} className="mt-6 flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
    );
  }

  const extractedGems = extractImagesFromText(activeContent);

  return (
    <div className="flex h-full gap-6">
      {/* Left Sidebar: Scrolls List */}
      <div className="w-64 bg-armor border border-white/10 rounded-lg flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Book className="w-4 h-4 text-katana" /> Image Scrolls
          </h2>
          <button onClick={fetchQueue} className="text-steel hover:text-white transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {queue.map(item => (
            <div 
              key={item.id} 
              className={`flex flex-col p-3 rounded cursor-pointer transition-colors ${activeId === item.id ? 'bg-white/10 border-l-2 border-katana' : 'text-steel hover:bg-white/5 border-l-2 border-transparent'}`}
              onClick={() => handleSelectScroll(item)}
            >
              <span className="text-sm font-bold text-white truncate">{item.result?.title || 'Untitled'}</span>
              <span className="text-xs opacity-70 truncate mt-1">{item.url}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-armor border border-white/10 rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="p-3 border-b border-white/10 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setViewMode('editor')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${viewMode === 'editor' ? 'bg-white/10 text-white' : 'text-steel hover:bg-white/5'}`}
            >
              <Edit3 className="w-4 h-4" /> Editor
            </button>
            <button 
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${viewMode === 'preview' ? 'bg-white/10 text-white' : 'text-steel hover:bg-white/5'}`}
            >
              <Eye className="w-4 h-4" /> Preview
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleDownload} 
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded text-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button 
              onClick={handleSave} 
              disabled={isSaving}
              className="flex items-center gap-2 bg-katana hover:bg-red-700 text-white px-4 py-1.5 rounded text-sm transition-colors disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Scroll
            </button>
          </div>
        </div>

        {/* Editor / Preview Area */}
        <div className="flex-1 overflow-hidden relative">
          {viewMode === 'editor' && (
            <textarea
              ref={textareaRef}
              value={activeContent}
              onChange={handleTextChange}
              placeholder="Chapter content..."
              className="w-full h-full bg-transparent text-mist p-6 resize-none outline-none font-sans leading-relaxed"
            />
          )}
          {viewMode === 'preview' && (
            <div className="w-full h-full overflow-y-auto p-6 bg-void text-mist prose prose-invert max-w-none prose-table:border-collapse prose-th:p-2 prose-td:p-2">
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                {activeContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar: Image Collection */}
      {viewMode === 'editor' && (
        <div className="w-72 bg-armor border border-white/10 rounded-lg flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-white/10 bg-black/20 flex justify-between items-center">
            <h2 className="font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-katana" /> Images
            </h2>
            <button 
              onClick={handleTransmuteAll}
              disabled={isTransmuting || extractedGems.length === 0}
              className={`text-katana hover:text-red-400 transition-colors ${(isTransmuting || extractedGems.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Transmute All Images"
            >
              {isTransmuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {extractedGems.length === 0 ? (
              <div className="text-center text-steel text-sm mt-10 px-4">
                No images found in this scroll.
              </div>
            ) : (
              extractedGems.map((gem, index) => {
                const gemData = gems[gem.id] || { status: 'ready' };
                
                return (
                  <div key={gem.id + index} className="bg-void border border-white/10 rounded p-3 relative group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono text-katana">Image #{index + 1}</span>
                      <div className="flex items-center gap-2">
                        {gemData.status === 'ready' && <span className="w-2 h-2 rounded-full bg-blue-500" title="Ready"></span>}
                        {gemData.status === 'processing' && <Loader2 className="w-3 h-3 text-yellow-500 animate-spin" title="Processing" />}
                        {gemData.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500" title="Completed" />}
                        {gemData.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" title="Error" />}
                      </div>
                    </div>
                    
                    <div className="text-[10px] text-steel italic mb-2 line-clamp-2 bg-white/5 p-1.5 rounded break-all">
                      {gem.url}
                    </div>
                    
                    {gemData.status === 'completed' && gemData.htmlResult ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="h-48 bg-white text-black overflow-y-auto p-2 rounded text-[10px] border border-white/20">
                          <div dangerouslySetInnerHTML={{ __html: gemData.htmlResult }} />
                        </div>
                        <button 
                          onClick={() => insertGem(gem.id)}
                          className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1 font-bold tracking-wider uppercase transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" /> Insert Table
                        </button>
                      </div>
                    ) : (
                      <div className="relative h-32 bg-black/50 rounded overflow-hidden border border-white/5 flex items-center justify-center">
                        <img 
                          src={gem.url} 
                          alt="Scroll Image" 
                          className="max-w-full max-h-full object-contain opacity-70"
                          referrerPolicy="no-referrer"
                        />
                        {(gemData.status === 'ready' || gemData.status === 'error') && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => transmuteGem(gem.id)}
                              className="bg-katana text-white px-3 py-1.5 rounded text-xs flex items-center gap-1 font-bold tracking-wider uppercase"
                            >
                              <Play className="w-3 h-3" /> {gemData.status === 'error' ? 'Recast' : 'Transmute'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
