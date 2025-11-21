import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { base64ToUint8Array, createPcmBlob, decodeAudioData } from '../utils/audioUtils';
import { saveTranscript } from '../utils/firebase';

export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseLiveSessionReturn {
  status: SessionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  volume: number; // 0.0 to 1.0, represents current audio level (input or output)
  isSpeaking: boolean; // True if AI is speaking
}

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

export function useLiveSession(): UseLiveSessionReturn {
  const [status, setStatus] = useState<SessionStatus>('disconnected');
  const [volume, setVolume] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  
  // Audio Nodes
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  
  // State management for playback
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Transcription State
  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // Animation frame for volume visualization
  const rafIdRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (sessionRef.current) {
        sessionRef.current = null;
    }
    
    // Stop all active sources
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();

    // Disconnect audio nodes
    if (inputSourceRef.current) inputSourceRef.current.disconnect();
    if (processorRef.current) processorRef.current.disconnect();
    if (outputGainNodeRef.current) outputGainNodeRef.current.disconnect();
    if (analyzerRef.current) analyzerRef.current.disconnect();

    // Close contexts
    if (inputContextRef.current) inputContextRef.current.close();
    if (outputContextRef.current) outputContextRef.current.close();
    
    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
    }

    // Save any pending partial transcripts on disconnect
    if (currentInputRef.current) {
        saveTranscript('user', currentInputRef.current, sessionIdRef.current);
        currentInputRef.current = '';
    }
    if (currentOutputRef.current) {
        saveTranscript('model', currentOutputRef.current, sessionIdRef.current);
        currentOutputRef.current = '';
    }

    inputContextRef.current = null;
    outputContextRef.current = null;
    setStatus('disconnected');
    setIsSpeaking(false);
    setVolume(0);
  }, []);

  const connect = useCallback(async () => {
    if (!process.env.API_KEY) {
        console.error("API Key missing");
        setStatus('error');
        return;
    }

    // Generate a new session ID for this connection
    sessionIdRef.current = crypto.randomUUID();

    try {
      setStatus('connecting');

      // 1. Initialize Audio Contexts
      // Input: 16kHz (Required by Gemini)
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      // Output: 24kHz (Required by Gemini)
      outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      // 2. Setup Audio Analysis for Visualization
      analyzerRef.current = outputContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;
      const bufferLength = analyzerRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Volume Monitoring Loop
      const updateVolume = () => {
        if (analyzerRef.current) {
            analyzerRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            // Normalize roughly 0-255 to 0-1, tailored for visual punch
            setVolume(Math.min(1, average / 50)); 
        }
        rafIdRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // 3. Setup Output Chain
      outputGainNodeRef.current = outputContextRef.current.createGain();
      outputGainNodeRef.current.connect(analyzerRef.current);
      analyzerRef.current.connect(outputContextRef.current.destination);

      // 4. Get Microphone Access
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 5. Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const config = {
        model: MODEL_NAME,
        config: {
            responseModalities: [Modality.AUDIO],
            // Enable transcription for database logging
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } // 'Kore' is calm
            },
            systemInstruction: "You are Serene AI, a supportive, non-judgmental, and concise executive function coach for someone with ADHD. Keep interactions fluid and human-like. Avoid long monologues.",
        }
      };

      // 6. Establish Connection
      // We store the promise to ensure we don't send data before connection is ready
      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
            onopen: () => {
                setStatus('connected');
                
                // Setup Input Processing ONLY after connection is open
                if (!inputContextRef.current || !streamRef.current) return;

                inputSourceRef.current = inputContextRef.current.createMediaStreamSource(streamRef.current);
                // Buffer size 4096 is standard for this API interaction to balance latency/performance
                processorRef.current = inputContextRef.current.createScriptProcessor(4096, 1, 1);
                
                processorRef.current.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcmBlob = createPcmBlob(inputData);
                    
                    sessionPromise.then((session) => {
                        session.sendRealtimeInput({ media: pcmBlob });
                    });
                };

                inputSourceRef.current.connect(processorRef.current);
                processorRef.current.connect(inputContextRef.current.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
                const { serverContent } = message;

                // 1. Handle Transcription
                if (serverContent?.inputTranscription?.text) {
                    currentInputRef.current += serverContent.inputTranscription.text;
                }
                if (serverContent?.outputTranscription?.text) {
                    currentOutputRef.current += serverContent.outputTranscription.text;
                }

                // 2. Handle Turn Completion (Save to DB)
                if (serverContent?.turnComplete) {
                    // Save user part if available
                    if (currentInputRef.current) {
                        saveTranscript('user', currentInputRef.current, sessionIdRef.current);
                        currentInputRef.current = '';
                    }
                    // Save model part if available
                    if (currentOutputRef.current) {
                        saveTranscript('model', currentOutputRef.current, sessionIdRef.current);
                        currentOutputRef.current = '';
                    }
                    setIsSpeaking(false);
                }

                // 3. Handle Interruption (Barge-In)
                if (serverContent?.interrupted) {
                    console.log("User interrupted. Clearing audio queue.");
                    // Save whatever model said before being interrupted
                    if (currentOutputRef.current) {
                        saveTranscript('model', currentOutputRef.current + " [INTERRUPTED]", sessionIdRef.current);
                        currentOutputRef.current = '';
                    }
                    
                    activeSourcesRef.current.forEach((source) => {
                        try { source.stop(); } catch(e) {}
                    });
                    activeSourcesRef.current.clear();
                    nextStartTimeRef.current = 0;
                    setIsSpeaking(false);
                    return;
                }

                // 4. Handle Audio Data
                const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (base64Audio && outputContextRef.current && outputGainNodeRef.current) {
                    setIsSpeaking(true);
                    
                    // Ensure playback timing is continuous
                    const ctx = outputContextRef.current;
                    nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                    
                    const audioBuffer = await decodeAudioData(
                        base64ToUint8Array(base64Audio),
                        ctx,
                        24000,
                        1
                    );

                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputGainNodeRef.current);
                    
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    
                    activeSourcesRef.current.add(source);
                    source.onended = () => {
                        activeSourcesRef.current.delete(source);
                        // Simple heuristic: if no sources active, we aren't speaking
                        if (activeSourcesRef.current.size === 0) {
                            setIsSpeaking(false);
                        }
                    };
                }
            },
            onclose: () => {
                console.log("Session closed");
                setStatus('disconnected');
            },
            onerror: (err) => {
                console.error("Session error", err);
                setStatus('error');
            }
        }
      });

      sessionRef.current = sessionPromise;

    } catch (error) {
      console.error("Failed to connect", error);
      setStatus('error');
      cleanup();
    }
  }, [cleanup]);

  return {
    status,
    connect,
    disconnect: cleanup,
    volume,
    isSpeaking
  };
}