/**
 * PostFX.ts — full-screen "anime" post pass on top of the cel render: radial motion blur for
 * chakra dashes and the ultimate rush, refraction shockwaves on heavy impacts and jutsu contact,
 * chromatic aberration on hits, two-tone impact frames (the black/white anime hit frame), a soft
 * vignette and a warm grade. Everything is driven by a handful of uniforms the game pokes.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const StormShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uBlur: { value: 0 },
    uBlurCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uShock: { value: 0 },
    uShockCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uShockRadius: { value: 0 },
    uAberration: { value: 0 },
    uImpact: { value: 0 },
    uImpactColor: { value: new THREE.Color(0xffffff) },
    uVignette: { value: 0.22 },
    uFlash: { value: 0 },
    uAspect: { value: 1.78 },
    uHeat: { value: 0 },
    uHeatCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uBlur, uShock, uShockRadius, uAberration, uImpact, uVignette, uFlash, uAspect, uHeat;
    uniform vec2 uBlurCenter, uShockCenter, uHeatCenter;
    uniform vec3 uImpactColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 asp = vec2(uAspect, 1.0);
      // --- shockwave refraction ring (jutsu / ultimate contact, heavy knockdowns) ---
      if (uShock > 0.001) {
        vec2 d = (uv - uShockCenter) * asp;
        float dist = length(d);
        float w = smoothstep(uShockRadius - 0.12, uShockRadius, dist) * (1.0 - smoothstep(uShockRadius, uShockRadius + 0.12, dist));
        uv += normalize(d + 1e-5) / asp * w * uShock * 0.06;
      }
      // --- heat / chakra refraction (wobble around a point while a jutsu is out) ---
      if (uHeat > 0.001) {
        vec2 d = (uv - uHeatCenter) * asp;
        float dist = length(d);
        float fall = smoothstep(0.5, 0.0, dist);
        uv += vec2(sin(uv.y * 60.0 + uTime * 9.0), cos(uv.x * 55.0 - uTime * 7.0)) * 0.006 * uHeat * fall;
      }
      // --- radial motion blur toward a screen point (dash / rush) ---
      vec3 col;
      if (uBlur > 0.001) {
        vec2 dir = (uBlurCenter - uv) * uBlur * 0.14;
        col = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 10; i++) {
          float t = float(i) / 9.0;
          float w = 1.0 - t * 0.6;
          col += texture2D(tDiffuse, uv + dir * t).rgb * w;
          wsum += w;
        }
        col /= wsum;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      // --- chromatic aberration on hits ---
      if (uAberration > 0.001) {
        vec2 off = (uv - 0.5) * uAberration * 0.02;
        col.r = texture2D(tDiffuse, uv + off).r;
        col.b = texture2D(tDiffuse, uv - off).b;
      }
      // --- impact frame: two-tone ink flash ---
      if (uImpact > 0.001) {
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 ink = mix(vec3(0.02, 0.02, 0.05), uImpactColor, step(0.42, l));
        col = mix(col, ink, uImpact);
      }
      // --- warm grade + vignette + white flash ---
      col = mix(col, col * vec3(1.03, 1.0, 0.96), 0.5);
      float vig = smoothstep(1.35, 0.35, length((uv - 0.5) * vec2(1.15, 1.0)));
      col *= mix(1.0, vig, uVignette);
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  readonly composer: EffectComposer;
  private pass: ShaderPass;
  enabled = true;
  private shockT = 0; private shockLife = 0;
  private aberr = 0; private impact = 0; private flash = 0; private heat = 0;
  blurTarget = 0; private blur = 0;
  private tmp = new THREE.Vector3();

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.pass = new ShaderPass(StormShader);
    this.composer.addPass(this.pass);
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.pass.uniforms.uAspect.value = w / h;
  }

  private toScreen(world: THREE.Vector3, camera: THREE.Camera, out: THREE.Vector2): void {
    this.tmp.copy(world).project(camera);
    out.set(THREE.MathUtils.clamp(this.tmp.x * 0.5 + 0.5, -0.2, 1.2), THREE.MathUtils.clamp(this.tmp.y * 0.5 + 0.5, -0.2, 1.2));
  }

  /** Expanding refraction ring from a world point. */
  shockwave(world: THREE.Vector3, camera: THREE.Camera, strength = 1, life = 0.45): void {
    this.toScreen(world, camera, this.pass.uniforms.uShockCenter.value as THREE.Vector2);
    this.pass.uniforms.uShock.value = strength;
    this.shockT = 0; this.shockLife = life;
  }
  /** Chromatic split for a few frames (hits). */
  aberration(strength = 1): void { this.aberr = Math.max(this.aberr, strength); }
  /** Two-tone anime impact frame; `frames` render frames. */
  impactFrame(strength = 1, color = 0xffffff): void { this.impact = Math.max(this.impact, strength); (this.pass.uniforms.uImpactColor.value as THREE.Color).set(color); }
  whiteFlash(strength = 0.9): void { this.flash = Math.max(this.flash, strength); }
  /** Heat/chakra wobble around a world point this frame (call every frame while active). */
  heatAt(world: THREE.Vector3, camera: THREE.Camera, strength = 1): void {
    this.toScreen(world, camera, this.pass.uniforms.uHeatCenter.value as THREE.Vector2);
    this.heat = Math.max(this.heat, strength);
  }
  /** Radial blur focus (the enemy while dashing). */
  blurAt(world: THREE.Vector3, camera: THREE.Camera): void { this.toScreen(world, camera, this.pass.uniforms.uBlurCenter.value as THREE.Vector2); }

  render(dt: number, scene: THREE.Scene, camera: THREE.Camera): void {
    const u = this.pass.uniforms;
    u.uTime.value += dt;
    // decay the transient effects
    this.blur += (this.blurTarget - this.blur) * Math.min(1, 9 * dt);
    u.uBlur.value = this.blur;
    if (this.shockLife > 0) {
      this.shockT += dt;
      const k = this.shockT / this.shockLife;
      u.uShockRadius.value = 0.05 + k * 0.9;
      u.uShock.value *= Math.exp(-3.5 * dt);
      if (k >= 1) { this.shockLife = 0; u.uShock.value = 0; }
    }
    u.uAberration.value = this.aberr; this.aberr *= Math.exp(-10 * dt);
    u.uImpact.value = this.impact; this.impact = this.impact > 0.05 ? this.impact - dt * 7 : 0;
    u.uFlash.value = this.flash; this.flash *= Math.exp(-7 * dt);
    u.uHeat.value = this.heat; this.heat = 0;
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.composer.render(dt);
  }
}
