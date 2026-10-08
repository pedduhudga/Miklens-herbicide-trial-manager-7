import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Abstraction for Camera Capture, detecting if native Capacitor or Web Fallback
export async function takeNativePhoto() {
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera
    });
    return image.dataUrl;
  } catch (error) {
    console.warn("Native camera failed, or user canceled.", error);
    throw error;
  }
}

// Abstraction to check native environment
export function isNativeApp() {
  return typeof window !== 'undefined' && Boolean(window.Capacitor && window.Capacitor.isNative);
}

// Check if app is running in Standalone PWA mode
export function isStandalonePWA() {
  if (typeof window === 'undefined') return false;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIOSStandalone = window.navigator.standalone === true;
  return isStandalone || isIOSStandalone;
}

/**
 * Trigger tactile mobile haptic feedback
 * @param {'selection'|'light'|'medium'|'heavy'|'success'|'warning'|'error'} type 
 */
export function triggerHaptic(type = 'light') {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const patterns = {
        selection: [8],
        light: [15],
        medium: [30],
        heavy: [50],
        success: [15, 60, 20],
        warning: [25, 50, 25],
        error: [40, 50, 40, 50, 40]
      };
      navigator.vibrate(patterns[type] || [15]);
    }
  } catch (e) {
    // Graceful fallback if unsupported
  }
}

// Screen Wake Lock State Tracker
let wakeLockSentinel = null;

/**
 * Request Screen Wake Lock (keeps mobile display awake in the field)
 */
export async function requestWakeLock() {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      if (wakeLockSentinel !== null && !wakeLockSentinel.released) {
        return true;
      }
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Screen Wake Lock active (Field Mode)');
      
      wakeLockSentinel.addEventListener('release', () => {
        console.log('[WakeLock] Screen Wake Lock was released');
        wakeLockSentinel = null;
      });

      // Auto-reacquire on visibility change
      if (typeof document !== 'undefined') {
        const handleVisibilityChange = async () => {
          if (wakeLockSentinel === null && document.visibilityState === 'visible') {
            try {
              wakeLockSentinel = await navigator.wakeLock.request('screen');
            } catch (e) {}
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange, { once: true });
      }
      return true;
    }
  } catch (err) {
    console.warn('[WakeLock] Could not acquire Screen Wake Lock:', err.message);
  }
  return false;
}

/**
 * Release Screen Wake Lock
 */
export async function releaseWakeLock() {
  if (wakeLockSentinel !== null) {
    try {
      await wakeLockSentinel.release();
    } catch (e) {}
    wakeLockSentinel = null;
    console.log('[WakeLock] Screen Wake Lock released');
    return true;
  }
  return false;
}

/**
 * Check if Screen Wake Lock is supported
 */
export function isWakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Check if Screen Wake Lock is currently active
 */
export function isWakeLockActive() {
  return wakeLockSentinel !== null && !wakeLockSentinel.released;
}

/**
 * Native App Badging API (Displays offline pending sync count on home screen icon)
 * @param {number} count 
 */
export async function setAppBadgeCount(count = 0) {
  try {
    if (typeof navigator !== 'undefined') {
      if (count > 0 && 'setAppBadge' in navigator) {
        await navigator.setAppBadge(count);
      } else if (count === 0 && 'clearAppBadge' in navigator) {
        await navigator.clearAppBadge();
      }
    }
  } catch (e) {
    // Unsupported or permission denied in iframe
  }
}

/**
 * Clear App Badge
 */
export async function clearAppBadge() {
  try {
    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
    }
  } catch (e) {}
}

export const isStandaloneApp = isStandalonePWA;

/**
 * Native Web Share API with clipboard fallback
 * @param {{ title: string, text?: string, url?: string }} data 
 */
export async function nativeShare({ title, text, url }) {
  triggerHaptic('selection');
  const shareUrl = url || (typeof window !== 'undefined' ? window.location?.href : '');
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: title || 'Miklens Trial Manager',
        text: text || '',
        url: shareUrl
      });
      triggerHaptic('success');
      return { success: true, shared: true, method: 'share' };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { success: false, shared: false, method: 'cancelled' };
      }
    }
  }

  // Fallback to clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(`${title ? title + ' - ' : ''}${shareUrl}`);
      triggerHaptic('success');
      return { success: true, shared: true, method: 'clipboard' };
    }
  } catch (e) {}
  
  return { success: false, shared: false, method: 'unsupported' };
}

/**
 * Get device network connection quality
 */
export function getNetworkQuality() {
  if (typeof navigator === 'undefined') return { online: true, isOnline: true, isSlow: false, type: 'unknown' };
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = conn?.effectiveType || '4g';
  const isOnline = Boolean(navigator.onLine);
  return {
    online: isOnline,
    isOnline,
    effectiveType,
    isSlow: effectiveType === 'slow-2g' || effectiveType === '2g',
    downlink: conn?.downlink ?? 10,
    saveData: Boolean(conn?.saveData),
    rtt: conn?.rtt ?? 50
  };
}
