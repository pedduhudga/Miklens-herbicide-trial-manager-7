import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Check, X, Sparkles, Volume2, AlertCircle, RefreshCw } from 'lucide-react';
import { isSpeechRecognitionSupported, createSpeechRecognizer, parseVoiceObservation } from '../utils/voiceParser.js';

export default function VoiceFieldScoutModal({
  isOpen,
  onClose,
  onApply,
  knownFormulations = [],
  knownTargets = []
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [manualText, setManualText] = useState('');
  const recognizerRef = useRef(null);

  const supported = isSpeechRecognitionSupported();

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setTranscript('');
      setManualText('');
      setErrorMsg('');
      const initial = parseVoiceObservation('', { knownFormulations, knownTargets });
      setParsedData(initial);
      if (supported) {
        startListening();
      }
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [isOpen]);

  const startListening = () => {
    setErrorMsg('');
    try {
      if (recognizerRef.current) {
        try { recognizerRef.current.stop(); } catch (e) {}
      }

      const rec = createSpeechRecognizer({
        onResult: ({ transcript: text }) => {
          setTranscript(text);
          const parsed = parseVoiceObservation(text, { knownFormulations, knownTargets });
          setParsedData(parsed);
        },
        onError: (err) => {
          console.warn('[VoiceFieldScout] Speech recognition error:', err);
          if (err.error === 'not-allowed') {
            setErrorMsg('Microphone access blocked. Please allow microphone permissions in browser settings.');
          } else if (err.error !== 'no-speech') {
            setErrorMsg(`Recognition error: ${err.error || 'Check microphone'}`);
          }
          setIsListening(false);
        },
        onEnd: () => {
          setIsListening(false);
        }
      });

      if (rec) {
        recognizerRef.current = rec;
        rec.start();
        setIsListening(true);
      }
    } catch (e) {
      console.warn('[VoiceFieldScout] Failed to start speech recognition:', e);
      setErrorMsg('Could not initialize speech recognition.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognizerRef.current) {
      try { recognizerRef.current.stop(); } catch (e) {}
      recognizerRef.current = null;
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleManualChange = (e) => {
    const val = e.target.value;
    setManualText(val);
    setTranscript(val);
    const parsed = parseVoiceObservation(val, { knownFormulations, knownTargets });
    setParsedData(parsed);
  };

  const handleApply = () => {
    if (parsedData && onApply) {
      onApply(parsedData);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto flex flex-col overflow-hidden animate-scale-in">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-teal-50/40 to-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <Mic className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-slate-900 text-sm">Voice Field Scout</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200 uppercase tracking-wider">
                  100% Free AI
                </span>
              </div>
              <p className="text-xs text-slate-500">Hands-free natural speech observation logger</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">

          {/* Mic Pulse Centerpiece */}
          <div className="flex flex-col items-center justify-center py-3 bg-slate-50 rounded-2xl border border-slate-100">
            <button
              type="button"
              onClick={toggleListening}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                isListening
                  ? 'bg-rose-500 text-white shadow-rose-500/30 scale-105 ring-8 ring-rose-100 animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 active:scale-95'
              }`}
              title={isListening ? "Stop listening" : "Start speaking"}
            >
              {isListening ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
            </button>
            <p className="mt-2.5 font-bold text-slate-700 text-xs flex items-center gap-1.5">
              {isListening ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  Listening... Speak natural trial observation
                </>
              ) : (
                <>Tap microphone to start speaking</>
              )}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 text-center px-4">
              e.g. "Plot 4, Goweed Ultra at 40 ml, Bermudagrass, 95 percent kill, dry sunny"
            </p>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Spoken Transcript Area */}
          <div>
            <label className="font-bold text-slate-700 mb-1 flex items-center justify-between text-xs">
              <span>Heard Transcript</span>
              {transcript && (
                <button
                  type="button"
                  onClick={() => { setTranscript(''); setParsedData(parseVoiceObservation('')); }}
                  className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Clear
                </button>
              )}
            </label>
            <textarea
              rows={2}
              value={transcript || manualText}
              onChange={handleManualChange}
              placeholder="Or type/paste speech here..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 font-mono"
            />
          </div>

          {/* Structured Observation Preview Cards */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="font-bold text-slate-800 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Auto-Extracted Observation Fields
              </span>
              {parsedData?.result && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                  parsedData.result === 'Excellent' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                  parsedData.result === 'Good' ? 'bg-teal-100 text-teal-800 border-teal-200' :
                  parsedData.result === 'Fair' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  'bg-rose-100 text-rose-800 border-rose-200'
                }`}>
                  {parsedData.result} Rating
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2 bg-white rounded-xl border border-slate-200/60 shadow-2xs">
                <div className="text-[10px] uppercase font-bold text-slate-400">Plot #</div>
                <div className="text-xs font-black text-slate-800 truncate">
                  {parsedData?.plot ? `Plot ${parsedData.plot}` : '—'}
                </div>
              </div>

              <div className="p-2 bg-white rounded-xl border border-slate-200/60 shadow-2xs">
                <div className="text-[10px] uppercase font-bold text-slate-400">Kill Rate</div>
                <div className="text-xs font-black text-emerald-700 truncate">
                  {parsedData?.efficacy !== null ? `${parsedData.efficacy}%` : '—'}
                </div>
              </div>

              <div className="p-2 bg-white rounded-xl border border-slate-200/60 shadow-2xs">
                <div className="text-[10px] uppercase font-bold text-slate-400">Dosage</div>
                <div className="text-xs font-bold text-slate-800 truncate">
                  {parsedData?.dosage || '—'}
                </div>
              </div>

              <div className="p-2 bg-white rounded-xl border border-slate-200/60 shadow-2xs">
                <div className="text-[10px] uppercase font-bold text-slate-400">Target</div>
                <div className="text-xs font-bold text-slate-800 truncate">
                  {parsedData?.target || '—'}
                </div>
              </div>
            </div>

            {parsedData?.notes && (
              <div className="p-2 bg-white rounded-xl border border-slate-200/60 text-[11px] text-slate-600">
                <span className="font-bold text-slate-700">Notes: </span>
                {parsedData.notes}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!parsedData?.efficacy && !parsedData?.notes && !parsedData?.plot}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>Apply to Observation</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
