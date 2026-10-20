/**
 * Atmospheric Weather FX Engine
 * High-performance, GPU-accelerated microclimate visual effects:
 * - Rain (animated diagonal raindrops & splash ripples)
 * - Thunderstorm (electric ambient lightning flashes, thunder clouds & heavy rain sheets)
 * - Wind (aerodynamic wind ribbons, breeze streams & tumbling leaves/drift particles)
 * - Hot Sun (pulsating solar corona, radiant golden flares & thermal heat haze waves)
 * - Night / Inversion (twinkling star constellations, crescent moon & low-drifting nocturnal mist)
 * - Frost / Freezing (floating hexagonal ice crystals, crisp winter chill aura)
 * - Optimal Spray Window (fresh emerald aura & dewdrop sparkle particles)
 */

import React, { useMemo } from 'react';

export default function AtmosphericWeatherFX({ 
  effect = 'optimal', // 'thunderstorm' | 'rain' | 'wind' | 'sun' | 'night' | 'frost' | 'optimal' | 'none'
  className = '',
  intensity = 'normal', // 'subtle' | 'normal' | 'dramatic'
  badge = null // optional text string to display as weather tag in top-right
}) {
  if (effect === 'none') return null;

  // Staggered rain streaks for realistic natural depth
  const raindrops = useMemo(() => {
    const count = effect === 'thunderstorm' ? 32 : 22;
    return Array.from({ length: count }).map((_, i) => ({
      left: `${(i * 3.7 + (i % 3) * 1.8) % 98}%`,
      delay: `${(i * 0.14) % 1.9}s`,
      duration: `${effect === 'thunderstorm' ? 0.6 + (i % 3) * 0.12 : 0.8 + (i % 4) * 0.18}s`,
      height: `${effect === 'thunderstorm' ? 22 + (i % 3) * 12 : 14 + (i % 3) * 8}px`,
      opacity: 0.35 + (i % 5) * 0.12
    }));
  }, [effect]);

  // Staggered stars for night mode
  const stars = useMemo(() => {
    return Array.from({ length: 22 }).map((_, i) => ({
      left: `${(i * 5.1 + 4) % 96}%`,
      top: `${(i * 6.8 + 6) % 86}%`,
      delay: `${(i * 0.28) % 2.5}s`,
      size: i % 4 === 0 ? 'w-1.5 h-1.5' : 'w-1 h-1'
    }));
  }, []);

  // Staggered leaves & aerosol drift particles for wind mode
  const windParticles = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      top: `${14 + i * 11}%`,
      delay: `${i * 0.65}s`,
      duration: `${2.8 + (i % 3) * 0.5}s`,
      size: 10 + (i % 3) * 4,
      isLeaf: i % 2 === 0
    }));
  }, []);

  // Floating ice crystals for frost mode
  const frostCrystals = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => ({
      left: `${(i * 7.3 + 5) % 94}%`,
      delay: `${(i * 0.42) % 3.2}s`,
      duration: `${4.2 + (i % 3) * 0.8}s`,
      size: 10 + (i % 3) * 5,
      opacity: 0.45 + (i % 4) * 0.14
    }));
  }, []);

  const opacityClass = intensity === 'subtle' ? 'opacity-40' : intensity === 'dramatic' ? 'opacity-100' : 'opacity-85';

  return (
    <div 
      className={`absolute inset-0 pointer-events-none overflow-hidden rounded-3xl select-none z-0 transition-opacity duration-700 ${opacityClass} ${className}`}
      aria-hidden="true"
    >
      {/* ══════════════════════════════════════════════════════════════════
          1. THUNDERSTORM EFFECT (Electric lightning flashes, dark clouds, rain)
          ══════════════════════════════════════════════════════════════════ */}
      {effect === 'thunderstorm' && (
        <div className="absolute inset-0">
          {/* Ominous Storm Cloud Vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/30 via-slate-900/20 to-transparent mix-blend-multiply" />
          
          {/* Ambient Lightning Flash Overlay */}
          <div className="absolute inset-0 animate-lightning pointer-events-none" />

          {/* Glowing Lightning Branch SVG 1 (Primary) */}
          <svg className="absolute -top-4 right-1/4 w-36 h-48 opacity-85 animate-lightning-bolt" viewBox="0 0 100 160">
            <polyline
              points="60,0 45,45 65,55 35,115 50,118 20,160"
              fill="none"
              stroke="#e0e7ff"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="drop-shadow(0 0 10px #818cf8)"
            />
          </svg>

          {/* Secondary Distant Lightning Branch */}
          <svg className="absolute -top-6 left-1/3 w-28 h-36 opacity-60 animate-lightning-bolt [animation-delay:1.8s]" viewBox="0 0 100 160">
            <polyline
              points="55,0 40,40 55,48 25,100"
              fill="none"
              stroke="#c7d2fe"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="drop-shadow(0 0 6px #6366f1)"
            />
          </svg>

          {/* Heavy Falling Rain Streaks */}
          {raindrops.map((d, i) => (
            <div
              key={`ts-rain-${i}`}
              className="absolute w-[1.5px] bg-gradient-to-b from-cyan-200/50 via-blue-300/90 to-transparent rounded-full animate-rain"
              style={{
                left: d.left,
                top: '-15%',
                height: d.height,
                animationDelay: d.delay,
                animationDuration: d.duration,
                opacity: d.opacity + 0.15
              }}
            />
          ))}

          {/* Electric Edge Aura */}
          <div className="absolute -top-12 -right-12 w-52 h-52 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          2. RAIN EFFECT (Natural diagonal rain, splash ripples, cool mist)
          ══════════════════════════════════════════════════════════════════ */}
      {effect === 'rain' && (
        <div className="absolute inset-0">
          {/* Cool overcast tint */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-900/12 via-sky-800/6 to-transparent mix-blend-multiply" />

          {/* Rain Streaks */}
          {raindrops.map((d, i) => (
            <div
              key={`rain-${i}`}
              className="absolute w-[1.5px] bg-gradient-to-b from-blue-200/40 via-sky-300/80 to-transparent rounded-full animate-rain"
              style={{
                left: d.left,
                top: '-15%',
                height: d.height,
                animationDelay: d.delay,
                animationDuration: d.duration,
                opacity: d.opacity
              }}
            />
          ))}

          {/* Ground Splash Ripples */}
          <div className="absolute bottom-2 left-8 w-9 h-2.5 border border-sky-400/50 rounded-full animate-splash" />
          <div className="absolute bottom-3 left-1/3 w-7 h-2 border border-sky-400/40 rounded-full animate-splash [animation-delay:0.7s]" />
          <div className="absolute bottom-2 right-1/4 w-10 h-2.5 border border-sky-400/50 rounded-full animate-splash [animation-delay:1.4s]" />
          <div className="absolute bottom-4 right-1/12 w-6 h-2 border border-sky-400/35 rounded-full animate-splash [animation-delay:1.9s]" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          3. WIND EFFECT (Aerodynamic breeze ribbons & drifting leaves/particles)
          ══════════════════════════════════════════════════════════════════ */}
      {effect === 'wind' && (
        <div className="absolute inset-0">
          {/* Flowing Wind Stream Ribbon 1 */}
          <div className="absolute top-1/4 -left-full w-full h-9 bg-gradient-to-r from-transparent via-teal-400/25 to-transparent blur-sm animate-wind-ribbon" />
          {/* Flowing Wind Stream Ribbon 2 */}
          <div className="absolute top-2/3 -left-full w-full h-7 bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent blur-sm animate-wind-ribbon [animation-delay:1.4s]" />

          {/* Curved SVG Streamlines */}
          <svg className="absolute inset-0 w-full h-full opacity-40" preserveAspectRatio="none">
            <path
              d="M -100 35 C 150 15, 300 55, 600 30 C 850 10, 1100 45, 1400 25"
              fill="none"
              stroke="#14b8a6"
              strokeWidth="2.2"
              strokeDasharray="20 14"
              className="animate-streamline"
            />
            <path
              d="M -100 85 C 180 100, 400 65, 750 90 C 1000 115, 1200 75, 1500 85"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="1.8"
              strokeDasharray="24 16"
              className="animate-streamline [animation-delay:0.8s]"
            />
          </svg>

          {/* Tumbling Leaves and Drift Droplets */}
          {windParticles.map((p, i) => (
            <div
              key={`wind-p-${i}`}
              className="absolute animate-leaf-drift"
              style={{
                top: p.top,
                animationDelay: p.delay,
                animationDuration: p.duration
              }}
            >
              {p.isLeaf ? (
                <svg width={p.size} height={p.size} viewBox="0 0 24 24" className="text-teal-600/70 drop-shadow-xs">
                  <path
                    d="M17 8C8 10 5 19 5 19C5 19 14 16 16 7M17 8C19 6 20 4 20 4C20 4 18 5 16 7M17 8L16 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <div 
                  className="rounded-full bg-cyan-400/60 shadow-[0_0_6px_#06b6d4]"
                  style={{ width: `${p.size / 2.5}px`, height: `${p.size / 2.5}px` }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          4. HOT SUN / HEATWAVE EFFECT (Solar corona, heatwaves, thermal haze)
          ══════════════════════════════════════════════════════════════════ */}
      {effect === 'sun' && (
        <div className="absolute inset-0">
          {/* Warm Sunbeam Corner Wash */}
          <div className="absolute -top-16 -right-16 w-68 h-68 bg-radial from-amber-400/40 via-orange-400/20 to-transparent rounded-full blur-2xl pointer-events-none" />

          {/* Rotating Solar Corona Orb */}
          <div className="absolute top-2 right-4 w-20 h-20 pointer-events-none">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.7)] animate-solar-pulse" />
            {/* Spinning Radiant Solar Rays */}
            <svg viewBox="0 0 100 100" className="absolute -inset-3 w-26 h-26 text-amber-500/45 animate-spin-slow">
              {Array.from({ length: 12 }).map((_, i) => (
                <line
                  key={`ray-${i}`}
                  x1="50"
                  y1="10"
                  x2="50"
                  y2="2"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  transform={`rotate(${i * 30} 50 50)`}
                />
              ))}
            </svg>
          </div>

          {/* Shimmering Thermal Heat Haze Wave at Bottom */}
          <div className="absolute bottom-0 inset-x-0 h-18 bg-gradient-to-t from-amber-500/12 via-orange-500/6 to-transparent animate-heat-haze" />
          <svg className="absolute bottom-0 inset-x-0 w-full h-9 opacity-30" preserveAspectRatio="none">
            <path
              d="M 0 15 Q 40 5, 80 15 T 160 15 T 240 15 T 320 15 T 400 15 T 480 15 T 560 15 T 640 15 V 30 H 0 Z"
              fill="#f59e0b"
              className="animate-heat-wave"
            />
          </svg>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          5. NIGHT / NOCTURNAL INVERSION (Starfield, crescent moon & ground mist)
          ══════════════════════════════════════════════════════════════════ */}
      {effect === 'night' && (
        <div className="absolute inset-0">
          {/* Deep Twilight Sky Wash */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/30 via-slate-900/18 to-transparent mix-blend-multiply" />

          {/* Twinkling Constellation Stars */}
          {stars.map((s, i) => (
            <div
              key={`star-${i}`}
              className={`absolute rounded-full bg-white shadow-[0_0_5px_#ffffff] animate-star-twinkle ${s.size}`}
              style={{
                left: s.left,
                top: s.top,
                animationDelay: s.delay
              }}
            />
          ))}

          {/* Subtle Glowing Moon Silhouette in Corner */}
          <div className="absolute top-3 right-5 w-8 h-8 rounded-full shadow-[0_0_18px_rgba(224,231,255,0.75)]">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-indigo-100 drop-shadow-sm">
              <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                fill="currentColor"
                opacity="0.92"
              />
            </svg>
          </div>

          {/* Nocturnal Inversion Ground Mist / Layer Fog */}
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-indigo-300/25 via-slate-300/12 to-transparent blur-md animate-mist-drift" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          6. FROST / FREEZING EFFECT (Hexagonal ice crystals, cold winter chill)
          ══════════════════════════════════════════════════════════════════ */}
      {effect === 'frost' && (
        <div className="absolute inset-0">
          {/* Icy Blue Vignette */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/15 via-sky-800/8 to-transparent mix-blend-multiply" />

          {/* Floating Ice Crystal Snowflakes */}
          {frostCrystals.map((f, i) => (
            <div
              key={`frost-${i}`}
              className="absolute animate-frost-float text-cyan-200"
              style={{
                left: f.left,
                top: '-10%',
                animationDelay: f.delay,
                animationDuration: f.duration,
                opacity: f.opacity
              }}
            >
              <svg width={f.size} height={f.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="drop-shadow-[0_0_4px_rgba(165,243,252,0.8)]">
                <line x1="12" y1="2" x2="12" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
              </svg>
            </div>
          ))}

          {/* Frost Rim Glow */}
          <div className="absolute -top-10 -left-10 w-44 h-44 bg-cyan-300/20 rounded-full blur-3xl animate-pulse" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          7. OPTIMAL SPRAY WINDOW (Pristine emerald aura, morning dew glints)
          ══════════════════════════════════════════════════════════════════ */}
      {effect === 'optimal' && (
        <div className="absolute inset-0">
          {/* Emerald Vitality Radiant Aura */}
          <div className="absolute -top-12 -right-12 w-60 h-60 bg-radial from-emerald-400/28 via-teal-400/16 to-transparent rounded-full blur-2xl animate-emerald-pulse" />

          {/* Dewdrop Sparkles */}
          <div className="absolute top-4 right-10 w-2.5 h-2.5 rounded-full bg-emerald-300 shadow-[0_0_10px_#10b981] animate-ping [animation-duration:2.8s]" />
          <div className="absolute top-9 right-24 w-1.5 h-1.5 rounded-full bg-teal-200 shadow-[0_0_6px_#14b8a6] animate-ping [animation-duration:2.3s] [animation-delay:1.1s]" />
          <div className="absolute bottom-6 right-16 w-2 h-2 rounded-full bg-emerald-200 shadow-[0_0_8px_#10b981] animate-ping [animation-duration:3.4s] [animation-delay:0.5s]" />
          <div className="absolute top-12 left-1/3 w-1.5 h-1.5 rounded-full bg-emerald-200 shadow-[0_0_6px_#10b981] animate-ping [animation-duration:3.8s] [animation-delay:1.7s]" />
        </div>
      )}

      {/* Optional Top-Right Live FX Badge */}
      {badge && (
        <div className="absolute top-3 right-3 z-20 pointer-events-none">
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/70 backdrop-blur-md text-slate-700 border border-slate-200/60 shadow-2xs">
            {badge}
          </span>
        </div>
      )}
    </div>
  );
}
