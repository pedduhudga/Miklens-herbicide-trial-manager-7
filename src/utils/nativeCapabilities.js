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
    return window.Capacitor && window.Capacitor.isNative;
}

/**
 * Trigger subtle haptic feedback on mobile devices
 * @param {'light'|'medium'|'heavy'|'success'|'warning'|'error'} type 
 */
export function triggerHaptic(type = 'light') {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const patterns = {
        light: [10],
        medium: [25],
        heavy: [45],
        success: [15, 50, 20],
        warning: [30, 40, 30],
        error: [50, 50, 50]
      };
      navigator.vibrate(patterns[type] || [15]);
    }
  } catch (e) {
    // Graceful fallback if unsupported
  }
}
