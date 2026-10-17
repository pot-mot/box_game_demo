import {ShaderMaterial, Color, Vector2, DoubleSide, type Material} from 'three'
import type {AreaShape} from '../../types/index.ts'
import type {AreaMaterialId} from '../../constants.ts'
import {
    WATER_COLOR_DEEP, WATER_COLOR_SHALLOW, WATER_OPACITY,
    WAVE_STRENGTH, WAVE_HEIGHT_VISUAL, REFRACTION_STRENGTH,
    ENV_TOP_COLOR, ENV_BOTTOM_COLOR,
    AIR_COLOR, AIR_EDGE_COLOR, AIR_OPACITY,
    FORCE_FIELD_COLOR, FORCE_FIELD_EDGE_COLOR, FORCE_FIELD_OPACITY,
} from '../constants.ts'

/** 形状沿局部 Y 的完整高度（供水体深度插值归一） */
export const shapeHeightOf = (shape: AreaShape): number => {
    if (shape.kind === 'box') return shape.height
    if (shape.kind === 'sphere') return shape.radius * 2
    return shape.height
}

const waterVertex = `
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

const waterFragment = `
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

    vec3 T = abs(N.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    T = normalize(cross(N, T));
    vec3 B = normalize(cross(N, T));
    vec3 perturbedN = normalize(N + (T * gradXZ.x + B * gradXZ.y) * uWaveStrength);

    float fresnel = pow(1.0 - max(dot(perturbedN, V), 0.0), 4.0);

    vec2 screenUV = gl_FragCoord.xy / uViewportSize;
    vec2 refrUV = screenUV + vec2(gradXZ.x, gradXZ.y) * uRefractionStrength;
    vec3 refrColor = texture2D(uRefractionTex, refrUV).rgb;

    vec3 reflectDir = reflect(-V, perturbedN);
    float envMix = reflectDir.y * 0.5 + 0.5;
    vec3 envColor = mix(uEnvBottomColor, uEnvTopColor, envMix);

    float depthFactor = (vLocalPos.y / uSizeY) * 0.5 + 0.5;
    depthFactor = clamp(depthFactor, 0.0, 1.0);
    vec3 waterColor = mix(uColorDeep, uColorShallow, depthFactor);
    waterColor += height * uWaveHeightVisual;

    vec3 finalColor = mix(waterColor, refrColor, 0.5 * (1.0 - fresnel));
    finalColor += envColor * fresnel * 0.4;

    float alpha = uOpacity + fresnel * 0.3 + height * 0.1;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
}
`

const volumeVertex = `
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 viewPos = viewMatrix * worldPos;
    vViewDir = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
}
`

const volumeFragment = `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uOpacity;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    float fresnel = pow(1.0 - abs(dot(N, V)), 2.0);
    /* 缓慢流动的能量条纹，增强「体积场」观感 */
    float bands = sin(vWorldPos.y * 2.0 - uTime * 1.2) * 0.5 + 0.5;
    vec3 color = mix(uColor, uEdgeColor, fresnel * 0.8 + bands * 0.2);
    float alpha = uOpacity * (0.5 + fresnel * 0.5) * (0.85 + bands * 0.15);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`

/** 水体材质（折射 + 波动），支持 box / sphere / cylinder（由 uSizeY 适配深度插值） */
const createWaterMaterial = (shape: AreaShape): ShaderMaterial => new ShaderMaterial({
    uniforms: {
        uTime: {value: 0},
        uColorDeep: {value: new Color(WATER_COLOR_DEEP)},
        uColorShallow: {value: new Color(WATER_COLOR_SHALLOW)},
        uOpacity: {value: WATER_OPACITY},
        uSizeY: {value: shapeHeightOf(shape)},
        uViewportSize: {value: new Vector2(1024, 768)},
        uRefractionTex: {value: null},
        uEnvTopColor: {value: new Color(ENV_TOP_COLOR)},
        uEnvBottomColor: {value: new Color(ENV_BOTTOM_COLOR)},
        uWaveStrength: {value: WAVE_STRENGTH},
        uWaveHeightVisual: {value: WAVE_HEIGHT_VISUAL},
        uRefractionStrength: {value: REFRACTION_STRENGTH},
    },
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
})

/** 体积材质（空气 / 力场）：半透明 + 边缘菲涅尔 + 流动条纹 */
const createVolumeMaterial = (color: number, edgeColor: number, opacity: number): ShaderMaterial => new ShaderMaterial({
    uniforms: {
        uTime: {value: 0},
        uColor: {value: new Color(color)},
        uEdgeColor: {value: new Color(edgeColor)},
        uOpacity: {value: opacity},
    },
    vertexShader: volumeVertex,
    fragmentShader: volumeFragment,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
})

/** 按视觉材质标识创建材质 */
export const createAreaMaterial = (material: AreaMaterialId, shape: AreaShape): Material => {
    if (material === 'water') return createWaterMaterial(shape)
    if (material === 'air') return createVolumeMaterial(AIR_COLOR, AIR_EDGE_COLOR, AIR_OPACITY)
    return createVolumeMaterial(FORCE_FIELD_COLOR, FORCE_FIELD_EDGE_COLOR, FORCE_FIELD_OPACITY)
}
