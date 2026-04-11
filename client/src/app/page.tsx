'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Trash2, BookOpen, User, FileText, UploadCloud, 
  Loader2, AlertCircle, Menu, X, Settings, Database, 
  Plus, MoreHorizontal, Sparkles, Copy, Bookmark
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  sources?: { page: string; source: string }[];
  status?: 'thinking' | 'done' | 'error';
  errorDetail?: string;
}

interface Document {
  id: string;
  name: string;
  chunks: number;
}

const API_BASE = "http://localhost:8000";

export default function StudyMind() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: 'Hello! I am ready to process your notes. Upload a file to begin!',
      status: 'done'
    }
  ]);
  const [input, setInput] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  
  const [savedNotes, setSavedNotes] = useState<{id: string, content: string, title: string}[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const saveNote = (content: string) => {
    const title = content.substring(0, 30) + "...";
    setSavedNotes(prev => [{ id: Math.random().toString(36).substr(2, 9), content, title }, ...prev]);
  };

  const deleteNote = (id: string) => {
    setSavedNotes(prev => prev.filter(note => note.id !== id));
  };

  useEffect(() => {
    const checkHealth = async () => {
      try {
        await axios.get(`${API_BASE}/`);
        setBackendStatus('online');
      } catch (err) {
        setBackendStatus('offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const onDrop = async (acceptedFiles: File[]) => {
    setIsUploading(true);
    for (const file of acceptedFiles) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await axios.post(`${API_BASE}/upload`, formData);
        setDocuments(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          name: res.data.filename,
          chunks: res.data.chunks
        }]);
      } catch (err: any) {
        alert("Upload failed. Ensure the server is running.");
      }
    }
    setIsUploading(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/pdf': ['.pdf'], 'text/plain': ['.txt'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }
  });

  const handleSend = async () => {
    if (!input.trim() || backendStatus === 'offline') return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input, status: 'done' };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    const aiMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMessageId, role: 'ai', content: '', status: 'thinking' }]);

    try {
      const res = await axios.post(`${API_BASE}/chat`, { query: input });
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: res.data.answer, sources: res.data.sources, status: 'done' } : m));
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: "Could not retrieve info from notes.", status: 'error' } : m));
    }
  };

  return (
    <div className="flex h-screen bg-white text-[#0d0d0d] font-sans overflow-hidden">
      
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 z-30 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            exit={{ x: -260 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed lg:relative h-full w-[260px] bg-[#f9f9f9] border-r border-[#e5e5e5] flex flex-col z-40"
          >
            <div className="p-4 flex flex-col h-full overflow-hidden">
              <button className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[#ececec] transition-colors border border-[#e5e5e5] mb-6 shadow-sm bg-white">
                <Plus className="w-4 h-4" />
                <span className="text-sm font-semibold">New Session</span>
              </button>

              <div {...getRootProps()} className={`p-4 rounded-xl border-2 border-dashed text-center cursor-pointer mb-6 transition-all ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-[#e5e5e5] hover:bg-white'}`}>
                <input {...getInputProps()} />
                <UploadCloud className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                <p className="text-[11px] font-bold uppercase tracking-tighter text-slate-500">Drop Notes Here</p>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-6">
                <div>
                  <p className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Your Archive</p>
                  <div className="space-y-1">
                    {documents.map(doc => (
                      <div key={doc.id} className="p-2.5 rounded-lg hover:bg-[#ececec] transition-all flex items-center gap-3 cursor-pointer group">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-xs truncate flex-1 font-medium">{doc.name}</span>
                      </div>
                    ))}
                    {documents.length === 0 && !isUploading && (
                      <div className="px-2 py-4 text-[10px] text-slate-400 italic">No notes uploaded...</div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Saved Snippets</p>
                  <div className="space-y-1">
                    {savedNotes.map(note => (
                      <div key={note.id} className="p-2.5 rounded-lg hover:bg-[#ececec] transition-all flex items-center justify-between group/note border border-transparent hover:border-[#e5e5e5]">
                        <div className="flex flex-col gap-1 overflow-hidden">
                           <span className="text-[11px] font-bold truncate">{note.title}</span>
                           <span className="text-[9px] text-slate-500 uppercase font-black">Bookmarked</span>
                        </div>
                        <button 
                          onClick={() => deleteNote(note.id)}
                          className="opacity-0 group-hover/note:opacity-100 p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-md transition-all"
                        >
                           <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {savedNotes.length === 0 && (
                      <div className="px-2 py-4 text-[10px] text-slate-400 italic">No saved snippets...</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#e5e5e5] mt-auto">
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-[#ececec] transition-all cursor-pointer">
                   <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-7 h-7 rounded bg-black flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-lg shadow-black/10">KS</div>
                      <span className="text-xs font-bold truncate">Kartik Shete</span>
                   </div>
                   <MoreHorizontal className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Area */}
      <main className="flex-1 flex flex-col bg-white min-w-0 relative">
        {/* Nav Toolbar */}
        <header className="h-14 flex items-center px-4 justify-between border-b border-[#e5e5e5] bg-white/80 backdrop-blur-md z-20">
           <div className="flex items-center">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)} 
                className="p-2 hover:bg-[#f4f4f4] rounded-lg transition-colors text-slate-500 focus:outline-none"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="ml-4 flex items-center gap-2">
                 <span className="text-sm font-bold text-slate-800 tracking-tight">StudyMind RAG</span>
                 <div className="h-4 w-[1px] bg-slate-200 mx-1" />
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Precise Search</span>
              </div>
           </div>
           
           <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${backendStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
              <button className="p-2 hover:bg-[#f4f4f4] rounded-lg text-slate-400 transition-colors">
                 <Settings className="w-4 h-4" />
              </button>
           </div>
        </header>

        {/* Chat Feed */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto w-full custom-scrollbar">
          <div className="max-w-3xl mx-auto px-4 md:px-0 py-10 space-y-10 md:space-y-12">
            {messages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex gap-4 md:gap-8 max-w-full group">
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 shadow-sm transition-transform duration-300 group-hover:scale-105 ${msg.role === 'ai' ? 'bg-black text-white' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      {msg.role === 'ai' ? <Sparkles className="w-4 h-4" /> : <User className="w-4 h-4" />}
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className={`relative ${msg.role === 'user' ? 'font-bold text-slate-900 text-lg' : 'text-slate-700 text-base leading-relaxed'}`}>
                        {msg.status === 'thinking' ? (
                          <div className="flex items-center gap-2 py-2">
                             <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-duration:1s]" />
                             <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-duration:1s] [animation-delay:0.2s]" />
                             <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-duration:1s] [animation-delay:0.4s]" />
                          </div>
                        ) : (
                          <div className="prose prose-slate max-w-none break-words whitespace-pre-wrap">
                             {msg.content}
                          </div>
                        )}
                        
                        {/* Action Buttons for AI Responses */}
                        {msg.role === 'ai' && msg.status === 'done' && (
                          <div className="flex items-center gap-3 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={() => copyToClipboard(msg.content)}
                               className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-black transition-colors bg-slate-50 px-2 py-1 rounded-md border border-slate-200 shadow-sm"
                             >
                                <Copy className="w-3 h-3" /> COPY
                             </button>
                             <button 
                               onClick={() => saveNote(msg.content)}
                               className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 px-2 py-1 rounded-md border border-slate-200 shadow-sm"
                             >
                                <Bookmark className="w-3 h-3" /> SAVE TO NOTEBOOK
                             </button>
                          </div>
                        )}
                      </div>
                      
                      {/* Source attribution in ChatGPT style */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                           <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mr-2 flex items-center">
                              Indexed Files:
                           </div>
                           {Array.from(new Set(msg.sources.map(s => s.source))).map((source, sidx) => (
                             <div key={sidx} className="flex items-center gap-2 text-[10px] bg-slate-50/50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 font-bold hover:border-slate-300 transition-all">
                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                <span className="uppercase tracking-tighter">{source}</span>
                             </div>
                           ))}
                        </div>
                      )}
                   </div>
                </div>
              </div>
            ))}
            <div className="h-40" />
          </div>
        </div>

        {/* Input area */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-white via-white/95 to-transparent z-10">
           <div className="max-w-3xl mx-auto w-full relative">
              <div className="flex items-center bg-[#f7f7f8] border border-slate-200 rounded-2xl overflow-hidden focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100 transition-all shadow-md">
                 <textarea 
                    rows={1}
                    value={input}
                    onChange={(e) => {
                       setInput(e.target.value);
                       e.target.style.height = 'auto';
                       e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Search relevant notes..."
                    className="flex-1 bg-transparent p-4 resize-none outline-none text-[15px] md:text-base placeholder:text-slate-400 max-h-[180px] font-medium"
                 />
                 <button 
                   onClick={handleSend}
                   disabled={!input.trim() || backendStatus === 'offline'}
                   className={`p-2.5 mr-3 rounded-xl transition-all shadow-sm ${
                     input.trim() && backendStatus === 'online' ? 'bg-black text-white hover:scale-105 active:scale-95' : 'text-slate-300 bg-slate-100'
                   }`}
                 >
                   <Send className="w-4 h-4" />
                 </button>
              </div>
              <div className="flex items-center justify-between mt-4 px-2">
                 <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-bold">
                   StudyMind Precise Retrieval Engine
                 </p>
                 <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase">
                       <Database className="w-3 h-3" /> FAISS Local
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </main>
    </div>
  );
}
                                                          