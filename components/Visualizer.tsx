
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  isModelSpeaking: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, isModelSpeaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;
    const bars = 40;
    const barWidth = 4;
    const gap = 2;
    
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < bars; i++) {
        const height = isModelSpeaking 
          ? Math.random() * 40 + 10 
          : (isActive ? Math.random() * 15 + 2 : 2);
        
        const x = i * (barWidth + gap);
        const y = (canvas.height - height) / 2;
        
        ctx.fillStyle = isModelSpeaking ? '#fbbf24' : '#6366f1';
        ctx.fillRect(x, y, barWidth, height);
      }
      
      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive, isModelSpeaking]);

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="relative w-64 h-32 bg-black/40 rounded-xl overflow-hidden border border-white/10 flex items-center justify-center">
        {!isActive && <p className="text-gray-500 italic text-sm">Zalo está esperando...</p>}
        <canvas 
          ref={canvasRef} 
          width={240} 
          height={100} 
          className={`${isActive ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}
        />
      </div>
      <p className="mt-4 text-xs font-mono uppercase tracking-widest text-gray-400">
        {isModelSpeaking ? "Zalo Canals está comentando un solo de Rick Wakeman..." : isActive ? "Escuchando tus vulgaridades..." : "Sistema Inactivo"}
      </p>
    </div>
  );
};

export default Visualizer;
