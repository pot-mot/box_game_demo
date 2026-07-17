import {
    BoxGeometry,
    ShaderMaterial,
    Mesh,
    Color,
    DoubleSide,
} from 'three'
import type {WaterBlockConfig} from '../types/water.ts'
import {
    WATER_COLOR_DEEP,
    WATER_COLOR_SHALLOW,
    WATER_OPACITY,
    WAVE_FREQUENCY,
    WAVE_SPEED,
    WAVE_STRENGTH,
} from './constants.ts'

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
uniform vec3 uWaveParams;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    float freq = uWaveParams.x;
    float speed = uWaveParams.y;
    float strength = uWaveParams.z;

    vec3 aN = abs(N);
    vec3 flowUV;
    if (aN.y > 0.99) {
        flowUV = vec3(vWorldPos.xz, vWorldPos.y);
    } else if (aN.x > 0.99) {
        flowUV = vec3(vWorldPos.yz, vWorldPos.x);
    } else {
        flowUV = vec3(vWorldPos.xy, vWorldPos.z);
    }

    float wave = sin(flowUV.x * freq + flowUV.y * freq * 0.7 + uTime * speed * 1.2) * 0.5
               + cos(flowUV.x * freq * 0.8 - flowUV.y * freq * 1.1 + uTime * speed * 0.9) * 0.5;
    wave = (wave - 0.5) * strength;

    vec3 T = aN.y > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    T = normalize(cross(N, T));
    vec3 B = normalize(cross(N, T));

    vec3 pN = normalize(N + (T + B) * wave);

    float fresnel = pow(1.0 - max(dot(pN, V), 0.0), 4.0);

    float depthFactor = (vLocalPos.y / uSizeY) * 0.5 + 0.5;
    depthFactor = clamp(depthFactor, 0.0, 1.0);
    vec3 waterColor = mix(uColorDeep, uColorShallow, depthFactor);

    vec3 finalColor = waterColor + vec3(0.3, 0.5, 0.7) * fresnel * 0.5;
    float alpha = uOpacity + fresnel * 0.4;

    gl_FragColor = vec4(finalColor, alpha);
}
`

export const createWaterBlockMesh = (config: WaterBlockConfig): Mesh => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mat = new ShaderMaterial({
        uniforms: {
            uTime: {value: 0},
            uColorDeep: {value: new Color(WATER_COLOR_DEEP)},
            uColorShallow: {value: new Color(WATER_COLOR_SHALLOW)},
            uOpacity: {value: WATER_OPACITY},
            uSizeY: {value: config.height},
            uWaveParams: {value: [WAVE_FREQUENCY, WAVE_SPEED, WAVE_STRENGTH]},
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
    const mat = mesh.material as unknown as {uniforms: Record<string, {value: unknown}>}
    mat.uniforms.uSizeY.value = config.height
}

export const disposeWaterBlockMesh = (mesh: Mesh): void => {
    mesh.geometry.dispose()
    const mat = mesh.material as unknown as {dispose: () => void}
    mat.dispose()
}
