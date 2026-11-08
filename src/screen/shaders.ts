/**
 * Shaders de la cartelería.
 *
 * PARTY: focos móviles con haces volumétricos, niebla, partículas en suspensión y resplandor
 * detrás del logotipo. Todo el cambio de color y brillo es de baja frecuencia (< 0,5 Hz) y de
 * amplitud moderada: sin destellos ni parpadeos peligrosos (pautas de fotosensibilidad WCAG 2.3.1).
 *
 * AMBIENT: luz cálida en movimiento lento, bokeh y viñeta para las escenas de logotipo.
 */

const COMMON = `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

export const PARTY_FRAG = `${COMMON}
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
uniform float uCount, uBeams, uSpeed, uIntensity, uMotion, uHaze, uParticles, uLogoY, uQuality;
uniform vec3 uBg;

vec3 palette(float k){
  // Interpolación suave entre los colores elegidos (sin saltos bruscos).
  k = mod(k, uCount);
  float i = floor(k), f = smoothstep(0.0, 1.0, fract(k));
  vec3 a = i < 0.5 ? uC0 : i < 1.5 ? uC1 : i < 2.5 ? uC2 : uC3;
  float j = mod(i + 1.0, uCount);
  vec3 b = j < 0.5 ? uC0 : j < 1.5 ? uC1 : j < 2.5 ? uC2 : uC3;
  return mix(a, b, f);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * uSpeed;
  vec3 col = uBg;

  // Niebla volumétrica de fondo.
  float fog = fbm(p * 1.6 + vec2(t * 0.05, -t * 0.03));
  float fog2 = fbm(p * 3.2 - vec2(t * 0.04, t * 0.02));
  float haze = mix(0.25, 1.0, fog) * mix(0.6, 1.0, fog2);

  vec3 light = vec3(0.0);
  for (int i = 0; i < 12; i++){
    float fi = float(i);
    if (fi >= uBeams) break;
    float side = mod(fi, 2.0);
    // Focos repartidos por el techo y dos desde el suelo en los laterales.
    float x = (fi + 0.5) / uBeams * aspect;
    vec2 origin = vec2(x, 1.08);
    float baseAng = (x / aspect - 0.5) * -0.9;
    float sweep = uMotion * (0.55 * sin(t * (0.35 + 0.07 * fi) + fi * 1.7) + 0.25 * sin(t * 0.21 + fi * 2.3));
    float ang = baseAng + sweep;
    vec2 dir = vec2(sin(ang), -cos(ang));
    vec2 v = p - origin;
    float along = dot(v, dir);
    float perp = abs(v.x * dir.y - v.y * dir.x);
    float width = 0.012 + along * (0.11 + 0.03 * side);
    float core = smoothstep(width, width * 0.15, perp);
    float soft = smoothstep(width * 3.2, 0.0, perp) * 0.35;
    float fall = exp(-along * 0.9) * step(0.0, along);
    vec3 c = palette(fi * 0.7 + uTime * 0.04 * uSpeed);
    float beam = (core + soft) * fall * (0.55 + 0.45 * haze * (0.4 + uHaze));
    // Mancha de luz donde el haz toca el fondo de la sala.
    vec2 spot = origin + dir * 1.05;
    float pool = exp(-dot(p - spot, p - spot) * 30.0) * 0.35;
    light += c * (beam + pool);
  }
  light *= uIntensity;

  // Resplandor detrás del logotipo (respira despacio: periodo de ~8 s).
  vec2 center = vec2(0.5 * aspect, 0.5 + uLogoY);
  float d = length((p - center) * vec2(0.8, 1.2));
  float breathe = 0.85 + 0.15 * sin(uTime * 0.8);
  vec3 glow = palette(uTime * 0.03) * exp(-d * 3.2) * 0.55 * breathe * uIntensity;

  // Partículas en suspensión (polvo iluminado por los focos).
  vec3 dust = vec3(0.0);
  if (uParticles > 0.01){
    for (int l = 0; l < 3; l++){
      float fl = float(l);
      if (uQuality < 0.5 && l > 0) break;
      vec2 g = p * (14.0 + fl * 9.0) + vec2(fl * 7.1, t * (0.25 + fl * 0.1));
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash(id + fl);
      if (h < uParticles * 0.5){
        vec2 o = vec2(hash(id + 3.1), hash(id + 5.7)) - 0.5;
        float r = length(f - o * 0.6);
        float tw = 0.6 + 0.4 * sin(uTime * (0.6 + h) + h * 30.0);
        dust += palette(h * 3.0) * smoothstep(0.08, 0.0, r) * tw * (0.35 + 0.4 * length(light));
      }
    }
  }

  col += light * mix(0.6, 1.0, haze) + glow + dust;
  col += uBg * haze * uHaze * 0.6;
  // Viñeta.
  float vig = smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(1.25, 1.0)));
  col *= mix(0.55, 1.0, vig);
  // Tonemapping suave para evitar blancos quemados.
  col = 1.0 - exp(-col * 1.35);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const AMBIENT_FRAG = `${COMMON}
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2;
uniform vec3 uBg;
uniform float uParticles, uQuality, uSnow;

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime;
  vec3 col = uBg;

  // Luz cálida que se desplaza muy despacio.
  float n1 = fbm(p * 1.2 + vec2(t * 0.025, t * 0.015));
  float n2 = fbm(p * 2.1 - vec2(t * 0.02, -t * 0.03) + 4.0);
  vec2 c1 = vec2(aspect * (0.3 + 0.1 * sin(t * 0.07)), 0.62 + 0.08 * cos(t * 0.05));
  vec2 c2 = vec2(aspect * (0.72 + 0.08 * cos(t * 0.06)), 0.38 + 0.1 * sin(t * 0.04));
  col += uC0 * exp(-length(p - c1) * 2.2) * (0.55 + 0.45 * n1) * 0.7;
  col += uC1 * exp(-length(p - c2) * 2.4) * (0.55 + 0.45 * n2) * 0.6;
  col += uC2 * exp(-length((p - vec2(0.5 * aspect, 0.5)) * vec2(0.9, 1.3)) * 2.8) * 0.45;

  // Bokeh (luces desenfocadas).
  if (uParticles > 0.01){
    for (int l = 0; l < 3; l++){
      float fl = float(l);
      if (uQuality < 0.5 && l > 1) break;
      float scale = 5.0 + fl * 3.0;
      vec2 g = p * scale + vec2(t * 0.03 * (fl + 1.0), -t * (0.02 + 0.03 * uSnow) * (fl + 1.0));
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash(id + fl * 13.0);
      if (h < 0.22 * uParticles){
        vec2 o = vec2(hash(id + 1.3), hash(id + 2.9)) - 0.5;
        float r = length(f - o * 0.5);
        float size = 0.12 + 0.18 * hash(id + 7.7);
        float disc = smoothstep(size, size * 0.7, r) * (0.25 + 0.1 * fl);
        float ring = smoothstep(size, size * 0.92, r) - smoothstep(size * 0.92, size * 0.84, r);
        vec3 bc = h < 0.07 * uParticles ? uC1 : uC0;
        col += bc * (disc * 0.6 + ring * 0.12) * (0.7 + 0.3 * sin(t * 0.5 + h * 20.0));
      }
    }
  }
  float vig = smoothstep(1.2, 0.3, length((uv - 0.5) * vec2(1.2, 1.0)));
  col *= mix(0.45, 1.0, vig);
  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(col, 1.0);
}
`;
