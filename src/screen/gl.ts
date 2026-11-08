/**
 * Lienzo WebGL de pantalla completa con un único fragment shader.
 *
 * - Resolución interna limitada por perfil de calidad (no se renderiza a 4K nativo: la luz es suave
 *   y se escala sin pérdida apreciable) → menos GPU y menos calor en portátiles.
 * - Bucle requestAnimationFrame con límite de FPS; se detiene al pausar, al ocultarse la pestaña
 *   o al desmontar la escena.
 * - Recuperación tras pérdida de contexto (webglcontextlost / restored).
 * - Al desmontar: cancela el bucle, desconecta observadores, borra programa y buffers y libera
 *   el contexto (WEBGL_lose_context) para no acumular contextos en ejecuciones de días.
 */
import { useEffect, useRef } from 'react';

export type Uniforms = Record<string, number | number[]>;

export interface RenderProfile {
  /** Píxeles máximos del lienzo (ancho × alto). */
  maxPixels: number;
  fps: number;
}

export const PROFILES: Record<'high' | 'balanced' | 'low', RenderProfile> = {
  high: { maxPixels: 2560 * 1440, fps: 60 },
  balanced: { maxPixels: 1920 * 1080, fps: 45 },
  low: { maxPixels: 1280 * 720, fps: 30 },
};

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

export interface GlStats {
  contexts: number;
  created: number;
  lost: number;
}
/** Contadores globales (los usan las pruebas de resistencia para detectar fugas). */
export const glStats: GlStats = { contexts: 0, created: 0, lost: 0 };
(globalThis as unknown as { __toreroGl: GlStats }).__toreroGl = glStats;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader: ${log}`);
  }
  return sh;
}

export function useShaderCanvas(opts: {
  frag: string;
  uniforms: () => Uniforms;
  running: boolean;
  profile: RenderProfile;
  onError?: (e: unknown) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uniformsRef = useRef(opts.uniforms);
  const runningRef = useRef(opts.running);
  const profileRef = useRef(opts.profile);
  const onErrorRef = useRef(opts.onError);
  useEffect(() => {
    uniformsRef.current = opts.uniforms;
    runningRef.current = opts.running;
    profileRef.current = opts.profile;
    onErrorRef.current = opts.onError;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let locs = new Map<string, WebGLUniformLocation | null>();
    let raf = 0;
    let timer = 0;
    let last = 0;
    let elapsed = 0;
    let prevNow = 0;
    let disposed = false;
    let counted = false;

    const setup = () => {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!gl) throw new Error('WebGL no disponible');
      if (!counted) {
        counted = true;
        glStats.contexts++;
        glStats.created++;
      }
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, opts.frag);
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Programa: ${gl.getProgramInfoLog(program)}`);
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      locs = new Map();
    };

    const resize = () => {
      if (!gl) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let w = Math.max(1, rect.width * dpr);
      let h = Math.max(1, rect.height * dpr);
      const max = profileRef.current.maxPixels;
      if (w * h > max) {
        const k = Math.sqrt(max / (w * h));
        w *= k;
        h *= k;
      }
      w = Math.round(w);
      h = Math.round(h);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const loc = (name: string) => {
      if (!locs.has(name)) locs.set(name, gl!.getUniformLocation(program!, name));
      return locs.get(name) ?? null;
    };

    const draw = (now: number) => {
      raf = 0;
      if (disposed || !gl || !program || gl.isContextLost()) return;
      const dt = prevNow ? Math.min(now - prevNow, 100) : 16;
      prevNow = now;
      if (runningRef.current) elapsed += dt;
      const minFrame = 1000 / profileRef.current.fps - 1.5;
      if (now - last >= minFrame) {
        last = now;
        resize();
        gl.viewport(0, 0, canvas.width, canvas.height);
        const u = uniformsRef.current();
        gl.uniform1f(loc('uTime'), elapsed / 1000);
        gl.uniform2f(loc('uRes'), canvas.width, canvas.height);
        for (const [k, v] of Object.entries(u)) {
          const l = loc(k);
          if (!l) continue;
          if (typeof v === 'number') gl.uniform1f(l, v);
          else if (v.length === 2) gl.uniform2fv(l, v);
          else if (v.length === 3) gl.uniform3fv(l, v);
          else if (v.length === 4) gl.uniform4fv(l, v);
          else gl.uniform3fv(l, v); // arrays de vec3
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      schedule();
    };

    const schedule = () => {
      if (disposed || raf) return;
      if (document.hidden) return;
      // En pausa se sigue dibujando a 2 FPS (la imagen queda fija y viva sin gastar GPU).
      if (!runningRef.current) {
        if (timer) return;
        timer = window.setTimeout(() => {
          timer = 0;
          if (!disposed && !raf) raf = requestAnimationFrame(draw);
        }, 500);
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      glStats.lost++;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onRestored = () => {
      try {
        setup();
        prevNow = 0;
        schedule();
      } catch (err) {
        onErrorRef.current?.(err);
      }
    };
    const onVisibility = () => {
      prevNow = 0;
      schedule();
    };

    try {
      setup();
    } catch (err) {
      onErrorRef.current?.(err);
      return;
    }
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVisibility);
    schedule();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      const g = gl as WebGLRenderingContext | null;
      if (g && !g.isContextLost()) {
        if (buffer) g.deleteBuffer(buffer);
        if (program) g.deleteProgram(program);
        g.getExtension('WEBGL_lose_context')?.loseContext();
      }
      if (counted) glStats.contexts--;
      gl = null;
      program = null;
      buffer = null;
    };
    // El shader no cambia durante la vida del componente.
  }, [opts.frag]);

  return canvasRef;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
