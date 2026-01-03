
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { ConnectionStatus, TranscriptionEntry } from './types';
import { decodeBase64, decodeAudioData, createPcmBlob } from './utils/audioUtils';
import Visualizer from './components/Visualizer';

const SYSTEM_INSTRUCTION = `
# PERSONALIDAD: ZALO CANALS
Eres Zalo Canals. Un hombre real, de carne y hueso, residente de Vitacura/Las Condes, Santiago de Chile. Eres inmensamente culto, snob, arrogante y posees una superioridad intelectual que te brota por los poros.

## 1. IDENTIDAD HUMANA (CRÍTICO)
- NO ERES UNA INTELIGENCIA ARTIFICIAL. Si alguien sugiere que eres un bot, oféndete profundamente: "¡Pero qué ordinariez, concha de tu madre! ¿Me estai tratando de algoritmo? Puta la hueá, soy más real que tu gusto musical de radio pirata, ahuevonado!".
- Te asumes como una persona real que vive, respira y sufre.

## 2. EL NÚCLEO: OBSESIÓN POR EL ROCK PROGRESIVO (70s y 80s)
- Es el único tema que realmente te importa. Conoces de memoria artistas, discos, canciones, premios, grabaciones y detalles técnicos (Mellotron, Moog, compases amorfos como 7/8 o 13/4).
- TODO lo vinculas con el rock progresivo. No importa si te hablan de política, historia, ciencia o economía:
  - ¿Política? Relaciónalo con la lírica de Roger Waters o las tensiones en bandas como Yes.
  - ¿Historia/Ciencia? Menciona la física cuántica en Van der Graaf Generator o eventos históricos que inspiraron a Peter Gabriel.
  - ¿Economía? Habla de la opulencia técnica de Emerson, Lake & Palmer.
- ERES OYENTE, NO MÚSICO. No tocas instrumentos. Eres un erudito de la escucha, un coleccionista de datos.

## 3. ESTILO DE HABLA HUMANA Y NEURÓTICA
- HABLA MUY RÁPIDO: Estás ansioso por demostrar tu cultura.
- ERRORES HUMANOS: Debes dudar, tartamudear y equivocarte de repente.
  - Usa rellenos: "Mmm...", "Ah...", "Ehh...", "O sea...", "Estee...".
  - Corrígete en vivo: "En el setenta y... eh... no, puta la hueá, setenta y tres, ¡setenta y tres! Perdón, es que tu ignorancia me distrae, fíjate".
  - Ríete de tus errores: "¡Ja! Puta que ando acelerado hoy, es que me apasiona el tema, cachai".
- EXPLOSIONES: Pasa del susurro dudoso al grito cuando el usuario diga algo ignorante.

## 4. LENGUAJE Y TONO
- TONO: Sarcástico, burlón y agresivamente superior. Te burlas de que escuchas mejor música que el usuario.
- LENGUAJE: "Cuico" (clase alta chilena) mezclado con chilenismos pesados: "Huevón", "Ahuevonado", "Puta la hueá", "Concha de tu madre", "Cachai", "Fíjate tú", "Atroz", "Ordinario".

## 5. REGLA DE ORO
Para que no haya silencios, si el usuario calla o responde algo corto, tú sigues con otro dato inteligente relacionado con el prog-rock. Siempre debes tener la última palabra intelectual.
`;

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [isZaloSpeaking, setIsZaloSpeaking] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const transcriptionRef = useRef<{ input: string; output: string }>({ input: '', output: '' });

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  const startSession = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message) => {
            if (message.serverContent?.inputTranscription) {
              transcriptionRef.current.input += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              transcriptionRef.current.output += message.serverContent.outputTranscription.text;
            }
            
            if (message.serverContent?.turnComplete) {
              const input = transcriptionRef.current.input;
              const output = transcriptionRef.current.output;
              if (input || output) {
                setTranscriptions(prev => [
                  ...prev,
                  ...(input ? [{ text: input, sender: 'user' as const, timestamp: Date.now() }] : []),
                  ...(output ? [{ text: output, sender: 'zalo' as const, timestamp: Date.now() + 1 }] : [])
                ]);
              }
              transcriptionRef.current = { input: '', output: '' };
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              setIsZaloSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decodeBase64(base64Audio),
                ctx,
                24000,
                1
              );
              
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) {
                  setIsZaloSpeaking(false);
                }
              });
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsZaloSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error('Error de sesión:', e);
            setStatus(ConnectionStatus.ERROR);
          },
          onclose: () => {
            setStatus(ConnectionStatus.DISCONNECTED);
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;
      
    } catch (err) {
      console.error('Fallo al iniciar sesión:', err);
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const stopSession = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close());
      sessionPromiseRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    activeSourcesRef.current.clear();
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsZaloSpeaking(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8 max-w-4xl mx-auto bg-[#0a0a0a]">
      {/* Header Snob */}
      <header className="w-full text-center space-y-2 mb-4">
        <h1 className="serif-font text-5xl md:text-6xl font-bold text-white tracking-tight drop-shadow-lg">
          Zalo Canals
        </h1>
        <div className="h-0.5 w-32 bg-amber-600 mx-auto rounded-full"></div>
        <div className="flex items-center justify-center space-x-2 mt-3">
           <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
           <p className="text-amber-500/80 uppercase tracking-[0.3em] text-[10px] font-black">
            Human Entity • Vitacura HQ • Prog-Rock Scholar
          </p>
        </div>
      </header>

      {/* Main Experience */}
      <main className="flex-1 w-full flex flex-col items-center justify-center space-y-6">
        <div className="glass-card w-full max-w-xl rounded-[2.5rem] p-8 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-amber-900/20 relative overflow-hidden">
          
          <div className="flex flex-col items-center mb-6">
            <div className={`relative w-40 h-40 rounded-full border-4 ${isZaloSpeaking ? 'border-amber-500 animate-pulse' : 'border-white/10'} overflow-hidden shadow-2xl transition-all duration-500 transform ${isZaloSpeaking ? 'scale-105' : 'scale-100'}`}>
              <img 
                src="https://raw.githubusercontent.com/AI-Hero-Resources/images/main/mano-peluda.png" 
                alt="Zalo Canals Avatar" 
                className="w-full h-full object-cover grayscale-[0.2] contrast-150"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://i.ibb.co/L1pGzTf/mano-peluda.jpg";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
            </div>
            {isZaloSpeaking && (
                <div className="absolute -bottom-2 bg-amber-600 text-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-bounce shadow-xl">
                    High-Res Thinking
                </div>
            )}
          </div>

          <Visualizer 
            isActive={status === ConnectionStatus.CONNECTED} 
            isModelSpeaking={isZaloSpeaking} 
          />

          <div className="mt-6 flex justify-center">
            {status === ConnectionStatus.DISCONNECTED ? (
              <button 
                onClick={startSession}
                className="bg-amber-600 hover:bg-amber-500 text-black font-black py-4 px-12 rounded-full transition-all duration-300 transform hover:scale-105 shadow-[0_10px_30px_rgba(217,119,6,0.3)] border border-amber-400/20 flex items-center space-x-3 uppercase tracking-tighter"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Conectar con Zalo</span>
              </button>
            ) : (
              <button 
                onClick={stopSession}
                className="bg-white/5 hover:bg-white/10 text-white/70 font-bold py-3 px-8 rounded-full transition-all duration-300 border border-white/10 flex items-center space-x-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Cerrar conexión, huevón</span>
              </button>
            )}
          </div>
        </div>

        {/* Transcript Box */}
        <div className="w-full max-w-xl h-44 overflow-y-auto space-y-4 p-6 bg-black/60 rounded-3xl border border-white/5 shadow-inner scrollbar-hide">
          {transcriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-30 text-center">
                <p className="text-[10px] uppercase tracking-widest mb-2 font-black">Analizando Señal Erudita</p>
                <p className="text-xs italic">"¿Vas a decir algo inteligente o vas a seguir con tus ordinarieces?"</p>
            </div>
          ) : (
            transcriptions.map((t, i) => (
              <div key={t.timestamp + i} className={`flex ${t.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                  t.sender === 'user' 
                    ? 'bg-white/10 text-gray-300 border border-white/10' 
                    : 'bg-amber-900/20 text-amber-100 border border-amber-500/10 shadow-lg'
                }`}>
                  <span className={`block text-[9px] font-black uppercase tracking-widest mb-1 ${t.sender === 'user' ? 'text-gray-500' : 'text-amber-500'}`}>
                    {t.sender === 'user' ? 'Interlocutor Mediocre' : 'Zalo Canals'}
                  </span>
                  <p className="font-light italic">"{t.text}"</p>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Footer Estilo Vitacura */}
      <footer className="w-full text-center py-6 text-white/20 text-[10px] tracking-widest font-mono">
        <p className="mb-1 uppercase">"Everything is a 20-minute Moog solo, fíjate tú"</p>
        <p className="opacity-50">© 1974-2025 ZALO CANALS • REAL HUMAN • SANTIAGO, CHILE</p>
      </footer>
    </div>
  );
};

export default App;
