import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Monitor, 
  Image as ImageIcon, 
  FolderGit2 as GithubIcon,
  Upload, 
  Play, 
  Trash2, 
  Maximize, 
  Wifi, 
  WifiOff,
  CheckCircle2,
  X
} from 'lucide-react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

type PlaylistItem = {
  id: string;
  type: 'url' | 'file';
  data: any; // URL string or ArrayBuffer
  mime?: string;
  preview: string;
};

type Message = {
  type: 'PLAYLIST_UPDATE' | 'COMMAND';
  payload: any;
};

export default function App() {
  const [mode, setMode] = useState<'admin' | 'frame'>('admin');
  
  // URL Parameter Sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('mode');
    if (m === 'frame') setMode('frame');
  }, []);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 font-sans selection:bg-blue-500/30">
      {mode === 'frame' ? <FrameView /> : <AdminView />}
    </div>
  );
}

function FrameView() {
  const [peerId, setPeerId] = useState<string>('');
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => setPeerId(id));
    
    peer.on('connection', (conn) => {
      setIsConnected(true);
      conn.on('data', (data: any) => {
        const msg = data as Message;
        if (msg.type === 'PLAYLIST_UPDATE') {
          const newPlaylist = msg.payload.map((item: any) => {
            if (item.type === 'file') {
              const blob = new Blob([item.data], { type: item.mime });
              return { ...item, preview: URL.createObjectURL(blob) };
            }
            return { ...item, preview: item.data };
          });
          setPlaylist(newPlaylist);
          setCurrentIndex(0);
        }
      });
      
      conn.on('close', () => setIsConnected(false));
    });

    return () => {
      peer.destroy();
    };
  }, []);

  const showNext = useCallback(() => {
    if (playlist.length === 0) return;
    
    setIsRefreshing(true);
    setTimeout(() => {
      const nextIndex = (currentIndex + 1) % playlist.length;
      setCurrentIndex(nextIndex);
      setCurrentImage(playlist[nextIndex].preview);
      
      setTimeout(() => setIsRefreshing(false), 800);
    }, 500);
  }, [playlist, currentIndex]);

  useEffect(() => {
    if (playlist.length > 0) {
      setCurrentImage(playlist[currentIndex].preview);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(showNext, 15000); // 15s refresh
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playlist, showNext, currentIndex]);

  return (
    <div className="relative w-screen h-screen bg-[#f4f1ea] overflow-hidden flex items-center justify-center">
      {/* Paper Texture Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-20 z-10" 
           style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/felt.png')` }}></div>

      {/* Main Image */}
      {currentImage ? (
        <img 
          src={currentImage} 
          className={`max-w-[94%] max-h-[94%] object-contain shadow-2xl transition-opacity duration-1000 
            ${isRefreshing ? 'opacity-0' : 'opacity-100'} 
            filter contrast-[0.92] brightness-[1.04] grayscale-[0.1]`}
          alt="Artwork"
        />
      ) : (
        <div className="text-neutral-400 font-serif italic text-xl animate-pulse">Waiting for inspiration...</div>
      )}

      {/* E-ink Refresh Effect */}
      {isRefreshing && (
        <div className="absolute inset-0 bg-black z-20 animate-[blink_0.4s_ease-in-out_infinite]"></div>
      )}

      {/* Status Overlay */}
      <div className="absolute bottom-8 left-8 z-30 group">
        <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-neutral-200/50 flex flex-col gap-1 transition-all duration-500 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-amber-500'}`}></div>
            <span className="text-[10px] font-bold text-neutral-800 uppercase tracking-widest">
              {isConnected ? 'Connected' : 'Offline Mode'}
            </span>
          </div>
          <p className="text-[10px] font-mono text-neutral-500 uppercase">Frame ID: <span className="text-blue-600 select-all">{peerId}</span></p>
        </div>
      </div>

      <button 
        onClick={() => document.documentElement.requestFullscreen()}
        className="absolute top-8 right-8 z-30 p-3 bg-white/20 hover:bg-white/80 rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100"
      >
        <Maximize className="w-5 h-5 text-neutral-800" />
      </button>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes blink { 0%, 100% { opacity: 0; } 50% { opacity: 0.8; } }
        body { cursor: none; }
      `}} />
    </div>
  );
}

function AdminView() {
  const [targetId, setTargetId] = useState('');
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [repo, setRepo] = useState('');
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error', msg: string }>({ type: 'info', msg: 'Disconnected' });
  const [isConnecting, setIsConnecting] = useState(false);
  
  const connRef = useRef<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;
    return () => peer.destroy();
  }, []);

  const connectToFrame = () => {
    if (!targetId || !peerRef.current) return;
    setIsConnecting(true);
    const conn = peerRef.current.connect(targetId);
    
    conn.on('open', () => {
      connRef.current = conn;
      setStatus({ type: 'success', msg: 'Connected to Frame' });
      setIsConnecting(false);
    });

    conn.on('error', () => {
      setStatus({ type: 'error', msg: 'Connection Failed' });
      setIsConnecting(false);
    });

    conn.on('close', () => setStatus({ type: 'info', msg: 'Disconnected' }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newItems: PlaylistItem[] = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      newItems.push({
        id: Math.random().toString(36).substr(2, 9),
        type: 'file',
        data: buffer,
        mime: file.type,
        preview: URL.createObjectURL(file)
      });
    }
    setPlaylist(prev => [...prev, ...newItems]);
  };

  const fetchGitHub = async () => {
    if (!repo.includes('/')) return;
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const images = data.filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f.name));
        const newItems: PlaylistItem[] = images.map(img => ({
          id: Math.random().toString(36).substr(2, 9),
          type: 'url',
          data: img.download_url,
          preview: img.download_url
        }));
        setPlaylist(prev => [...prev, ...newItems]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const pushToFrame = () => {
    if (connRef.current && connRef.current.open) {
      const payload = playlist.map(i => ({
        type: i.type,
        data: i.data,
        mime: i.mime
      }));
      connRef.current.send({ type: 'PLAYLIST_UPDATE', payload });
      setStatus({ type: 'success', msg: 'Playlist Pushed!' });
    } else {
      setStatus({ type: 'error', msg: 'No active connection' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-12 space-y-8">
      {/* Header & Connection */}
      <div className="bg-neutral-800 border border-neutral-700 p-8 rounded-[2.5rem] shadow-2xl space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 text-white">
              <div className="p-2 bg-blue-600 rounded-xl"><Monitor className="w-6 h-6" /></div>
              DIY Art Frame <span className="text-blue-500 italic">Pro</span>
            </h1>
            <p className="text-neutral-400 mt-2 text-sm font-medium">Remote Control Center for LCD Prototypes</p>
          </div>
          <button 
            onClick={() => window.location.href = '?mode=frame'}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-xs font-bold transition-colors"
          >
            <Maximize className="w-4 h-4" /> Switch to Frame Mode
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 p-2 bg-neutral-900/50 rounded-3xl border border-neutral-700/50">
          <div className="md:col-span-2 relative">
            <input 
              type="text" 
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="Enter Display Frame ID..." 
              className="w-full bg-transparent p-4 outline-none font-mono text-blue-400 placeholder:text-neutral-600"
            />
          </div>
          <button 
            onClick={connectToFrame}
            disabled={isConnecting}
            className={`flex items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all active:scale-95
              ${status.type === 'success' ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            {isConnecting ? 'Linking...' : status.type === 'success' ? <><CheckCircle2 className="w-5 h-5"/> Connected</> : 'Link Frame'}
          </button>
        </div>
        
        <div className={`text-[10px] uppercase tracking-[0.2em] font-black flex items-center gap-2 ${
          status.type === 'success' ? 'text-green-500' : status.type === 'error' ? 'text-red-500' : 'text-neutral-500'
        }`}>
          {status.type === 'success' ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>}
          System Status: {status.msg}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Input Sources */}
        <div className="space-y-6">
          <section className="bg-neutral-800 border border-neutral-700 p-6 rounded-[2rem] shadow-lg">
            <div className="flex items-center gap-2 mb-4 text-blue-400">
              <GithubIcon className="w-5 h-5" />
              <h2 className="font-bold text-sm uppercase tracking-wider">GitHub Repository</h2>
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="user/repo" 
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-sm outline-none focus:border-blue-500 transition-colors"
              />
              <button onClick={fetchGitHub} className="bg-white text-black px-4 rounded-xl font-bold text-xs hover:bg-neutral-200">Fetch</button>
            </div>
          </section>

          <section className="bg-neutral-800 border border-neutral-700 p-6 rounded-[2rem] shadow-lg">
            <div className="flex items-center gap-2 mb-4 text-purple-400">
              <Upload className="w-5 h-5" />
              <h2 className="font-bold text-sm uppercase tracking-wider">Local Assets</h2>
            </div>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-700 rounded-[1.5rem] p-8 hover:border-purple-500 transition-colors cursor-pointer group">
              <ImageIcon className="w-8 h-8 text-neutral-600 group-hover:text-purple-400 transition-colors mb-2" />
              <span className="text-xs text-neutral-500 font-medium">Drop photos or Click to upload</span>
              <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </section>
        </div>

        {/* Playlist Preview */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-[2.5rem] p-8 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-black text-xl flex items-center gap-2">
              Queue <span className="px-2 py-0.5 bg-neutral-700 rounded-full text-xs text-neutral-400">{playlist.length}</span>
            </h2>
            <button onClick={() => setPlaylist([])} className="text-neutral-500 hover:text-red-400 transition-colors">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-3 pr-2 scrollbar-hide">
            {playlist.map((item, idx) => (
              <div key={item.id} className="relative aspect-square rounded-2xl overflow-hidden group border border-neutral-700">
                <img src={item.preview} className="w-full h-full object-cover grayscale-[0.2]" alt="" />
                <button 
                  onClick={() => setPlaylist(p => p.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {playlist.length === 0 && (
              <div className="col-span-3 flex flex-col items-center justify-center h-full opacity-20 py-12">
                <ImageIcon className="w-12 h-12 mb-2" />
                <p className="text-sm italic">Gallery is empty</p>
              </div>
            )}
          </div>

          <button 
            onClick={pushToFrame}
            disabled={playlist.length === 0}
            className="mt-8 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all"
          >
            <Play className="w-6 h-6 fill-current" />
            SYNC TO FRAME
          </button>
        </div>
      </div>

      <footer className="text-center text-neutral-600 text-[10px] uppercase tracking-widest font-bold">
        Art Frame Pro v2.0 &bull; Peer-to-Peer Visual Pipeline
      </footer>
    </div>
  );
}