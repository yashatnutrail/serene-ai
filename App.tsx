import React, { useState, useEffect } from 'react';
import { useLiveSession } from './hooks/useLiveSession';
import Orb from './components/Orb';

const App: React.FC = () => {
  const { status, connect, disconnect, volume, isSpeaking } = useLiveSession();
  const [hasStarted, setHasStarted] = useState(false);

  const handleStart = async () => {
    setHasStarted(true);
    await connect();
  };

  const handleStop = () => {
    disconnect();
    setHasStarted(false);
  };

  // Auto-disconnect on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-black text-white selection:bg-emerald-500/30">
      
      {/* Background Ambient Light */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-900/10 rounded-full blur-[120px]" />
      </div>

      {!hasStarted ? (
        <div className="z-10 flex flex-col items-center space-y-12 max-w-md text-center px-6 animate-in fade-in zoom-in duration-700">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-extralight tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
              Serene AI
            </h1>
            <p className="text-lg text-white/40 font-light leading-relaxed">
              Your always-listening executive function companion. 
              <br/>
              Secure. Private. Hands-free.
            </p>
          </div>

          <button
            onClick={handleStart}
            className="group relative px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <span className="text-lg font-medium tracking-wide text-white/90 group-hover:text-white">
              Begin Session
            </span>
            {/* Button Glow */}
            <div className="absolute inset-0 rounded-full ring-1 ring-white/20 group-hover:ring-white/40 transition-all duration-300" />
          </button>
          
          <div className="text-xs text-white/20 uppercase tracking-widest pt-8">
            Headphones Recommended
          </div>
        </div>
      ) : (
        <div className="relative w-full h-screen flex flex-col items-center justify-center animate-in fade-in duration-1000">
          
          {/* The Core Experience */}
          <div className="flex-1 flex items-center justify-center w-full">
            <Orb status={status} isSpeaking={isSpeaking} volume={volume} />
          </div>

          {/* Minimal Footer Controls */}
          <div className="absolute bottom-12 transition-opacity duration-500 hover:opacity-100 opacity-30">
             <button 
                onClick={handleStop}
                className="text-xs text-white/40 uppercase tracking-widest hover:text-red-400 transition-colors p-4"
             >
               End Session
             </button>
          </div>
          
          {/* Privacy Indicator (HIPAA compliant feeling) */}
          <div className="absolute top-8 right-8 flex items-center space-x-2 opacity-30">
             <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500' : 'bg-gray-500'}`} />
             <span className="text-[10px] uppercase tracking-widest text-white/60">
                 {status === 'connected' ? 'Secure Live' : 'Offline'}
             </span>
          </div>

        </div>
      )}
    </div>
  );
};

export default App;