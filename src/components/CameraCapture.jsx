import React, { useEffect, useRef, useState } from 'react';
import { X, Zap } from 'lucide-react';

export default function CameraCapture({ isOpen = true, onClose, onCapture, initialAspectRatio = '3:4', onAspectChange }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewParentRef = useRef(null);
  
  const [stream, setStream] = useState(null);
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio || '3:4');
  const [parentDims, setParentDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let activeStream = null;

    const startCamera = async (c) => {
      try {
        const s = await navigator.mediaDevices.getUserMedia(c);
        activeStream = s;
        setStream(s);

        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.setAttribute('playsinline', true);
          await videoRef.current.play();
        }

        // Apply advanced hardware constraints on the active video track (autofocus, raw frame resolution)
        const track = s.getVideoTracks()[0];
        if (track && track.applyConstraints) {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          const constraintsToApply = {};

          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            constraintsToApply.focusMode = 'continuous';
          }
          if (capabilities.resizeMode && capabilities.resizeMode.includes('none')) {
            constraintsToApply.resizeMode = 'none';
          }

          if (Object.keys(constraintsToApply).length > 0) {
            try {
              await track.applyConstraints(constraintsToApply);
              console.log("[CameraCapture] Track hardware constraints applied successfully:", constraintsToApply);
            } catch (trackErr) {
              console.warn("[CameraCapture] Non-critical track constraints application failed:", trackErr);
            }
          }
          
          if (capabilities.torch) {
            setFlashSupported(true);
          }
        }
      } catch (err) {
        console.warn("Camera attempt failed:", c, err);
        // Step-down constraints fallback to preserve highest possible resolution
        if (c && c.video && typeof c.video === 'object') {
          if (c.video.width && c.video.width.ideal === 3840) {
            // Fall back to 1080p with focus constraints
            await startCamera({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                focusMode: { ideal: 'continuous' },
                resizeMode: { ideal: 'none' }
              }
            });
          } else if (c.video.width && c.video.width.ideal === 1920) {
            // Fall back to 720p with focus constraints
            await startCamera({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: { ideal: 'continuous' }
              }
            });
          } else if (c.video.width && c.video.width.ideal === 1280) {
            // Fall back to generic environment
            await startCamera({
              video: { 
                facingMode: { ideal: 'environment' },
                focusMode: { ideal: 'continuous' }
              }
            });
          } else {
            // Fall back to default video: true
            await startCamera({ video: true });
          }
        } else {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Camera access denied or unavailable.', type: 'error' } }));
          onClose();
        }
      }
    };

    const initialConstraints = {
      video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          focusMode: { ideal: 'continuous' },
          resizeMode: { ideal: 'none' }
      }
    };
    startCamera(initialConstraints);

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => {
          try { track.applyConstraints({ advanced: [{ torch: false }] }); } catch(_) {}
          track.stop();
        });
      }
    };
  }, []);

  // Monitor parent dimensions to dynamically size the aspect ratio box
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

  const toggleFlash = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      try {
        const newFlashState = !flashOn;
        await track.applyConstraints({ advanced: [{ torch: newFlashState }] });
        setFlashOn(newFlashState);
      } catch (err) {
        console.warn('Flash toggle failed', err);
      }
    }
  };

  const handleAspectChange = (ratio) => {
    setAspectRatio(ratio);
    if (onAspectChange) {
      onAspectChange(ratio);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (!displayWidth || !displayHeight || !videoWidth || !videoHeight) {
      // Fallback if dimensions are not resolved
      canvas.width = videoWidth || 1920;
      canvas.height = videoHeight || 1080;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      onCapture(dataUrl);
      onClose();
      return;
    }

    const targetRatio = displayWidth / displayHeight;

    // Try using ImageCapture API for native Still Photo quality (full sensor resolution)
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track && typeof window.ImageCapture === 'function') {
        try {
          const imageCapture = new window.ImageCapture(track);
          // Request still image capture
          const blob = await imageCapture.takePhoto();
          const img = new Image();
          
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
          });

          // Crop high-resolution image to match viewfinder aspect ratio
          const imgRatio = img.naturalWidth / img.naturalHeight;
          let srcX, srcY, srcW, srcH;

          if (imgRatio > targetRatio) {
            srcH = img.naturalHeight;
            srcW = img.naturalHeight * targetRatio;
            srcX = (img.naturalWidth - srcW) / 2;
            srcY = 0;
          } else {
            srcW = img.naturalWidth;
            srcH = img.naturalWidth / targetRatio;
            srcX = 0;
            srcY = (img.naturalHeight - srcH) / 2;
          }

          let destW = Math.round(srcW);
          let destH = Math.round(srcH);
          
          // Cap at 3840px (Ultra HD 4K still image size) for browser canvas stability
          const capDimension = 3840;
          if (destW > capDimension || destH > capDimension) {
            const scale = capDimension / Math.max(destW, destH);
            destW = Math.round(destW * scale);
            destH = Math.round(destH * scale);
          }

          canvas.width = destW;
          canvas.height = destH;
          ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, destW, destH);

          URL.revokeObjectURL(img.src);
          onCapture(canvas.toDataURL('image/jpeg', 0.96));
          onClose();
          return;
        } catch (captureErr) {
          console.warn("[CameraCapture] Native Still ImageCapture failed, falling back to stream capture:", captureErr);
        }
      }
    }

    // Direct high-resolution crop based on viewport aspect ratio
    const videoRatio = videoWidth / videoHeight;
    let srcX, srcY, srcW, srcH;

    if (videoRatio > targetRatio) {
      // Video is wider than the target aspect ratio -> crop width
      srcH = videoHeight;
      srcW = videoHeight * targetRatio;
      srcX = (videoWidth - srcW) / 2;
      srcY = 0;
    } else {
      // Video is taller than the target aspect ratio -> crop height
      srcW = videoWidth;
      srcH = videoWidth / targetRatio;
      srcX = 0;
      srcY = (videoHeight - srcH) / 2;
    }

    // Set destination canvas size matching full crop resolution (capped for safety/memory)
    const maxDimension = 2560;
    let destW = Math.round(srcW);
    let destH = Math.round(srcH);
    if (destW > maxDimension || destH > maxDimension) {
      const resizeScale = maxDimension / Math.max(destW, destH);
      destW = Math.round(destW * resizeScale);
      destH = Math.round(destH * resizeScale);
    }

    canvas.width = destW;
    canvas.height = destH;

    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, destW, destH);

    // High quality JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    onCapture(dataUrl);
    onClose();
  };

  // Compute exact dimensions for the letterboxed/centered video preview
  const getPreviewDimensions = () => {
    if (!parentDims.width || !parentDims.height) {
      return { width: '100%', height: '100%' };
    }

    const targetRatio = aspectRatio === '1:1' ? 1.0 : aspectRatio === '3:4' ? 0.75 : 9 / 16;
    const parentRatio = parentDims.width / parentDims.height;

    let w, h;
    if (parentRatio > targetRatio) {
      // Parent is wider than the target ratio -> height is the limiting factor
      h = parentDims.height;
      w = h * targetRatio;
    } else {
      // Parent is taller than the target ratio -> width is the limiting factor
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
    <div className="fullscreen-overlay fixed inset-0 bg-black z-[10000] flex flex-col justify-center items-center overflow-hidden animate-fade-in">
      <div className="camera-shell relative w-[min(98vw,760px)] h-[92%] max-h-[960px] rounded-3xl overflow-hidden bg-[#020617] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.45)] flex flex-col justify-between items-center p-4">
        
        {/* Top Controls Bar */}
        <div className="w-full flex justify-between items-center z-[10002] px-2 mb-2">
          <div className="flex gap-2 bg-black/40 p-1 rounded-full backdrop-blur-md">
            {['1:1', '3:4', '9:16'].map((ratio) => (
              <button
                key={ratio}
                onClick={() => handleAspectChange(ratio)}
                className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all duration-200 ${
                  aspectRatio === ratio
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-md text-white hover:bg-black/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Preview Container with selected aspect ratio */}
        <div ref={previewParentRef} className="flex-1 w-full flex justify-center items-center bg-black overflow-hidden relative rounded-2xl">
          <div 
            className="relative overflow-hidden bg-[#0a0f1d] transition-all duration-300 shadow-2xl flex items-center justify-center" 
            style={previewStyle}
          >
            <video ref={videoRef} className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {/* Target Box Overlay */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(80%,320px)] h-[min(80%,320px)] border border-white/30 rounded-xl pointer-events-none flex items-center justify-center">
               <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-500 absolute top-[-2px] left-[-2px]"></div>
               <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-500 absolute top-[-2px] right-[-2px]"></div>
               <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-500 absolute bottom-[-2px] left-[-2px]"></div>
               <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-500 absolute bottom-[-2px] right-[-2px]"></div>
               <div className="w-10 h-10 border border-white/20 rounded-full flex items-center justify-center">
                   <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
               </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="w-full flex justify-around items-center px-4 mt-4 z-[10001] min-h-[80px]">
          <div className="w-12 h-12 flex items-center justify-center">
             {flashSupported && (
               <button
                  onClick={toggleFlash}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${flashOn ? 'bg-yellow-400 text-yellow-900' : 'bg-black/40 text-white backdrop-blur-md'}`}
               >
                 <Zap className="w-6 h-6" />
               </button>
             )}
          </div>

          <button
            onClick={handleCapture}
            className="w-[72px] h-[72px] rounded-full bg-white border-4 border-white/30 flex items-center justify-center active:scale-90 transition-transform shadow-xl hover:bg-slate-100"
          >
            <div className="w-[58px] h-[58px] rounded-full border-2 border-black bg-white active:bg-slate-200 transition-colors"></div>
          </button>

          <div className="w-12 h-12"></div> {/* Spacer for flex balance */}
        </div>
      </div>
    </div>
  );
}
