import React, { useMemo } from 'react';

interface OrbProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  isSpeaking: boolean;
  volume: number;
}

const Orb: React.FC<OrbProps> = ({ status, isSpeaking, volume }) => {
  
  // Determine Base Color
  const baseColor = useMemo(() => {
    if (status === 'error') return 'rgb(239, 68, 68)'; // Red
    if (status === 'connecting') return 'rgb(255, 255, 255)'; // White
    if (status === 'connected') {
        if (isSpeaking) return 'rgb(59, 130, 246)'; // Blue (AI Speaking)
        return 'rgb(16, 185, 129)'; // Green (Listening/Waiting)
    }
    return 'rgb(75, 85, 99)'; // Gray (Disconnected)
  }, [status, isSpeaking]);

  // Dynamic Styling for Pulse/Expansion based on volume
  // We clamp volume for visual stability
  const scale = 1 + Math.min(volume * 1.5, 1.0); 
  const opacity = 0.6 + Math.min(volume, 0.4);
  
  // Secondary glow layer
  const glowSize = 50 + Math.min(volume * 100, 100); 

  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {/* Outer Glow (Ambient) */}
      <div 
        className="absolute rounded-full transition-all duration-100 ease-out"
        style={{
            width: `${100 * scale}%`,
            height: `${100 * scale}%`,
            backgroundColor: baseColor,
            opacity: opacity * 0.3,
            filter: `blur(${30 + volume * 20}px)`
        }}
      />

      {/* Inner Core (Solid) */}
      <div 
        className={`relative z-10 rounded-full w-32 h-32 shadow-2xl transition-colors duration-500 ease-in-out ${status === 'connecting' ? 'animate-pulse' : ''}`}
        style={{
            backgroundColor: baseColor,
            boxShadow: `0 0 ${glowSize}px ${baseColor}`,
            transform: `scale(${0.9 + (volume * 0.2)})`
        }}
      >
        {/* Texture/Shine Overlay */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-transparent opacity-50 pointer-events-none" />
      </div>

      {/* Status Text (Optional, keeps it Zero-UI but informative during transitions) */}
      {status === 'connecting' && (
        <div className="absolute -bottom-16 text-white/50 text-sm font-light tracking-widest uppercase animate-pulse">
          Initializing
        </div>
      )}
       {status === 'error' && (
        <div className="absolute -bottom-16 text-red-400 text-sm font-light tracking-widest uppercase">
          Connection Error
        </div>
      )}
    </div>
  );
};

export default Orb;