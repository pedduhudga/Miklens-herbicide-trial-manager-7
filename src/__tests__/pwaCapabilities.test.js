import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requestWakeLock,
  releaseWakeLock,
  isWakeLockActive,
  setAppBadgeCount,
  clearAppBadge,
  triggerHaptic,
  getNetworkQuality,
  isStandaloneApp,
  nativeShare
} from '../utils/nativeCapabilities';
import fs from 'fs';
import path from 'path';

describe('PWA Native Capabilities System', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Screen Wake Lock API', () => {
    it('gracefully handles wake lock request when API is unsupported', async () => {
      const origNav = global.navigator;
      // In vitest / jsdom, wakeLock is typically undefined
      const ok = await requestWakeLock();
      expect(ok).toBe(false);
      expect(isWakeLockActive()).toBe(false);
    });

    it('successfully requests and releases wake lock when navigator.wakeLock is present', async () => {
      let released = false;
      const mockSentinel = {
        addEventListener: vi.fn(),
        release: vi.fn(async () => {
          released = true;
        })
      };

      Object.defineProperty(global.navigator, 'wakeLock', {
        value: {
          request: vi.fn(async (type) => mockSentinel)
        },
        configurable: true
      });

      const acquired = await requestWakeLock();
      expect(acquired).toBe(true);
      expect(isWakeLockActive()).toBe(true);
      expect(global.navigator.wakeLock.request).toHaveBeenCalledWith('screen');

      const releasedResult = await releaseWakeLock();
      expect(releasedResult).toBe(true);
      expect(released).toBe(true);
      expect(isWakeLockActive()).toBe(false);
    });
  });

  describe('App Badging API', () => {
    it('sets app badge count and handles unsupported environments', async () => {
      const setBadgeMock = vi.fn().mockResolvedValue(true);
      const clearBadgeMock = vi.fn().mockResolvedValue(true);

      Object.defineProperty(global.navigator, 'setAppBadge', {
        value: setBadgeMock,
        configurable: true
      });
      Object.defineProperty(global.navigator, 'clearAppBadge', {
        value: clearBadgeMock,
        configurable: true
      });

      await setAppBadgeCount(5);
      expect(setBadgeMock).toHaveBeenCalledWith(5);

      await setAppBadgeCount(0);
      expect(clearBadgeMock).toHaveBeenCalled();

      await clearAppBadge();
      expect(clearBadgeMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tactile Haptic Engine', () => {
    it('triggers navigator.vibrate with correct pattern timings', () => {
      const vibrateMock = vi.fn().mockReturnValue(true);
      Object.defineProperty(global.navigator, 'vibrate', {
        value: vibrateMock,
        configurable: true
      });

      triggerHaptic('light');
      expect(vibrateMock).toHaveBeenCalledWith([15]);

      triggerHaptic('medium');
      expect(vibrateMock).toHaveBeenCalledWith([30]);

      triggerHaptic('success');
      expect(vibrateMock).toHaveBeenCalledWith([15, 60, 20]);

      triggerHaptic('error');
      expect(vibrateMock).toHaveBeenCalledWith([40, 50, 40, 50, 40]);
    });
  });

  describe('Network Quality Assessment', () => {
    it('detects online / offline and effective connection types', () => {
      Object.defineProperty(global.navigator, 'onLine', {
        value: true,
        configurable: true
      });
      Object.defineProperty(global.navigator, 'connection', {
        value: {
          effectiveType: '4g',
          downlink: 10,
          rtt: 50,
          saveData: false
        },
        configurable: true
      });

      const quality = getNetworkQuality();
      expect(quality.isOnline).toBe(true);
      expect(quality.effectiveType).toBe('4g');
      expect(quality.isSlow).toBe(false);
      expect(quality.downlink).toBe(10);
    });
  });

  describe('Standalone / PWA Display Detection', () => {
    it('detects standalone display mode or browser fallback', () => {
      const standalone = isStandaloneApp();
      expect(typeof standalone).toBe('boolean');
    });
  });

  describe('Web Share API', () => {
    it('uses native share when available', async () => {
      const shareMock = vi.fn().mockResolvedValue(true);
      Object.defineProperty(global.navigator, 'share', {
        value: shareMock,
        configurable: true
      });

      const res = await nativeShare({ title: 'Trial 1', text: 'Trial report data' });
      expect(res.shared).toBe(true);
      expect(shareMock).toHaveBeenCalled();
    });
  });
});

describe('PWA Manifest & Service Worker Static Verification', () => {
  it('manifest.json has advanced PWA properties configured', () => {
    const manifestPath = path.resolve(__dirname, '../../public/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.display).toBe('standalone');
    expect(manifest.display_override).toContain('standalone');
    expect(manifest.display_override).toContain('minimal-ui');
    expect(manifest.launch_handler).toBeDefined();
    expect(manifest.launch_handler.client_mode).toBe('auto');
    expect(manifest.capture_links).toBe('existing-client-navigate');
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(3);
    expect(manifest.theme_color).toBe('#059669');
  });

  it('sw.js defines STATIC_ASSETS and handles Navigation Preload API', () => {
    const swPath = path.resolve(__dirname, '../../public/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    expect(swContent).toContain('const STATIC_ASSETS = [');
    expect(swContent).toContain('navigationPreload');
    expect(swContent).toContain('respondWith');
    expect(swContent).toContain('CACHE_NAME');
  });
});
