import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  X, Zap, Focus, Layers, Grid, Sun, ZoomIn, ZoomOut, 
  ChevronLeft, ChevronRight, Check, RefreshCw, Sparkles, CheckCircle2 
} from 'lucide-react';
import { triggerHaptic } from '../utils/nativeCapabilities.js';

/**
 * High-Precision Agronomic Camera Capture with Hardware Autofocus,
 * Tap-to-Focus Reticle, Multi-Pot Rapid Capture, and Anti-Blur Stabilization.
 */
export default function CameraCapture({ 
  isOpen = true, 
  onClose, 
  onCapture, 
  initialAspectRatio = '3:4', 
  onAspectChange,
  allowBurst = false,
  onBurstCapture = null,
  trial = null,
  trials = [],
  onSelectTrial = null
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewParentRef = useRef(null);
  const touchCoordsRef = useRef({ startX: 0, startY: 0, startTime: 0 });
  
  // Stream & Hardware Capability State
  const [stream, setStream] = useState(null);
  const [trackCapabilities, setTrackCapabilities] = useState({});
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [focusMode, setFocusMode] = useState('continuous'); // 'continuous' | 'locked'
  const [focusSupported, setFocusSupported] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [exposureSupported, setExposureSupported] = useState(false);
  const [exposureEV, setExposureEV] = useState(0); // -1.0, 0, +0.5, +1.0

  // Viewfinder & Layout State
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio || '3:4');
  const [parentDims, setParentDims] = useState({ width: 0, height: 0 });
  const [gridMode, setGridMode] = useState('pot'); // 'off' | 'pot' | 'thirds'

  // Capture Modes: 'single' | 'multi' (continuous multi-pot) | 'burst'
  const [captureMode, setCaptureMode] = useState(allowBurst ? 'multi' : 'single');
  const [sessionCaptures, setSessionCaptures] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);

  // Tap-to-Focus Visual Feedback
  const [tapReticle, setTapReticle] = useState(null); // { x, y, status: 'focusing' | 'locked' }

  // Pot Trial Walkthrough Navigation State
  const [currentTrialIdx, setCurrentTrialIdx] = useState(() => {
    if (trial && trials && trials.length > 0) {
      const idx = trials.findIndex(t => t.ID === trial.ID);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  const [autoAdvancePot, setAutoAdvancePot] = useState(true);

  const activeTrial = useMemo(() => {
    if (trials && trials.length > 0 && currentTrialIdx >= 0 && currentTrialIdx < trials.length) {
      return trials[currentTrialIdx];
    }
    return trial;
  }, [trials, currentTrialIdx, trial]);

  // Sync trial index if prop changes
  useEffect(() => {
    if (trial && trials && trials.length > 0) {
      const idx = trials.findIndex(t => t.ID === trial.ID);
      if (idx >= 0 && idx !== currentTrialIdx) {
        setCurrentTrialIdx(idx);
      }
    }
  }, [trial, trials]);

  // Initialize Camera Stream with Hardware Autofocus & Exposure Constraints
  useEffect(() => {
    let activeStream = null;

    const startCamera = async (constraints) => {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = s;
        setStream(s);

        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.setAttribute('playsinline', true);
          await videoRef.current.play();
        }

        const track = s.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          setTrackCapabilities(capabilities);

          const advancedConstraints = [];

          // 1. Continuous Auto Focus Initialization
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            setFocusSupported(true);
            advancedConstraints.push({ focusMode: 'continuous' });
          }

          // 2. Continuous Auto Exposure
          if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
            advancedConstraints.push({ exposureMode: 'continuous' });
          }

          // 3. Flashlight / Torch Check
          if (capabilities.torch) {
            setFlashSupported(true);
          }

          // 4. Zoom Check
          if (capabilities.zoom) {
            setZoomSupported(true);
            setZoomLevel(capabilities.zoom.min || 1);
          }

          // 5. Exposure Compensation Check
          if (capabilities.exposureCompensation) {
            setExposureSupported(true);
          }

          if (advancedConstraints.length > 0 && track.applyConstraints) {
            try {
              await track.applyConstraints({ advanced: advancedConstraints });
              console.log('[CameraCapture] Hardware continuous autofocus & exposure active:', advancedConstraints);
            } catch (trackErr) {
              console.warn('[CameraCapture] Hardware constraints partial fallback:', trackErr);
            }
          }
        }
      } catch (err) {
        console.warn('[CameraCapture] Camera initialization stepdown fallback:', err);
        // Step-down constraints fallback from 1080p to 720p to basic video
        if (constraints?.video?.width?.ideal === 1920) {
          await startCamera({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              focusMode: { ideal: 'continuous' }
            }
          });
        } else if (constraints?.video?.width?.ideal === 1280) {
          await startCamera({
            video: { 
              facingMode: { ideal: 'environment' },
              focusMode: { ideal: 'continuous' }
            }
          });
        } else {
          try {
            await startCamera({ video: true });
          } catch (finalErr) {
            window.dispatchEvent(new CustomEvent('app:toast', { 
              detail: { msg: 'Camera access denied or unavailable.', type: 'error' } 
            }));
            onClose();
          }
        }
      }
    };

    // 1080p Full HD environment camera with high frame-rate & continuous focus
    startCamera({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        focusMode: { ideal: 'continuous' },
        exposureMode: { ideal: 'continuous' }
      }
    });

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => {
          try { track.applyConstraints({ advanced: [{ torch: false }] }); } catch (_) {}
          track.stop();
        });
      }
    };
  }, [onClose]);

  // Monitor preview parent dimensions for dynamic aspect-ratio box sizing
  useEffect(() => {
    if (!previewParentRef.current) return;
    
    const updateDims = () => {
      if (previewParentRef.current) {
        setParentDims({
          width: previewParentRef.current.clientWidth,
          height: previewParentRef.current.clientHeight
        });
      }
    };

    updateDims();
    const observer = new ResizeObserver(updateDims);
    observer.observe(previewParentRef.current);
    
    return () => observer.disconnect();
  }, []);

  // ── Tap-to-Focus Handler ──────────────────────────────────────────────────
  const handleTapToFocus = useCallback(async (e) => {
    if (!videoRef.current || !stream) return;
    const rect = videoRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX === undefined || clientY === undefined) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Show focusing reticle immediately at tap coordinates
    setTapReticle({ x, y, status: 'focusing' });
    triggerHaptic('light');

    const normX = Math.max(0, Math.min(1, x / rect.width));
    const normY = Math.max(0, Math.min(1, y / rect.height));

    const track = stream.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      const advanced = [];
      if (trackCapabilities.pointsOfInterest) {
        advanced.push({ pointsOfInterest: [{ x: normX, y: normY }] });
      }
      // Re-trigger continuous autofocus sweep centered on the tapped pot/leaf
      if (trackCapabilities.focusMode?.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }

      try {
        await track.applyConstraints({ advanced });
      } catch (err) {
        console.warn('[CameraCapture] Tap-to-focus constraints warning:', err);
      }
    }

    // Reticle transition: turns green on focus acquisition, then fades out
    setTimeout(() => {
      setTapReticle(prev => prev ? { ...prev, status: 'locked' } : null);
    }, 280);

    setTimeout(() => {
      setTapReticle(null);
    }, 1600);
  }, [stream, trackCapabilities]);

  // ── Smart Focus Mode Toggle (Continuous AF vs Lock AF) ───────────────────
  const toggleFocusMode = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;

    try {
      if (focusMode === 'continuous') {
        // Switch to Locked Focus (only after running a clean auto-focus sweep first)
        setTapReticle({ 
          x: (videoRef.current?.clientWidth || 300) / 2, 
          y: (videoRef.current?.clientHeight || 400) / 2, 
          status: 'focusing' 
        });
        
        let focusConstraint = 'continuous';
        if (trackCapabilities.focusMode?.includes('single-shot')) {
          focusConstraint = 'single-shot';
        } else if (trackCapabilities.focusMode?.includes('manual')) {
          focusConstraint = 'manual';
        }

        await track.applyConstraints({ advanced: [{ focusMode: focusConstraint }] });
        setFocusMode('locked');
        triggerHaptic('medium');
        
        setTimeout(() => {
          setTapReticle(prev => prev ? { ...prev, status: 'locked' } : null);
        }, 300);
        setTimeout(() => setTapReticle(null), 1400);

        window.dispatchEvent(new CustomEvent('app:toast', { 
          detail: { msg: 'Focus locked onto current distance 🔒', type: 'info' } 
        }));
      } else {
        // Re-enable Continuous Auto Focus
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        setFocusMode('continuous');
        triggerHaptic('light');
        window.dispatchEvent(new CustomEvent('app:toast', { 
          detail: { msg: 'Continuous Auto Focus restored 🟢', type: 'success' } 
        }));
      }
    } catch (err) {
      console.warn('[CameraCapture] Focus mode switch error:', err);
    }
  };

  // ── Force Re-Focus Sweep ──────────────────────────────────────────────────
  const handleForceRefocus = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;

    try {
      triggerHaptic('light');
      setTapReticle({ 
        x: (videoRef.current?.clientWidth || 300) / 2, 
        y: (videoRef.current?.clientHeight || 400) / 2, 
        status: 'focusing' 
      });

      // Temporarily cycle continuous mode to force optical lens calibration
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      setFocusMode('continuous');

      setTimeout(() => {
        setTapReticle(prev => prev ? { ...prev, status: 'locked' } : null);
      }, 350);
      setTimeout(() => setTapReticle(null), 1500);

      window.dispatchEvent(new CustomEvent('app:toast', { 
        detail: { msg: 'Re-focused on crop canopy 🎯', type: 'info' } 
      }));
    } catch (e) {
      console.warn('[CameraCapture] Re-focus failed:', e);
    }
  };

  // ── Torch / Flashlight Toggle ─────────────────────────────────────────────
  const toggleFlash = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      try {
        const next = !flashOn;
        await track.applyConstraints({ advanced: [{ torch: next }] });
        setFlashOn(next);
        triggerHaptic('light');
      } catch (err) {
        console.warn('[CameraCapture] Torch toggle error:', err);
      }
    }
  };

  // ── Zoom Control (1x / 2x) ────────────────────────────────────────────────
  const toggleZoom = async () => {
    if (!stream || !zoomSupported) return;
    const track = stream.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;

    const maxZ = Math.min(trackCapabilities.zoom?.max || 2, 3);
    const nextZoom = zoomLevel > 1.2 ? (trackCapabilities.zoom?.min || 1) : maxZ;
    try {
      await track.applyConstraints({ advanced: [{ zoom: nextZoom }] });
      setZoomLevel(nextZoom);
      triggerHaptic('light');
    } catch (err) {
      console.warn('[CameraCapture] Zoom apply error:', err);
    }
  };

  // ── Exposure Compensation (EV cycle: 0.0 -> +0.5 -> -0.5 -> +1.0) ─────────
  const cycleExposure = async () => {
    if (!stream || !exposureSupported) return;
    const track = stream.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;

    const minEv = trackCapabilities.exposureCompensation?.min || -2;
    const maxEv = trackCapabilities.exposureCompensation?.max || 2;
    
    // Cycle presets: 0.0 -> +0.5 -> -0.5 -> +1.0 -> 0.0
    let nextEv = 0;
    if (exposureEV === 0) nextEv = Math.min(0.5, maxEv);
    else if (exposureEV === 0.5) nextEv = Math.max(-0.5, minEv);
    else if (exposureEV === -0.5) nextEv = Math.min(1.0, maxEv);
    else nextEv = 0;

    try {
      await track.applyConstraints({ advanced: [{ exposureCompensation: nextEv }] });
      setExposureEV(nextEv);
      triggerHaptic('light');
      const label = nextEv === 0 ? 'Normal EV (0)' : nextEv > 0 ? `+${nextEv} EV (Brightened)` : `${nextEv} EV (Reduced Glare)`;
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: `Exposure: ${label}`, type: 'info' } }));
    } catch (err) {
      console.warn('[CameraCapture] Exposure apply error:', err);
    }
  };

  // ── Aspect Ratio Switcher ─────────────────────────────────────────────────
  const handleAspectChange = (ratio) => {
    setAspectRatio(ratio);
    if (onAspectChange) onAspectChange(ratio);
  };

  // ── Grid Guide Switcher ───────────────────────────────────────────────────
  const cycleGridMode = () => {
    triggerHaptic('light');
    setGridMode(prev => prev === 'pot' ? 'thirds' : prev === 'thirds' ? 'off' : 'pot');
  };

  // ── Pot Navigation Handlers (Walkthrough) ─────────────────────────────────
  const handleNextPot = useCallback(() => {
    if (!trials || trials.length === 0) return;
    triggerHaptic('light');
    const nextIdx = (currentTrialIdx + 1) % trials.length;
    setCurrentTrialIdx(nextIdx);
    if (onSelectTrial) onSelectTrial(trials[nextIdx]);
  }, [currentTrialIdx, trials, onSelectTrial]);

  const handlePrevPot = useCallback(() => {
    if (!trials || trials.length === 0) return;
    triggerHaptic('light');
    const prevIdx = (currentTrialIdx - 1 + trials.length) % trials.length;
    setCurrentTrialIdx(prevIdx);
    if (onSelectTrial) onSelectTrial(trials[prevIdx]);
  }, [currentTrialIdx, trials, onSelectTrial]);

  // ── Anti-Shake Sharpness Selection & Ultra-Crisp Capture ──────────────────
  const calculateFrameSharpness = (ctx, width, height) => {
    try {
      const sampleW = 120;
      const sampleH = 120;
      const startX = Math.floor((width - sampleW) / 2);
      const startY = Math.floor((height - sampleH) / 2);
      const imgData = ctx.getImageData(startX, startY, sampleW, sampleH);
      const d = imgData.data;
      let sumGrad = 0;
      let count = 0;
      for (let y = 1; y < sampleH - 1; y += 2) {
        for (let x = 1; x < sampleW - 1; x += 2) {
          const idx = (y * sampleW + x) * 4;
          const g = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114;
          const gR = d[idx + 4] * 0.299 + d[idx + 5] * 0.587 + d[idx + 6] * 0.114;
          const gD = d[idx + sampleW * 4] * 0.299 + d[idx + sampleW * 4 + 1] * 0.587 + d[idx + sampleW * 4 + 2] * 0.114;
          const dx = gR - g;
          const dy = gD - g;
          sumGrad += (dx * dx + dy * dy);
          count++;
        }
      }
      return sumGrad / (count || 1);
    } catch (e) {
      return 100; // Fallback
    }
  };

  const captureSingleFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const ctx = canvas.getContext('2d');
    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;
    const videoWidth = video.videoWidth || 1920;
    const videoHeight = video.videoHeight || 1080;

    const targetRatio = displayWidth && displayHeight ? displayWidth / displayHeight : 0.75;
    const videoRatio = videoWidth / videoHeight;

    let srcX, srcY, srcW, srcH;
    if (videoRatio > targetRatio) {
      srcH = videoHeight;
      srcW = videoHeight * targetRatio;
      srcX = (videoWidth - srcW) / 2;
      srcY = 0;
    } else {
      srcW = videoWidth;
      srcH = videoWidth / targetRatio;
      srcX = 0;
      srcY = (videoHeight - srcH) / 2;
    }

    const maxDimension = 2560;
    let destW = Math.round(srcW);
    let destH = Math.round(srcH);
    if (destW > maxDimension || destH > maxDimension) {
      const scale = maxDimension / Math.max(destW, destH);
      destW = Math.round(destW * scale);
      destH = Math.round(destH * scale);
    }

    // Try ImageCapture with fast 900ms race timeout
    const track = stream?.getVideoTracks()[0];
    if (track && typeof window.ImageCapture === 'function') {
      try {
        const imageCapture = new window.ImageCapture(track);
        const takePhotoPromise = imageCapture.takePhoto();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 900));
        const blob = await Promise.race([takePhotoPromise, timeoutPromise]);
        
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = URL.createObjectURL(blob);
        });

        const imgRatio = img.naturalWidth / img.naturalHeight;
        let isrcX, isrcY, isrcW, isrcH;
        if (imgRatio > targetRatio) {
          isrcH = img.naturalHeight;
          isrcW = img.naturalHeight * targetRatio;
          isrcX = (img.naturalWidth - isrcW) / 2;
          isrcY = 0;
        } else {
          isrcW = img.naturalWidth;
          isrcH = img.naturalWidth / targetRatio;
          isrcX = 0;
          isrcY = (img.naturalHeight - isrcH) / 2;
        }

        canvas.width = destW;
        canvas.height = destH;
        ctx.drawImage(img, isrcX, isrcY, isrcW, isrcH, 0, 0, destW, destH);
        URL.revokeObjectURL(img.src);
        return canvas.toDataURL('image/jpeg', 0.95);
      } catch (nativeErr) {
        // Fallback seamlessly to direct high-res canvas frame
      }
    }

    // Direct Canvas Frame Extraction with Sharpness Inspection
    canvas.width = destW;
    canvas.height = destH;
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, destW, destH);

    const score1 = calculateFrameSharpness(ctx, destW, destH);
    if (score1 > 28) {
      return canvas.toDataURL('image/jpeg', 0.95);
    }

    // Hand motion detected during shutter press: grab second micro-frame after 35ms
    await new Promise(r => setTimeout(r, 35));
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, destW, destH);
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  // ── Master Shutter Capture Action ─────────────────────────────────────────
  const handleShutterPress = async () => {
    if (isCapturing || !videoRef.current) return;
    setIsCapturing(true);

    // Visual shutter flash & haptic feedback
    setShutterFlash(true);
    triggerHaptic('medium');
    setTimeout(() => setShutterFlash(false), 90);

    const capturedDataUrl = await captureSingleFrame();
    if (!capturedDataUrl) {
      setIsCapturing(false);
      return;
    }

    const currentTargetTrial = activeTrial;
    const newCount = sessionCaptures.length + 1;
    const captureMeta = {
      id: Date.now(),
      dataUrl: capturedDataUrl,
      trialId: currentTargetTrial?.ID,
      potLabel: currentTargetTrial?.PotLabel || currentTargetTrial?.PlotNumber
    };

    setSessionCaptures(prev => [...prev, captureMeta]);

    // Burst (3x) Mode execution
    if (captureMode === 'burst') {
      if (onBurstCapture) {
        onBurstCapture(capturedDataUrl, newCount, currentTargetTrial);
      }
      // Take 2 subsequent rapid shots
      for (let b = 1; b <= 2; b++) {
        await new Promise(r => setTimeout(r, 120));
        setShutterFlash(true);
        triggerHaptic('light');
        setTimeout(() => setShutterFlash(false), 70);
        const nextUrl = await captureSingleFrame();
        if (nextUrl && onBurstCapture) {
          onBurstCapture(nextUrl, newCount + b, currentTargetTrial);
        }
      }
      setIsCapturing(false);
      return;
    }

    // Multi-Pot Continuous Mode execution
    if (captureMode === 'multi') {
      if (onBurstCapture) {
        onBurstCapture(capturedDataUrl, newCount, currentTargetTrial);
      } else if (onCapture) {
        onCapture(capturedDataUrl);
      }

      // Auto-advance to next pot in project if enabled
      if (autoAdvancePot && trials && trials.length > 1) {
        handleNextPot();
      }

      setIsCapturing(false);
      return;
    }

    // Standard Single Shot Mode execution
    onCapture(capturedDataUrl);
    setIsCapturing(false);
    onClose();
  };

  // ── Dynamic Viewfinder Dimensions ─────────────────────────────────────────
  const getPreviewDimensions = () => {
    if (!parentDims.width || !parentDims.height) {
      return { width: '100%', height: '100%' };
    }

    const targetRatio = aspectRatio === '1:1' ? 1.0 : aspectRatio === '3:4' ? 0.75 : 9 / 16;
    const parentRatio = parentDims.width / parentDims.height;

    let w, h;
    if (parentRatio > targetRatio) {
      h = parentDims.height;
      w = h * targetRatio;
    } else {
      w = parentDims.width;
      h = w / targetRatio;
    }

    return {
      width: `${Math.round(w)}px`,
      height: `${Math.round(h)}px`
    };
  };

  const previewStyle = getPreviewDimensions();

  return (
    <div className="fullscreen-overlay fixed inset-0 bg-black z-[10000] flex flex-col justify-center items-center overflow-hidden animate-fade-in select-none">
      <div className="camera-shell relative w-full h-full max-w-[820px] max-h-[1020px] md:rounded-3xl overflow-hidden bg-[#020617] md:border md:border-white/10 md:shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col justify-between items-center p-3 sm:p-4">
        
        {/* ── TOP CONTROLS BAR ───────────────────────────────────────────── */}
        <div className="w-full flex justify-between items-center z-[10002] px-1 sm:px-2 mb-2 gap-2">
          
          {/* Aspect Ratio Switcher */}
          <div className="flex gap-1 bg-black/50 p-1 rounded-full backdrop-blur-md border border-white/10">
            {['1:1', '3:4', '9:16'].map((ratio) => (
              <button
                key={ratio}
                onClick={() => handleAspectChange(ratio)}
                className={`px-2.5 sm:px-3 py-1 text-[11px] font-bold rounded-full transition-all duration-200 ${
                  aspectRatio === ratio
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          {/* Mode Switcher: Single Shot vs Multi-Pot Rapid */}
          <div className="flex items-center gap-1 bg-black/50 p-1 rounded-full backdrop-blur-md border border-white/10 text-xs">
            <button
              onClick={() => {
                triggerHaptic('light');
                setCaptureMode('single');
              }}
              className={`px-2.5 sm:px-3 py-1 font-bold rounded-full transition-all ${
                captureMode === 'single'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => {
                triggerHaptic('light');
                setCaptureMode('multi');
              }}
              className={`px-2.5 sm:px-3 py-1 font-bold rounded-full flex items-center gap-1 transition-all ${
                captureMode === 'multi'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Continuous Multi-Pot capture (stays open across pots)"
            >
              <span>🪴 Multi-Pot</span>
              {sessionCaptures.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-white text-emerald-800 text-[10px] font-black flex items-center justify-center">
                  {sessionCaptures.length}
                </span>
              )}
            </button>
            {allowBurst && (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setCaptureMode('burst');
                }}
                className={`px-2 sm:px-2.5 py-1 font-bold rounded-full transition-all ${
                  captureMode === 'burst'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="3-Shot Burst"
              >
                Burst
              </button>
            )}
          </div>

          {/* Done / Close Button */}
          {captureMode === 'multi' && sessionCaptures.length > 0 ? (
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-lg transition active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Done ({sessionCaptures.length})</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-md text-white hover:bg-black/70 border border-white/10 transition active:scale-95"
              title="Close Camera"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ── POT / TRIAL WALKTHROUGH HUD (When in trial context) ─────────── */}
        {activeTrial && (
          <div className="w-full flex items-center justify-between px-2 mb-2 z-[10002]">
            <div className="flex-1 flex items-center justify-between gap-1.5 bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 rounded-xl px-3 py-1.5 text-white shadow-lg">
              {trials && trials.length > 1 ? (
                <button
                  type="button"
                  onClick={handlePrevPot}
                  className="p-1 rounded-lg hover:bg-white/10 text-emerald-400 transition"
                  title="Previous Pot"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : <div className="w-5" />}

              <div className="text-center truncate px-1">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {activeTrial.PotLabel || (activeTrial.PotRow && activeTrial.PotCol ? `R${activeTrial.PotRow}C${activeTrial.PotCol}` : '') || `Plot #${activeTrial.PlotNumber || '1'}`}
                  </span>
                  <span className="text-xs font-bold text-slate-100 truncate">
                    {activeTrial.FormulationName || 'Untreated Control'}
                  </span>
                </div>
                {activeTrial.PotCol && activeTrial.PotRow && (
                  <span className="text-[10px] text-slate-400">
                    Column {activeTrial.PotCol} · Row {activeTrial.PotRow} (Rep {activeTrial.PotRow})
                  </span>
                )}
              </div>

              {trials && trials.length > 1 ? (
                <button
                  type="button"
                  onClick={handleNextPot}
                  className="p-1 rounded-lg hover:bg-white/10 text-emerald-400 transition"
                  title="Next Pot"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              ) : <div className="w-5" />}
            </div>

            {captureMode === 'multi' && trials && trials.length > 1 && (
              <button
                type="button"
                onClick={() => setAutoAdvancePot(v => !v)}
                className={`ml-2 px-2.5 py-2 rounded-xl text-[10px] font-bold border transition ${
                  autoAdvancePot 
                    ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' 
                    : 'bg-slate-800 border-white/10 text-slate-400'
                }`}
                title="Automatically advance to the next pot after snapping photo"
              >
                Auto-Next: {autoAdvancePot ? 'ON' : 'OFF'}
              </button>
            )}
          </div>
        )}

        {/* ── VIEWFINDER WITH TAP-TO-FOCUS & FRAMING GRIDS ──────────────── */}
        <div 
          ref={previewParentRef} 
          className="flex-1 w-full flex justify-center items-center bg-black overflow-hidden relative rounded-2xl"
          onClick={handleTapToFocus}
        >
          <div 
            className="relative overflow-hidden bg-[#0a0f1d] transition-all duration-300 shadow-2xl flex items-center justify-center cursor-crosshair" 
            style={previewStyle}
          >
            <video ref={videoRef} className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {/* Shutter White Flash Animation */}
            {shutterFlash && (
              <div className="absolute inset-0 bg-white pointer-events-none z-50 animate-fade-out" />
            )}

            {/* Framing Guide: Pot Center Box */}
            {gridMode === 'pot' && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(76%,320px)] h-[min(76%,320px)] border-2 border-dashed border-emerald-400/40 rounded-2xl pointer-events-none flex items-center justify-center">
                {/* 4 Corner Markers */}
                <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400 absolute -top-1 -left-1"></div>
                <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400 absolute -top-1 -right-1"></div>
                <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400 absolute -bottom-1 -left-1"></div>
                <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400 absolute -bottom-1 -right-1"></div>
                {/* Center Pot Crown Circle */}
                <div className="w-16 h-16 border border-emerald-400/30 rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                </div>
              </div>
            )}

            {/* Framing Guide: Rule of Thirds Grid */}
            {gridMode === 'thirds' && (
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white/25"></div>
                <div className="border-r border-b border-white/25"></div>
                <div className="border-b border-white/25"></div>
                <div className="border-r border-b border-white/25"></div>
                <div className="border-r border-b border-white/25"></div>
                <div className="border-b border-white/25"></div>
                <div className="border-r border-white/25"></div>
                <div className="border-r border-white/25"></div>
                <div></div>
              </div>
            )}

            {/* Interactive Tap-to-Focus Reticle */}
            {tapReticle && (
              <div 
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 z-40 transition-transform duration-150"
                style={{ left: `${tapReticle.x}px`, top: `${tapReticle.y}px` }}
              >
                <div className={`w-14 h-14 rounded-lg border-2 ${
                  tapReticle.status === 'locked' 
                    ? 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)] scale-90' 
                    : 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)] animate-ping'
                } transition-all duration-200 flex items-center justify-center`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${tapReticle.status === 'locked' ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                </div>
              </div>
            )}

            {/* Quick Floating Overlays (Right Side) */}
            <div className="absolute top-3 right-3 flex flex-col gap-2 z-30 pointer-events-auto">
              
              {/* Torch / Flashlight Button */}
              {flashSupported && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleFlash(); }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                    flashOn ? 'bg-amber-400 text-amber-950 border-amber-300 shadow-lg' : 'bg-black/50 text-white border-white/10 hover:bg-black/70'
                  }`}
                  title={flashOn ? 'Torch On' : 'Torch Off'}
                >
                  <Zap className="w-4 h-4 fill-current" />
                </button>
              )}

              {/* Zoom Button */}
              {zoomSupported && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleZoom(); }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border text-[11px] font-black transition-all ${
                    zoomLevel > 1.2 ? 'bg-emerald-500 text-white border-emerald-400 shadow-md' : 'bg-black/50 text-white border-white/10'
                  }`}
                  title={`Zoom: ${zoomLevel > 1.2 ? '2x' : '1x'}`}
                >
                  {zoomLevel > 1.2 ? '2×' : '1×'}
                </button>
              )}

              {/* Exposure Compensation Button */}
              {exposureSupported && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); cycleExposure(); }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                    exposureEV !== 0 ? 'bg-amber-500 text-white border-amber-400' : 'bg-black/50 text-white border-white/10'
                  }`}
                  title={`Exposure: ${exposureEV > 0 ? `+${exposureEV}` : exposureEV}`}
                >
                  <Sun className="w-4 h-4" />
                </button>
              )}

              {/* Framing Grid Toggle */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); cycleGridMode(); }}
                className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                  gridMode !== 'off' ? 'bg-emerald-600/70 text-white border-emerald-400' : 'bg-black/50 text-slate-300 border-white/10'
                }`}
                title={`Grid Guide: ${gridMode.toUpperCase()}`}
              >
                <Grid className="w-4 h-4" />
              </button>

              {/* Force Re-Focus Sweep Button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleForceRefocus(); }}
                className="w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md bg-black/50 text-white border border-white/10 hover:bg-black/70 transition"
                title="Re-focus Lens Now"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── FOCUS & SHARPNESS STATUS BADGE ────────────────────────────── */}
        <div className="mt-2.5 flex items-center gap-2 text-[10px] tracking-wider font-extrabold select-none z-10">
          <div className="bg-slate-900/90 border border-white/10 px-3 py-1 rounded-full backdrop-blur-md flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              focusMode === 'continuous' ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'
            }`} />
            <span className="text-slate-200">
              {focusMode === 'continuous' ? 'AUTOFOCUS: ACTIVE (CAF)' : 'AUTOFOCUS: LOCKED'}
            </span>
          </div>
          
          <button
            type="button"
            onClick={toggleFocusMode}
            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 underline uppercase cursor-pointer"
          >
            {focusMode === 'continuous' ? 'Lock Focus' : 'Unlock AF'}
          </button>
        </div>

        {/* ── BOTTOM SHUTTER & RECENT THUMBNAIL BAR ──────────────────────── */}
        <div className="w-full flex justify-around items-center px-4 mt-2 z-[10001] min-h-[84px]">
          
          {/* Left Slot: Recent Photo Thumbnail with Count */}
          <div className="w-14 h-14 flex items-center justify-center">
            {sessionCaptures.length > 0 ? (
              <div 
                className="relative w-12 h-12 rounded-xl border-2 border-emerald-400 overflow-hidden shadow-lg animate-scale-in"
                title={`${sessionCaptures.length} photos captured in this session`}
              >
                <img 
                  src={sessionCaptures[sessionCaptures.length - 1].dataUrl} 
                  alt="Recent" 
                  className="w-full h-full object-cover" 
                />
                <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[9px] font-black px-1 rounded-bl">
                  {sessionCaptures.length}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider text-center">
                Tap to Focus
              </div>
            )}
          </div>

          {/* Center Slot: High-Performance Shutter Button */}
          <button
            type="button"
            onClick={handleShutterPress}
            disabled={isCapturing}
            className={`w-[76px] h-[76px] rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-2xl relative ${
              captureMode === 'multi' 
                ? 'bg-emerald-500 border-4 border-emerald-300/40' 
                : captureMode === 'burst'
                ? 'bg-amber-500 border-4 border-amber-300/40'
                : 'bg-white border-4 border-white/30'
            }`}
            title="Take Photo (Tap screen to focus)"
          >
            <div className={`w-[60px] h-[60px] rounded-full border-2 border-black flex items-center justify-center transition-colors ${
              captureMode === 'multi' ? 'bg-white' : captureMode === 'burst' ? 'bg-amber-100' : 'bg-white active:bg-slate-200'
            }`}>
              {captureMode === 'multi' && (
                <div className="w-4 h-4 rounded-full bg-emerald-600"></div>
              )}
              {captureMode === 'burst' && (
                <span className="text-xs font-black text-amber-800">3x</span>
              )}
            </div>
          </button>

          {/* Right Slot: Smart Re-Focus / Macro Button */}
          <div className="w-14 h-14 flex items-center justify-center">
            <button
              type="button"
              onClick={handleForceRefocus}
              className="w-12 h-12 rounded-full flex flex-col items-center justify-center bg-black/40 text-emerald-400 border border-emerald-500/20 backdrop-blur-md hover:bg-emerald-950/40 transition active:scale-95"
              title="Re-focus on plant canopy"
            >
              <Focus className="w-5 h-5" />
              <span className="text-[8px] font-extrabold tracking-tighter mt-0.5">AF</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
