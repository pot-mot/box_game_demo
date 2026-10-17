import {MeshStandardMaterial, type IUniform} from 'three'
import type {SurfaceMaterialId} from './materials/ids.ts'
import {getSurfaceGridTexture, SURFACE_MATERIAL_DEFS} from './materials/index.ts'
import {SURFACE_GRID_COLOR, SURFACE_EDGE_COLOR} from './constants.ts'

export {SURFACE_GRID_COLOR, SURFACE_EDGE_COLOR}

/**
 * 表面材质（箱子 / 碎片共用）。
 *
 * 使用与建筑体素相同的 `MeshStandardMaterial`（同一套粗糙度 / 金属度 / 光照管线），
 * 因此受光表现与建筑一致；网格线烘焙进纹理（`getSurfaceGridTexture`），无需自定义着色器叠加。
 * 燃烧特性通过 `onBeforeCompile` 注入「顶点形变 + 火焰着色」，保留原有燃烧视觉。
 */

/** 燃烧相关 uniform（每个材质实例独立，逐帧更新） */
export interface BurnUniforms {
    uBurnProgress: IUniform<number>
    uTime: IUniform<number>
}

interface SurfaceMaterialUserData {
    burnUniforms: BurnUniforms
}

const VERTEX_HELPERS = `
uniform float uBurnProgress;
uniform float uTime;
varying float vBurnDistort;

// 简易 3D 伪随机哈希
float burnHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float burnNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = burnHash(i);
    float b = burnHash(i + vec3(1.0, 0.0, 0.0));
    float c = burnHash(i + vec3(0.0, 1.0, 0.0));
    float d = burnHash(i + vec3(1.0, 0.0, 0.0) + vec3(0.0, 1.0, 0.0));
    float e = burnHash(i + vec3(0.0, 0.0, 1.0));
    float f_ = burnHash(i + vec3(1.0, 0.0, 1.0));
    float g = burnHash(i + vec3(0.0, 1.0, 1.0));
    float h = burnHash(i + vec3(1.0, 1.0, 1.0));
    return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
               mix(mix(e, f_, f.x), mix(g, h, f.x), f.y), f.z);
}
`

const VERTEX_BURN = `
#include <begin_vertex>
{
    float burnDisplacement = 0.0;
    float burnDistort = 0.5;
    if (uBurnProgress > 0.0) {
        float bt = uTime * 0.5;
        vec3 bp = position * 2.5 + bt;
        float bn = burnNoise(bp);
        float bn2 = burnNoise(bp * 1.7 + 100.0);
        float swellPhase = smoothstep(0.0, 0.6, uBurnProgress);
        float shrinkPhase = smoothstep(0.6, 1.0, uBurnProgress);
        float displaceAmount = swellPhase * (1.0 - shrinkPhase) * 0.25 + shrinkPhase * -0.35;
        burnDisplacement = (bn * 0.6 + bn2 * 0.4) * displaceAmount;
        burnDistort = burnDisplacement * 5.0 + 0.5;
    }
    vBurnDistort = burnDistort;
    transformed += objectNormal * burnDisplacement;
}
`

const FRAGMENT_HEADER = `
uniform float uBurnProgress;
varying float vBurnDistort;
`

const FRAGMENT_BURN = `
{
    float burnBlend = smoothstep(0.0, 0.4, uBurnProgress);
    if (burnBlend > 0.0) {
        float p = uBurnProgress;
        vec3 fire;
        if (p < 0.2) {
            fire = mix(vec3(1.0), vec3(1.0, 1.0, 0.0), p / 0.2);
        } else if (p < 0.4) {
            fire = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.4, 0.0), (p - 0.2) / 0.2);
        } else if (p < 0.6) {
            fire = mix(vec3(1.0, 0.4, 0.0), vec3(0.8, 0.2, 0.0), (p - 0.4) / 0.2);
        } else if (p < 0.8) {
            fire = mix(vec3(0.8, 0.2, 0.0), vec3(0.4, 0.0, 0.0), (p - 0.6) / 0.2);
        } else {
            fire = mix(vec3(0.4, 0.0, 0.0), vec3(0.0), (p - 0.8) / 0.2);
        }
        fire = clamp(fire + vec3(vBurnDistort * 0.3, vBurnDistort * 0.15, 0.0), 0.0, 1.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fire, burnBlend);
    }
}
`

interface SurfaceMaterialOptions {
    /** 碎片等凸包几何需平面着色，避免平滑法线导致受光发圆 */
    readonly flatShading?: boolean
}

/**
 * 创建表面材质（箱子 / 碎片共用）：与建筑一致的 `MeshStandardMaterial` + 内置燃烧注入。
 * 每个实例持有独立燃烧 uniform（`userData.burnUniforms`），通过 `updateSurfaceBurn` 更新。
 */
export const createSurfaceGridMaterial = (
    material: SurfaceMaterialId,
    options?: SurfaceMaterialOptions,
): MeshStandardMaterial => {
    const def = SURFACE_MATERIAL_DEFS[material]
    const burnUniforms: BurnUniforms = {
        uBurnProgress: {value: 0},
        uTime: {value: 0},
    }
    const mat = new MeshStandardMaterial({
        map: getSurfaceGridTexture(material),
        roughness: def.roughness,
        metalness: def.metalness,
        flatShading: options?.flatShading ?? false,
    })
    ;(mat.userData as SurfaceMaterialUserData).burnUniforms = burnUniforms

    mat.onBeforeCompile = (shader): void => {
        shader.uniforms.uBurnProgress = burnUniforms.uBurnProgress
        shader.uniforms.uTime = burnUniforms.uTime

        shader.vertexShader = VERTEX_HELPERS + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', VERTEX_BURN)
        shader.fragmentShader = FRAGMENT_HEADER + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <colorspace_fragment>',
            `${FRAGMENT_BURN}\n#include <colorspace_fragment>`,
        )
    }
    return mat
}

/** 取材质的燃烧 uniform（逐帧更新用） */
const burnUniformsOf = (material: MeshStandardMaterial): BurnUniforms =>
    (material.userData as SurfaceMaterialUserData).burnUniforms

/** 更新燃烧进度与时间（逐帧，仅燃烧特性调用） */
export const updateSurfaceBurn = (material: MeshStandardMaterial, burnProgress: number, dt: number): void => {
    const uniforms = burnUniformsOf(material)
    uniforms.uBurnProgress.value = burnProgress
    uniforms.uTime.value += dt
}

/** 切换表面材质采样的纹理（保留燃烧 uniform，仅更新 map，无需重编译着色器） */
export const updateSurfaceMap = (material: MeshStandardMaterial, next: SurfaceMaterialId): void => {
    material.map = getSurfaceGridTexture(next)
}
