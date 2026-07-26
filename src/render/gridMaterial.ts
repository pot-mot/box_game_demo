import {ShaderMaterial, MeshBasicMaterial, Color, DoubleSide} from 'three'
import {gridMaskTexture, coloredGridTexture} from './texture.ts'

// ── 箱体着色器 ──

const BOX_VERTEX = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const BOX_FRAGMENT = `
uniform vec3 uBaseColor;
uniform vec3 uGridColor;
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
    float mask = texture2D(uMap, vUv).r;
    vec3 col = mix(uBaseColor, uGridColor, mask);
    gl_FragColor = vec4(col, 1.0);
}
`

/** 创建箱体网格 ShaderMaterial */
export const createGridBoxMaterial = (baseColor: number, gridColor: number): ShaderMaterial => {
    return new ShaderMaterial({
        uniforms: {
            uBaseColor: {value: new Color(baseColor)},
            uGridColor: {value: new Color(gridColor)},
            uMap: {value: gridMaskTexture()},
        },
        vertexShader: BOX_VERTEX,
        fragmentShader: BOX_FRAGMENT,
    })
}

/** 创建地形网格 MeshBasicMaterial（带色纹理 + 顶点色，双面渲染） */
export const createGridTerrainMaterial = (baseColor: number, gridColor: number): MeshBasicMaterial => {
    return new MeshBasicMaterial({
        map: coloredGridTexture(baseColor, gridColor),
        vertexColors: true,
        side: DoubleSide,
    })
}
