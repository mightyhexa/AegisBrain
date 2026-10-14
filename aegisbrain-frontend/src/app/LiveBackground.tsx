"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Live Background: WebGL2 Ice-Blue Silk Shader + 2D Particle Canvas   */
/* ------------------------------------------------------------------ */

const SILK_VERT = `#version 300 es
in vec2 p;
void main() { 
  gl_Position = vec4(p, 0.0, 1.0); 
}`;

const SILK_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + vec2(45.32));
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (vec2(3.0) - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

float field(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - vec2(t)));
  vec2 r = vec2(
    fbm(p + 1.8 * q + vec2(1.7, 9.2) + vec2(0.7 * t)),
    fbm(p + 1.8 * q + vec2(8.3, 2.8) - vec2(0.5 * t))
  );
  return fbm(p + 1.6 * r);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y) * 0.6;
  p.y -= uScroll * 1.1;
  p.x += uScroll * 0.3;
  float t = uTime * 0.045;

  float h = field(p, t);
  vec2 g = vec2(dFdx(h), dFdy(h)) * uRes.y;
  vec3 n = normalize(vec3(-g * 1.8, 1.0));
  vec3 L = normalize(vec3(-0.45, 0.6, 0.75));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 38.0);

  vec3 c0 = vec3(0.973, 0.984, 1.000); // Near white
  vec3 c1 = vec3(0.800, 0.902, 0.984); // Ice blue
  vec3 c2 = vec3(0.663, 0.776, 0.969); // Periwinkle
  vec3 c3 = vec3(0.553, 0.690, 0.941); // Deep fold

  float dg = uv.x * 0.55 + (1.0 - uv.y) * 0.55;
  float k = clamp(h * 0.9 + dg * 0.45 - 0.12, 0.0, 1.0);
  vec3 col = mix(c0, c1, smoothstep(0.20, 0.55, k));
  col = mix(col, c2, smoothstep(0.45, 0.80, k) * 0.85);
  col = mix(col, c3, smoothstep(0.75, 1.00, k) * 0.50);
  col = mix(col, c3, (1.0 - diff) * 0.22);
  col *= 0.94 + 0.10 * diff;
  col += vec3(1.0) * spec * 0.28;

  float glow = 1.0 - smoothstep(0.0, 1.1, distance(uv, vec2(0.12, 0.92)));
  col = mix(col, c0, glow * 0.35);
  col = mix(col, c2, uScroll * 0.16);
  col += vec3((hash(gl_FragCoord.xy + vec2(fract(uTime))) - 0.5) / 255.0);

  outColor = vec4(col, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Shader compilation error:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function makeSprite(size: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const x = c.getContext("2d");
  if (!x) return c;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

type Particle = {
  x: number;
  y: number;
  z: number;
  r: number;
  vy: number;
  vx: number;
  ph: number;
  bokeh: boolean;
};

type Spark = {
  x: number;
  y: number;
  z: number;
  s: number;
  ph: number;
};

export default function LiveBackground({ reduce: reduceProp }: { reduce?: boolean }) {
  const prefersReduced = useReducedMotion();
  const reduce = reduceProp ?? !!prefersReduced;
  const glRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const [noGL, setNoGL] = useState(false);

  useEffect(() => {
    const glCanvas = glRef.current;
    const fx = fxRef.current;
    if (!glCanvas || !fx) return;

    const ctx = fx.getContext("2d");
    if (!ctx) return;

    let alive = true;
    let raf = 0;
    const start = performance.now();
    let target = 0;
    let smooth = 0;
    let pxTarget = 0;
    let px = 0;

    let gl: WebGL2RenderingContext | null = glCanvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });

    let prog: WebGLProgram | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let buf: WebGLBuffer | null = null;
    let uRes: WebGLUniformLocation | null = null;
    let uTime: WebGLUniformLocation | null = null;
    let uScroll: WebGLUniformLocation | null = null;

    if (gl) {
      vs = compileShader(gl, gl.VERTEX_SHADER, SILK_VERT);
      fs = compileShader(gl, gl.FRAGMENT_SHADER, SILK_FRAG);
      if (vs && fs) {
        prog = gl.createProgram();
        if (prog) {
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            gl.useProgram(prog);
            buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(
              gl.ARRAY_BUFFER,
              new Float32Array([-1, -1, 3, -1, -1, 3]),
              gl.STATIC_DRAW
            );

            const loc = gl.getAttribLocation(prog, "p");
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

            uRes = gl.getUniformLocation(prog, "uRes");
            uTime = gl.getUniformLocation(prog, "uTime");
            uScroll = gl.getUniformLocation(prog, "uScroll");
          } else {
            console.error("Program link error:", gl.getProgramInfoLog(prog));
            gl = null;
          }
        } else {
          gl = null;
        }
      } else {
        gl = null;
      }
    }

    if (!gl) {
      setNoGL(true);
    }

    const onLost = (e: Event) => {
      e.preventDefault();
      gl = null;
      setNoGL(true);
    };
    glCanvas.addEventListener("webglcontextlost", onLost);

    /* ---- Particles & Sprites ---- */
    const bokeh = makeSprite(128, [
      [0, "rgba(255,255,255,0.22)"],
      [0.62, "rgba(255,255,255,0.30)"],
      [0.86, "rgba(255,255,255,0.60)"],
      [1, "rgba(255,255,255,0)"],
    ]);

    const dust = makeSprite(48, [
      [0, "rgba(255,255,255,1)"],
      [0.2, "rgba(255,255,255,0.85)"],
      [1, "rgba(255,255,255,0)"],
    ]);

    const count = Math.round(
      Math.min(120, Math.max(45, (window.innerWidth * window.innerHeight) / 16000))
    );

    const parts: Particle[] = Array.from({ length: count }, () => {
      const isBokeh = Math.random() < 0.3;
      return {
        x: Math.random(),
        y: Math.random(),
        z: 0.25 + Math.random() * 0.75,
        r: isBokeh ? 8 + Math.random() * 20 : 2 + Math.random() * 4,
        vy: 0.004 + Math.random() * 0.012,
        vx: (Math.random() - 0.5) * 0.004,
        ph: Math.random() * Math.PI * 2,
        bokeh: isBokeh,
      };
    });

    const sparks: Spark[] = [
      { x: 0.93, y: 0.9, z: 0.8, s: 16, ph: 0.4 },
      { x: 0.08, y: 0.32, z: 0.55, s: 10, ph: 2.1 },
      { x: 0.62, y: 0.12, z: 0.65, s: 12, ph: 4.0 },
    ];

    const wrap = (v: number) => ((v % 1) + 1) % 1;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      fx.width = Math.floor(w * dpr);
      fx.height = Math.floor(h * dpr);

      if (gl && glCanvas) {
        const q = dpr * 0.65;
        glCanvas.width = Math.max(1, Math.floor(w * q));
        glCanvas.height = Math.max(1, Math.floor(h * q));
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      }
    };

    const readScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      target = Math.min(1, Math.max(0, window.scrollY / max));
      pxTarget = window.scrollY / Math.max(1, window.innerHeight);
    };

    const drawSilk = (t: number) => {
      if (!gl || !prog) return;
      gl.useProgram(prog);
      gl.uniform2f(uRes, glCanvas.width, glCanvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uScroll, smooth);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const drawFx = (t: number) => {
      const W = fx.width;
      const H = fx.height;
      const dpr = W / window.innerWidth;
      ctx.clearRect(0, 0, W, H);

      for (const p of parts) {
        const y = wrap(p.y - t * p.vy - px * p.z * 0.6);
        const x = wrap(p.x + t * p.vx + Math.sin(t * 0.15 + p.ph) * 0.01 * p.z);
        const tw = 0.65 + 0.35 * Math.sin(t * 0.9 + p.ph * 3);
        const size = p.r * (0.4 + p.z) * dpr;
        ctx.globalAlpha = tw * (0.35 + 0.65 * p.z);
        ctx.drawImage(p.bokeh ? bokeh : dust, x * W - size, y * H - size, size * 2, size * 2);
      }

      ctx.globalAlpha = 1;
      for (const s of sparks) {
        const y = wrap(s.y - px * s.z * 0.3);
        const pulse = 0.75 + 0.25 * Math.sin(t * 1.2 + s.ph);
        const r = s.s * pulse * dpr;
        ctx.save();
        ctx.translate(s.x * W, y * H);
        ctx.shadowColor = "rgba(120, 160, 255, 0.9)";
        ctx.shadowBlur = 14 * dpr;
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.quadraticCurveTo(0, 0, 0, r);
        ctx.quadraticCurveTo(0, 0, -r, 0);
        ctx.quadraticCurveTo(0, 0, 0, -r);
        ctx.fill();
        ctx.restore();
      }
    };

    const frame = (now: number) => {
      if (!alive) return;
      const t = (now - start) / 1000;
      smooth += (target - smooth) * 0.08;
      px += (pxTarget - px) * 0.08;

      drawSilk(t);
      drawFx(t);

      if (!reduce) raf = requestAnimationFrame(frame);
    };

    const onResize = () => {
      resize();
      readScroll();
      if (reduce) frame(start + 12000);
    };

    resize();
    readScroll();
    smooth = target;
    px = pxTarget;

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", readScroll, { passive: true });

    if (reduce) {
      frame(start + 12000);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", readScroll);
      glCanvas.removeEventListener("webglcontextlost", onLost);

      // Clean up GPU memory without destroying the WebGL context
      if (gl) {
        if (prog) gl.deleteProgram(prog);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        if (buf) gl.deleteBuffer(buf);
      }
    };
  }, [reduce]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Fallback gradient if WebGL is unavailable */}
      {noGL && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #ffffff 0%, #e0effe 50%, #c7d2fe 100%)",
          }}
        />
      )}

      {/* WebGL2 Silk Canvas */}
      <canvas
        ref={glRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          display: noGL ? "none" : "block",
        }}
      />

      {/* 2D Particles Canvas */}
      <canvas
        ref={fxRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          display: "block",
        }}
      />

      {/* Very light contrast veil */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(255, 255, 255, 0.08)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}