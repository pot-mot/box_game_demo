import {BoxGeometry, ShaderMaterial, Mesh, Color, DoubleSide, Vector2} from 'three'
import type {WaterBlockConfig} from '../types'
import {
    WATER_COLOR_DEEP, WATER_COLOR_SHALLOW, WATER_OPACITY,
    WAVE_STRENGTH, WAVE_HEIGHT_VISUAL, REFRACTION_STRENGTH,
    ENV_TOP_COLOR, ENV_BOTTOM_COLOR,
} from './constants.ts'

// ── 着色器 ──

const vertexShader = `
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;
void main() {
    vLocalPos = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 viewPos = viewMatrix * worldPos;
    vViewDir = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
}
`

const fragmentShader = `
uniform float uTime;
uniform vec3 uColorDeep;
uniform vec3 uColorShallow;
uniform float uOpacity;
uniform float uSizeY;
uniform vec2 uViewportSize;
uniform sampler2D uRefractionTex;
uniform vec3 uEnvTopColor;
uniform vec3 uEnvBottomColor;
uniform float uWaveStrength;
uniform float uWaveHeightVisual;
uniform float uRefractionStrength;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // ── 8 层 Gerstner-like 波浪 ──
    vec2 waveDirs[8] = vec2[](
        vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(0.7, 0.7), vec2(-0.3, 0.9),
        vec2(0.9, -0.3), vec2(-0.8, -0.6), vec2(0.5, -0.8), vec2(-0.5, 0.5)
    );
    float waveFreqs[8] = float[](1.2, 2.0, 0.8, 2.8, 1.6, 1.0, 3.5, 0.5);
    float waveSpeeds[8] = float[](0.6, 0.9, 0.4, 1.1, 0.7, 0.5, 1.3, 0.3);
    float waveAmps[8] = float[](0.25, 0.15, 0.20, 0.10, 0.18, 0.12, 0.08, 0.06);

    float height = 0.0;
    vec2 gradXZ = vec2(0.0);
    for (int i = 0; i < 8; i++) {
        float phase = dot(waveDirs[i], vWorldPos.xz) * waveFreqs[i] + uTime * waveSpeeds[i];
        float s = sin(phase);
        float c = cos(phase);
        height += waveAmps[i] * s;
        gradXZ += waveAmps[i] * waveFreqs[i] * waveDirs[i] * c;
    }

    // ── 切线空间法线扰动 ──
    vec3 T = abs(N.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    T = normalize(cross(N, T));
    vec3 B = normalize(cross(N, T));
    vec3 perturbedN = normalize(N + (T * gradXZ.x + B * gradXZ.y) * uWaveStrength);

    // ── Fresnel（Schlick 近似）──
    float fresnel = pow(1.0 - max(dot(perturbedN, V), 0.0), 4.0);

    // ── 折射 ──
    vec2 screenUV = gl_FragCoord.xy / uViewportSize;
    vec2 refrUV = screenUV + vec2(gradXZ.x, gradXZ.y) * uRefractionStrength;
    vec3 refrColor = texture2D(uRefractionTex, refrUV).rgb;

    // ── 环境反射 ──
    vec3 reflectDir = reflect(-V, perturbedN);
    float envMix = reflectDir.y * 0.5 + 0.5;
    vec3 envColor = mix(uEnvBottomColor, uEnvTopColor, envMix);

    // ── 水体颜色（深度渐变 + 波浪亮度调制）──
    float depthFactor = (vLocalPos.y / uSizeY) * 0.5 + 0.5;
    depthFactor = clamp(depthFactor, 0.0, 1.0);
    vec3 waterColor = mix(uColorDeep, uColorShallow, depthFactor);
    waterColor += height * uWaveHeightVisual;

    // ── 混合 ──
    vec3 finalColor = mix(waterColor, refrColor, 0.5 * (1.0 - fresnel));
    finalColor += envColor * fresnel * 0.4;

    float alpha = uOpacity + fresnel * 0.3 + height * 0.1;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
}
`

// ── 网格 ──

export const createWaterBlockMesh = (config: WaterBlockConfig): Mesh => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mat = new ShaderMaterial({
        uniforms: {
            uTime: {value: 0},
            uColorDeep: {value: new Color(WATER_COLOR_DEEP)},
            uColorShallow: {value: new Color(WATER_COLOR_SHALLOW)},
            uOpacity: {value: WATER_OPACITY},
            uSizeY: {value: config.height},
            uViewportSize: {value: new Vector2(1024, 768)},
            uRefractionTex: {value: null},
            uEnvTopColor: {value: new Color(ENV_TOP_COLOR)},
            uEnvBottomColor: {value: new Color(ENV_BOTTOM_COLOR)},
            uWaveStrength: {value: WAVE_STRENGTH},
            uWaveHeightVisual: {value: WAVE_HEIGHT_VISUAL},
            uRefractionStrength: {value: REFRACTION_STRENGTH},
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
    })
    return new Mesh(geo, mat)
}

export const updateWaterBlockMeshSize = (mesh: Mesh, config: WaterBlockConfig): void => {
    const oldGeo = mesh.geometry
    mesh.geometry = new BoxGeometry(config.width, config.height, config.depth)
    oldGeo.dispose()
    const mat = mesh.material as ShaderMaterial
    mat.uniforms.uSizeY.value = config.height
}

export const disposeWaterBlockMesh = (mesh: Mesh): void => {
    mesh.geometry.dispose()
    const mat = mesh.material as ShaderMaterial
    mat.dispose()
}
