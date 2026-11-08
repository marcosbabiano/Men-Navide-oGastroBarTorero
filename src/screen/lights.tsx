import { useCallback, useState } from 'react';
import type { PartyConfig } from '../../shared/signage.ts';
import { hexToRgb, PROFILES, useShaderCanvas } from './gl.ts';
import { AMBIENT_FRAG, PARTY_FRAG } from './shaders.ts';
import type { RenderQuality } from './common.tsx';

const MOODS = {
  warm: { c: ['#c98a3e', '#f2c879', '#7a3a24'], bg: '#0d0807', snow: 0 },
  christmas: { c: ['#d9b46a', '#b3263a', '#5a2533'], bg: '#0b0607', snow: 1 },
  night: { c: ['#3d5bd9', '#9a7cff', '#1b2a5a'], bg: '#04050c', snow: 0 },
} as const;

/** Fondo de respaldo (sin WebGL o si el contexto falla): degradado estático, nunca negro vacío. */
function Fallback({ colors, bg }: { colors: readonly string[]; bg: string }) {
  return (
    <div
      className="sc-glFallback"
      style={{ background: `radial-gradient(60% 70% at 50% 45%, ${colors[0]}55, transparent 70%), radial-gradient(40% 50% at 20% 20%, ${colors[1]}33, transparent), ${bg}` }}
    />
  );
}

export function LogoLight({ mood, particles, running, quality }: { mood: keyof typeof MOODS; particles: boolean; running: boolean; quality: RenderQuality }) {
  const m = MOODS[mood];
  const [failed, setFailed] = useState(false);
  const uniforms = useCallback(
    () => ({
      uC0: hexToRgb(m.c[0]),
      uC1: hexToRgb(m.c[1]),
      uC2: hexToRgb(m.c[2]),
      uBg: hexToRgb(m.bg),
      uParticles: particles ? (quality === 'low' ? 0.6 : 1) : 0,
      uQuality: quality === 'low' ? 0 : 1,
      uSnow: m.snow,
    }),
    [m, particles, quality],
  );
  const ref = useShaderCanvas({ frag: AMBIENT_FRAG, uniforms, running, profile: { ...PROFILES[quality], fps: Math.min(PROFILES[quality].fps, 40) }, onError: () => setFailed(true) });
  if (failed) return <Fallback colors={m.c} bg={m.bg} />;
  return <canvas ref={ref} className="sc-gl" aria-hidden="true" />;
}

export function PartyLights({ party, running, quality }: { party: PartyConfig; running: boolean; quality: RenderQuality }) {
  const [failed, setFailed] = useState(false);
  const uniforms = useCallback(() => {
    const cols = party.colors.map(hexToRgb);
    const at = (i: number) => cols[i % cols.length];
    const lowBeams = quality === 'low' ? Math.min(party.beams, 6) : party.beams;
    return {
      uC0: at(0),
      uC1: at(1),
      uC2: at(2),
      uC3: at(3),
      uCount: cols.length,
      uBeams: lowBeams,
      uSpeed: party.speed,
      uIntensity: party.intensity,
      uMotion: party.motion,
      uHaze: party.haze,
      uParticles: quality === 'low' ? party.particles * 0.5 : party.particles,
      uLogoY: party.logoY,
      uQuality: quality === 'low' ? 0 : 1,
      uBg: hexToRgb(party.background),
    };
  }, [party, quality]);
  const ref = useShaderCanvas({ frag: PARTY_FRAG, uniforms, running, profile: PROFILES[quality], onError: () => setFailed(true) });
  if (failed) return <Fallback colors={party.colors} bg={party.background} />;
  return <canvas ref={ref} className="sc-gl" aria-hidden="true" />;
}
