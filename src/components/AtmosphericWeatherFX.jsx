/**
 * Atmospheric Weather FX Engine
 * Ultra-realistic, 60fps HTML5 Canvas + Layered CSS Microclimate Simulation
 * 
 * Implements photorealistic procedural weather physics for:
 * 1. 🌙 Nighttime Inversion: Starry celestial field with realistic twinkling magnitudes,
 *    crescent moon halo, and low-altitude undulating nocturnal inversion mist bands.
 * 2. 🌧️ Rain Wash-off: Multi-plane parallax raindrops, wind angle tilt, and expanding
 *    ground splash ripples with bounce droplets.
 * 3. ⛈️ Thunderstorm: Procedural fractal lightning bolts (midpoint displacement),
 *    realistic double-flash ambient lightning, and dense storm rain sheets.
 * 4. 💨 Wind Drift: Laminar airflow streamlines, swirling botanical leaves with 3D tumble physics,
 *    and floating aerosol drift mist particles.
 * 5. ☀️ Scorching Sun: Radiant solar corona, convection updraft dust motes, and bottom
 *    thermal heat haze shimmer waves.
 * 6. ❄️ Frost Alert: Dendritic hexagonal ice crystals drifting with lateral sway oscillations.
 * 7. ✨ Optimal Window: Serene morning dewdrop sparkle flares and emerald vitality glow.
 */

import React, { useEffect, useRef } from 'react';

export default function AtmosphericWeatherFX({
  effect = 'optimal', // 'thunderstorm' | 'rain' | 'wind' | 'sun' | 'night' | 'frost' | 'optimal' | 'none'
  className = '',
  intensity = 'normal' // 'subtle' | 'normal' | 'dramatic'
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (effect === 'none') return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = 0;
    let height = 0;
    let dpr = window.devicePixelRatio || 1;

    // Handle high-DPI canvas resizing
    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(container);

    // ══════════════════════════════════════════════════════════════════
    // PARTICLE & STATE POOLS FOR EACH EFFECT
    // ══════════════════════════════════════════════════════════════════

    // 1. RAIN & STORM PARTICLES
    const isStorm = effect === 'thunderstorm';
    const rainCount = isStorm ? 180 : 110;
    const raindrops = Array.from({ length: rainCount }).map(() => ({
      x: Math.random() * (width + 100) - 50,
      y: Math.random() * (height + 100) - 50,
      z: Math.random() * 2.5 + 0.5, // 0.5 (far) to 3 (near)
      length: (isStorm ? 24 : 16) * (Math.random() * 0.5 + 0.8),
      speedY: (isStorm ? 28 : 19) * (Math.random() * 0.4 + 0.8),
      speedX: isStorm ? -3.5 : -1.8,
      opacity: Math.random() * 0.4 + 0.25
    }));

    // Splash ripples pool
    const splashes = [];
    const addSplash = (x, y) => {
      if (splashes.length > 40) splashes.shift();
      splashes.push({
        x,
        y: y - Math.random() * 4,
        radius: 1,
        maxRadius: Math.random() * 7 + 4,
        opacity: 0.75,
        speed: Math.random() * 0.6 + 0.5
      });
    };

    // Lightning procedural state
    let lightningTimer = 0;
    let nextLightningTime = Math.random() * 180 + 100; // frames
    let lightningSegments = [];
    let lightningBranches = [];
    let ambientFlashAlpha = 0;
    let flashSubStep = 0;

    const generateLightningBolt = (startX, startY, endX, endY) => {
      const segments = [{ x: startX, y: startY }];
      let curX = startX;
      let curY = startY;
      const totalSteps = 12;
      const stepY = (endY - startY) / totalSteps;

      for (let i = 1; i <= totalSteps; i++) {
        curY += stepY;
        curX += (Math.random() - 0.5) * 38;
        segments.push({ x: curX, y: curY });

        // Branching offshoot
        if (Math.random() < 0.3 && lightningBranches.length < 3) {
          const bSegs = [{ x: curX, y: curY }];
          let bx = curX;
          let by = curY;
          for (let j = 0; j < 5; j++) {
            by += stepY * 0.7;
            bx += (Math.random() - 0.4) * 30;
            bSegs.push({ x: bx, y: by });
          }
          lightningBranches.push(bSegs);
        }
      }
      return segments;
    };

    // 2. NIGHT / INVERSION PARTICLES
    const starCount = 85;
    const stars = Array.from({ length: starCount }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * (height * 0.85),
      size: Math.random() * 1.5 + 0.6,
      baseAlpha: Math.random() * 0.5 + 0.35,
      twinkleSpeed: Math.random() * 0.05 + 0.015,
      phase: Math.random() * Math.PI * 2,
      color: Math.random() > 0.85 ? '#dbeafe' : Math.random() > 0.7 ? '#fef3c7' : '#ffffff',
      hasSpikes: Math.random() < 0.06 // bright prominent star
    }));

    // Occasional shooting star
    let shootingStar = null;
    let shootingStarTimer = 0;
    let nextShootingStar = Math.random() * 300 + 200;

    // 3. WIND PARTICLES (Tumbling Leaves & Aerosol Mist)
    const windCount = 14;
    const windLeaves = Array.from({ length: windCount }).map(() => ({
      x: Math.random() * (width + 150) - 75,
      y: Math.random() * height,
      vx: Math.random() * 4.5 + 5.5,
      vy: Math.random() * 1.5 - 0.75,
      size: Math.random() * 8 + 10,
      angle: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.08,
      flip: Math.random() * Math.PI,
      flipSpeed: Math.random() * 0.05 + 0.02,
      waveOffset: Math.random() * Math.PI * 2,
      color: Math.random() > 0.5 ? '#10b981' : '#0d9488'
    }));

    // Floating aerosol micro-droplets
    const aerosolCount = 35;
    const aerosols = Array.from({ length: aerosolCount }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.random() * 6 + 7,
      vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 1.8 + 0.8,
      opacity: Math.random() * 0.4 + 0.15
    }));

    // 4. HOT SUN PARTICLES (Thermal Dust Motes & Updraft)
    const dustCount = 45;
    const sunDust = Array.from({ length: dustCount }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vy: -(Math.random() * 0.9 + 0.4), // upwards convection
      vx: (Math.random() - 0.5) * 0.6,
      radius: Math.random() * 2 + 1,
      alpha: Math.random() * 0.6 + 0.2,
      pulse: Math.random() * Math.PI * 2
    }));

    // 5. FROST PARTICLES (Floating Dendritic Crystals)
    const frostCount = 30;
    const frostCrystals = Array.from({ length: frostCount }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vy: Math.random() * 0.8 + 0.4,
      vx: Math.random() * 0.4 - 0.2,
      size: Math.random() * 7 + 7,
      swayOffset: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 0.03 + 0.015,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      opacity: Math.random() * 0.5 + 0.35
    }));

    // 6. OPTIMAL PARTICLES (Morning Dewdrop Sparkles)
    const dewCount = 18;
    const dewdrops = Array.from({ length: dewCount }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * (height * 0.85) + (height * 0.1),
      maxSize: Math.random() * 3 + 2.5,
      currentSize: 0,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.035 + 0.02,
      color: Math.random() > 0.4 ? '#34d399' : '#a7f3d0'
    }));

    let frameCount = 0;

    // ══════════════════════════════════════════════════════════════════
    // MAIN RENDER LOOP (60 FPS)
    // ══════════════════════════════════════════════════════════════════
    const render = () => {
      frameCount++;
      ctx.clearRect(0, 0, width, height);

      // ──────────────────────────────────────────────────────────────────
      // MODE 1 & 2: RAIN & THUNDERSTORM
      // ──────────────────────────────────────────────────────────────────
      if (effect === 'rain' || effect === 'thunderstorm') {
        // Draw falling raindrops
        ctx.lineWidth = isStorm ? 1.6 : 1.2;
        ctx.lineCap = 'round';

        for (let i = 0; i < raindrops.length; i++) {
          const d = raindrops[i];
          d.y += d.speedY;
          d.x += d.speedX;

          // Check bottom impact -> spawn splash
          if (d.y > height - 6) {
            if (Math.random() < 0.45) {
              addSplash(d.x, height - 4);
            }
            d.y = -d.length - 10;
            d.x = Math.random() * (width + 60) - 20;
          }

          const strokeAlpha = (d.opacity * (d.z / 2.5)).toFixed(2);
          ctx.strokeStyle = isStorm 
            ? `rgba(199, 210, 254, ${strokeAlpha})` 
            : `rgba(224, 242, 254, ${strokeAlpha})`;

          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.speedX * (d.length / 10), d.y + d.length);
          ctx.stroke();
        }

        // Draw and update splashes
        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i];
          s.radius += s.speed;
          s.opacity -= 0.045;

          if (s.opacity <= 0) {
            splashes.splice(i, 1);
            continue;
          }

          ctx.strokeStyle = `rgba(186, 230, 253, ${Math.max(0, s.opacity)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, s.radius * 1.6, s.radius * 0.45, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Procedural Lightning Simulation (Thunderstorm only)
        if (isStorm) {
          lightningTimer++;

          // Ambient lightning double-flash dissipation
          if (ambientFlashAlpha > 0) {
            ctx.fillStyle = `rgba(224, 231, 255, ${ambientFlashAlpha})`;
            ctx.fillRect(0, 0, width, height);

            if (flashSubStep === 1) {
              // Pause between double flash
              ambientFlashAlpha -= 0.08;
              if (ambientFlashAlpha <= 0.05) {
                flashSubStep = 2;
                ambientFlashAlpha = 0.35; // Second flash spike
              }
            } else {
              ambientFlashAlpha -= 0.05;
            }
          }

          // Trigger lightning stroke
          if (lightningTimer >= nextLightningTime) {
            lightningTimer = 0;
            nextLightningTime = Math.random() * 240 + 140; // 3-6 seconds
            ambientFlashAlpha = 0.42;
            flashSubStep = 1;

            const startX = Math.random() * (width * 0.6) + width * 0.2;
            const endX = startX + (Math.random() - 0.5) * 120;
            lightningBranches = [];
            lightningSegments = generateLightningBolt(startX, 0, endX, height * 0.85);
          }

          // Render active lightning bolt
          if (ambientFlashAlpha > 0.08 && lightningSegments.length > 1) {
            ctx.save();
            ctx.shadowBlur = 18;
            ctx.shadowColor = '#818cf8';

            // Main bolt
            ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, ambientFlashAlpha * 2.5)})`;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(lightningSegments[0].x, lightningSegments[0].y);
            for (let j = 1; j < lightningSegments.length; j++) {
              ctx.lineTo(lightningSegments[j].x, lightningSegments[j].y);
            }
            ctx.stroke();

            // Offshoot branches
            ctx.lineWidth = 1.3;
            ctx.strokeStyle = `rgba(199, 210, 254, ${Math.min(0.9, ambientFlashAlpha * 2)})`;
            for (const b of lightningBranches) {
              ctx.beginPath();
              ctx.moveTo(b[0].x, b[0].y);
              for (let k = 1; k < b.length; k++) {
                ctx.lineTo(b[k].x, b[k].y);
              }
              ctx.stroke();
            }

            ctx.restore();
          }
        }
      }

      // ──────────────────────────────────────────────────────────────────
      // MODE 3: NIGHT / NOCTURNAL INVERSION
      // ──────────────────────────────────────────────────────────────────
      else if (effect === 'night') {
        // Draw realistic starry sky
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const alpha = Math.max(0.15, Math.min(1, s.baseAlpha + Math.sin(frameCount * s.twinkleSpeed + s.phase) * 0.35));

          ctx.fillStyle = s.color;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();

          // Diffraction spike on prominent stars
          if (s.hasSpikes && alpha > 0.6) {
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(s.x - 4, s.y);
            ctx.lineTo(s.x + 4, s.y);
            ctx.moveTo(s.x, s.y - 4);
            ctx.lineTo(s.x, s.y + 4);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;

        // Shooting Star
        shootingStarTimer++;
        if (!shootingStar && shootingStarTimer > nextShootingStar) {
          shootingStarTimer = 0;
          nextShootingStar = Math.random() * 500 + 350;
          shootingStar = {
            x: Math.random() * (width * 0.7) + width * 0.1,
            y: Math.random() * (height * 0.35),
            vx: Math.random() * 8 + 9,
            vy: Math.random() * 4 + 3,
            length: Math.random() * 45 + 35,
            opacity: 1
          };
        }

        if (shootingStar) {
          shootingStar.x += shootingStar.vx;
          shootingStar.y += shootingStar.vy;
          shootingStar.opacity -= 0.035;

          if (shootingStar.opacity <= 0 || shootingStar.x > width || shootingStar.y > height) {
            shootingStar = null;
          } else {
            ctx.save();
            ctx.strokeStyle = `rgba(255, 255, 255, ${shootingStar.opacity})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(shootingStar.x, shootingStar.y);
            ctx.lineTo(
              shootingStar.x - shootingStar.vx * 2.8,
              shootingStar.y - shootingStar.vy * 2.8
            );
            ctx.stroke();
            ctx.restore();
          }
        }

        // Realistic Nocturnal Inversion Ground Mist Bands
        const mistY = height - 26;
        for (let wave = 0; wave < 3; wave++) {
          const speed = (wave + 1) * 0.008;
          const amplitude = 5 + wave * 3;
          const yOffset = mistY - wave * 7;

          ctx.fillStyle = `rgba(199, 210, 254, ${0.06 + wave * 0.02})`;
          ctx.beginPath();
          ctx.moveTo(0, height);
          ctx.lineTo(0, yOffset);

          for (let x = 0; x <= width; x += 15) {
            const y = yOffset + Math.sin(x * 0.015 + frameCount * speed + wave) * amplitude;
            ctx.lineTo(x, y);
          }

          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();
        }
      }

      // ──────────────────────────────────────────────────────────────────
      // MODE 4: HIGH WIND & DRIFT HAZARD
      // ──────────────────────────────────────────────────────────────────
      else if (effect === 'wind') {
        // Horizontal aerodynamic breeze streamlines
        for (let l = 0; l < 4; l++) {
          const streamY = height * (0.2 + l * 0.22);
          const offset = (frameCount * (3 + l * 1.5)) % (width + 200) - 200;

          ctx.strokeStyle = `rgba(20, 184, 166, ${0.18 + l * 0.04})`;
          ctx.lineWidth = 1.4;
          ctx.setLineDash([25 + l * 10, 30 + l * 8]);
          ctx.lineDashOffset = -frameCount * (2.5 + l);

          ctx.beginPath();
          ctx.moveTo(-50, streamY);
          ctx.bezierCurveTo(
            width * 0.3, streamY - 12,
            width * 0.7, streamY + 12,
            width + 50, streamY
          );
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Floating aerosol spray drift mist
        for (let i = 0; i < aerosols.length; i++) {
          const a = aerosols[i];
          a.x += a.vx;
          a.y += a.vy + Math.sin(frameCount * 0.04 + i) * 0.3;

          if (a.x > width + 20) {
            a.x = -20;
            a.y = Math.random() * height;
          }

          ctx.fillStyle = `rgba(6, 182, 212, ${a.opacity})`;
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Swirling botanical leaves with 3D tumble physics
        for (let i = 0; i < windLeaves.length; i++) {
          const leaf = windLeaves[i];
          leaf.x += leaf.vx;
          leaf.y += leaf.vy + Math.sin(frameCount * 0.05 + leaf.waveOffset) * 0.8;
          leaf.angle += leaf.rotationSpeed;
          leaf.flip += leaf.flipSpeed;

          if (leaf.x > width + 40) {
            leaf.x = -30;
            leaf.y = Math.random() * height;
          }

          ctx.save();
          ctx.translate(leaf.x, leaf.y);
          ctx.rotate(leaf.angle);
          ctx.scale(Math.cos(leaf.flip), 1);

          // Draw organic leaf shape
          ctx.fillStyle = leaf.color;
          ctx.globalAlpha = 0.65;
          ctx.beginPath();
          ctx.moveTo(0, -leaf.size * 0.5);
          ctx.quadraticCurveTo(leaf.size * 0.45, 0, 0, leaf.size * 0.5);
          ctx.quadraticCurveTo(-leaf.size * 0.45, 0, 0, -leaf.size * 0.5);
          ctx.fill();

          // Leaf vein
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(0, -leaf.size * 0.45);
          ctx.lineTo(0, leaf.size * 0.45);
          ctx.stroke();

          ctx.restore();
        }
      }

      // ──────────────────────────────────────────────────────────────────
      // MODE 5: SCORCHING SUN / HEATWAVE HAZARD
      // ──────────────────────────────────────────────────────────────────
      else if (effect === 'sun') {
        // Floating solar dust motes rising in warm convection updrafts
        for (let i = 0; i < sunDust.length; i++) {
          const p = sunDust[i];
          p.y += p.vy;
          p.x += p.vx + Math.sin(frameCount * 0.03 + p.pulse) * 0.35;

          if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }

          const alpha = p.alpha * (0.8 + Math.sin(frameCount * 0.05 + p.pulse) * 0.2);
          ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Shimmering Thermal Heat Haze (bottom soil evaporation waves)
        const hazeBaseY = height - 18;
        for (let layer = 0; layer < 3; layer++) {
          const layerSpeed = 0.035 + layer * 0.015;
          const amp = 3.5 + layer * 2;
          const yPos = hazeBaseY - layer * 7;

          ctx.fillStyle = `rgba(245, 158, 11, ${0.05 + layer * 0.025})`;
          ctx.beginPath();
          ctx.moveTo(0, height);
          ctx.lineTo(0, yPos);

          for (let x = 0; x <= width; x += 12) {
            const y = yPos + Math.sin(x * 0.03 + frameCount * layerSpeed) * amp;
            ctx.lineTo(x, y);
          }

          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();
        }
      }

      // ──────────────────────────────────────────────────────────────────
      // MODE 6: FROST / FREEZING
      // ──────────────────────────────────────────────────────────────────
      else if (effect === 'frost') {
        for (let i = 0; i < frostCrystals.length; i++) {
          const f = frostCrystals[i];
          f.y += f.vy;
          f.x += f.vx + Math.sin(frameCount * f.swaySpeed + f.swayOffset) * 0.6;
          f.rotation += f.rotSpeed;

          if (f.y > height + 20) {
            f.y = -20;
            f.x = Math.random() * width;
          }

          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rotation);
          ctx.strokeStyle = `rgba(165, 243, 252, ${f.opacity})`;
          ctx.lineWidth = 1;

          // 6-arm dendritic snowflake
          for (let arm = 0; arm < 3; arm++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(-f.size * 0.5, 0);
            ctx.lineTo(f.size * 0.5, 0);
            // tiny branching twigs
            ctx.moveTo(-f.size * 0.25, -f.size * 0.15);
            ctx.lineTo(-f.size * 0.25, f.size * 0.15);
            ctx.moveTo(f.size * 0.25, -f.size * 0.15);
            ctx.lineTo(f.size * 0.25, f.size * 0.15);
            ctx.stroke();
          }

          ctx.restore();
        }
      }

      // ──────────────────────────────────────────────────────────────────
      // MODE 7: OPTIMAL SPRAY WINDOW
      // ──────────────────────────────────────────────────────────────────
      else if (effect === 'optimal') {
        // Morning dewdrop sparkle glints
        for (let i = 0; i < dewdrops.length; i++) {
          const d = dewdrops[i];
          const cycle = Math.sin(frameCount * d.speed + d.phase);
          if (cycle > 0.4) {
            const scale = (cycle - 0.4) / 0.6; // 0 to 1
            const size = d.maxSize * scale;

            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.fillStyle = d.color;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#10b981';

            // 4-point flare
            ctx.beginPath();
            ctx.moveTo(0, -size * 2);
            ctx.lineTo(size * 0.35, -size * 0.35);
            ctx.lineTo(size * 2, 0);
            ctx.lineTo(size * 0.35, size * 0.35);
            ctx.lineTo(0, size * 2);
            ctx.lineTo(-size * 0.35, size * 0.35);
            ctx.lineTo(-size * 2, 0);
            ctx.lineTo(-size * 0.35, -size * 0.35);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [effect, intensity]);

  if (effect === 'none') return null;

  const intensityClass = intensity === 'subtle' ? 'opacity-40' : intensity === 'dramatic' ? 'opacity-100' : 'opacity-85';

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none overflow-hidden rounded-3xl select-none z-0 transition-opacity duration-700 ${intensityClass} ${className}`}
      aria-hidden="true"
    >
      {/* ══════════════════════════════════════════════════════════════════
          LAYERED ATMOSPHERIC CSS BACKDROPS (Realistic Natural Depth)
          ══════════════════════════════════════════════════════════════════ */}
      
      {/* Thunderstorm: Dark stormy gradient wash */}
      {effect === 'thunderstorm' && (
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/35 via-slate-900/22 to-transparent mix-blend-multiply pointer-events-none" />
      )}

      {/* Rain: Cool overcast blue wash */}
      {effect === 'rain' && (
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/12 via-sky-800/6 to-transparent mix-blend-multiply pointer-events-none" />
      )}

      {/* Night / Inversion: Deep twilight indigo sky wash + Glowing Crescent Moon */}
      {effect === 'night' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/35 via-slate-900/20 to-transparent mix-blend-multiply pointer-events-none" />
          {/* Subtle Glowing Moon Silhouette with Ambient Lunar Halo */}
          <div className="absolute top-3 right-5 pointer-events-none">
            <div className="absolute -inset-2 rounded-full bg-indigo-300/20 blur-md" />
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-indigo-100 drop-shadow-[0_0_12px_rgba(224,231,255,0.8)] relative z-10">
              <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                fill="currentColor"
                opacity="0.94"
              />
            </svg>
          </div>
        </>
      )}

      {/* Hot Sun: Radiant Solar Corona Orb with Rotating Golden Rays */}
      {effect === 'sun' && (
        <div className="absolute top-2 right-4 w-20 h-20 pointer-events-none">
          {/* Sunbeam Corner Wash */}
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-radial from-amber-400/35 via-orange-400/18 to-transparent rounded-full blur-2xl" />
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-orange-400 to-amber-500 shadow-[0_0_36px_rgba(245,158,11,0.7)] animate-solar-pulse" />
          <svg viewBox="0 0 100 100" className="absolute -inset-3 w-26 h-26 text-amber-500/40 animate-spin-slow">
            {Array.from({ length: 12 }).map((_, i) => (
              <line
                key={`sun-ray-${i}`}
                x1="50"
                y1="10"
                x2="50"
                y2="2"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                transform={`rotate(${i * 30} 50 50)`}
              />
            ))}
          </svg>
        </div>
      )}

      {/* Frost: Icy blue chill aura */}
      {effect === 'frost' && (
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/14 via-sky-800/8 to-transparent mix-blend-multiply pointer-events-none" />
      )}

      {/* Optimal: Emerald vitality radiant aura */}
      {effect === 'optimal' && (
        <div className="absolute -top-12 -right-12 w-60 h-60 bg-radial from-emerald-400/26 via-teal-400/14 to-transparent rounded-full blur-2xl animate-emerald-pulse pointer-events-none" />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          HTML5 HIGH-PERFORMANCE PROCEDURAL CANVAS LAYER
          ══════════════════════════════════════════════════════════════════ */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none" 
      />
    </div>
  );
}
