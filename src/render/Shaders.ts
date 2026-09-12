/**
 * Shaders.ts — Two-pass anime rendering:
 *   Pass 1: quantized 3-band cel diffuse + hard specular banding + fresnel rim.
 *   Pass 2: inverted-hull outline (front-face culled, normals extruded, distance-scaled).
 */
import * as THREE from 'three';

export const CEL_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;

  #include <skinning_pars_vertex>

  void main() {
    vUv = uv;
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vPosW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * objectNormal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const CEL_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uAlbedo;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uAmbient;
  uniform vec3 uRimColor;
  uniform float uRimThreshold;
  uniform float uSpecPower;
  uniform float uSpecThreshold;
  uniform vec3 uSpecColor;
  uniform float uEmissive;
  uniform sampler2D uMap;
  uniform float uUseMap;
  uniform float uFlash;
  uniform float uAlphaTest;
  uniform float uAlphaBlend;

  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vPosW);

    vec3 albedo = uAlbedo;
    float outAlpha = 1.0;
    if (uUseMap > 0.5) {
      vec4 texel = texture2D(uMap, vUv);
      albedo *= texel.rgb;
      if (uAlphaTest > 0.0 && texel.a < uAlphaTest) discard;
      if (uAlphaBlend > 0.5) outAlpha = texel.a;
    }

    // --- Quantized diffuse: 3 discrete bands ---
    float NdotL = dot(N, L);
    float band;
    if (NdotL > 0.5)      band = 1.0;   // Direct light
    else if (NdotL > 0.0) band = 0.6;   // Midtone
    else                  band = 0.3;   // Shadow tone

    vec3 color = albedo * band * uLightColor + albedo * uAmbient;

    // --- Hard specular banding ---
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), uSpecPower);
    float specBand = step(uSpecThreshold, spec);
    color += uSpecColor * specBand * 0.35;

    // --- Fresnel rim lighting: (1 - N.V)^3 > threshold ---
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float rim = step(uRimThreshold, fresnel);
    color += uRimColor * rim * 0.55;

    color += albedo * uEmissive;
    color = mix(color, vec3(1.0), uFlash);

    gl_FragColor = vec4(color, outAlpha);
  }
`;

export const OUTLINE_VERTEX = /* glsl */ `
  uniform float uOutlineWidth;
  uniform float uRefDistance;

  #include <skinning_pars_vertex>

  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vec3 worldNormal = normalize(mat3(modelMatrix) * objectNormal);
    float dist = length(cameraPosition - worldPos.xyz);
    float scale = clamp(dist / uRefDistance, 0.5, 2.0);
    worldPos.xyz += worldNormal * uOutlineWidth * scale;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const OUTLINE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uInk;
  void main() {
    gl_FragColor = vec4(uInk, 1.0);
  }
`;

export interface CelMaterialOptions {
  albedo: THREE.ColorRepresentation;
  rimColor?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  emissive?: number;
  skinning?: boolean;
  /** Discard fragments whose texture alpha is below this (0 = off). Used for foliage cards. */
  alphaTest?: number;
  doubleSided?: boolean;
  /** Output the texture alpha (for blended FX sheets / soft ground overlays). */
  alphaBlend?: boolean;
}

export const SHARED_LIGHT = {
  dir: new THREE.Vector3(0.45, 0.85, 0.3).normalize(),
  color: new THREE.Color(1.0, 0.97, 0.92),
  ambient: new THREE.Color(0.22, 0.24, 0.3),
};

export function createCelMaterial(opts: CelMaterialOptions): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader: CEL_VERTEX,
    fragmentShader: CEL_FRAGMENT,
    uniforms: {
      uAlbedo: { value: new THREE.Color(opts.albedo) },
      uLightDir: { value: SHARED_LIGHT.dir },
      uLightColor: { value: SHARED_LIGHT.color },
      uAmbient: { value: SHARED_LIGHT.ambient },
      uRimColor: { value: new THREE.Color(opts.rimColor ?? 0xffffff) },
      uRimThreshold: { value: 0.6 },
      uSpecPower: { value: 48.0 },
      uSpecThreshold: { value: 0.45 },
      uSpecColor: { value: new THREE.Color(1, 1, 1) },
      uEmissive: { value: opts.emissive ?? 0.0 },
      uMap: { value: opts.map ?? null },
      uUseMap: { value: opts.map ? 1.0 : 0.0 },
      uFlash: { value: 0.0 },
      uAlphaTest: { value: opts.alphaTest ?? 0.0 },
      uAlphaBlend: { value: opts.alphaBlend ? 1.0 : 0.0 },
    },
    transparent: !!opts.alphaBlend,
    depthWrite: !opts.alphaBlend,
    side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  return mat;
}

export function createOutlineMaterial(width = 0.035, ink: THREE.ColorRepresentation = new THREE.Color(0.04, 0.04, 0.04)): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    uniforms: {
      uOutlineWidth: { value: width },
      uRefDistance: { value: 10.0 },
      uInk: { value: new THREE.Color(ink) },
    },
    side: THREE.BackSide, // front-face culling => render back faces of the extruded shell
    depthWrite: true,
  });
}

/**
 * Attach an inverted-hull outline child to a mesh (or every mesh under an Object3D).
 * The outline shares geometry and skeleton so it follows skinned animation.
 */
export function addInvertedHull(root: THREE.Object3D, width = 0.035): THREE.Mesh[] {
  const created: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && !(obj as THREE.Mesh).userData.isOutline) {
      const mesh = obj as THREE.Mesh;
      const outlineMat = createOutlineMaterial(width);
      let outline: THREE.Mesh;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = mesh as THREE.SkinnedMesh;
        const so = new THREE.SkinnedMesh(sm.geometry, outlineMat);
        so.bind(sm.skeleton, sm.bindMatrix);
        outline = so;
      } else {
        outline = new THREE.Mesh(mesh.geometry, outlineMat);
      }
      outline.userData.isOutline = true;
      outline.renderOrder = mesh.renderOrder - 1;
      outline.frustumCulled = false;
      mesh.add(outline);
      created.push(outline);
    }
  });
  return created;
}

/** Sets the white hit-flash intensity on every cel material under root. */
export function setFlash(root: THREE.Object3D, amount: number): void {
  root.traverse((obj) => {
    const m = (obj as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (m && m.uniforms && m.uniforms.uFlash) m.uniforms.uFlash.value = amount;
  });
}
