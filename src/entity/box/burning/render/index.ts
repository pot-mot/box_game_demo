import {
    BoxGeometry, ShaderMaterial, Mesh, LineSegments, LineBasicMaterial,
    Points, PointsMaterial, BufferGeometry, Float32BufferAttribute,
    AdditiveBlending,
} from 'three'
import type {BurningBoxConfig, BurningBox, ParticleData} from '../types'
import {makeEdgeLines} from '../../base/render'
import {EDGE_COLOR} from './constants.ts'
import {
    MAX_PARTICLES, PARTICLE_SPAWN_RATE, PARTICLE_LIFETIME,
    PARTICLE_SPEED, PARTICLE_SIZE_BASE, PARTICLE_SIZE_MAX,
} from './constants.ts'

// ── 着色器 ──

const vertexShader = `
uniform float uBurnProgress;
uniform float uTime;

varying vec3 vPosition;
varying float vDistort;

// 简易 3D 伪随机哈希
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec3(1.0, 0.0, 0.0));
    float c = hash(i + vec3(0.0, 1.0, 0.0));
    float d = hash(i + vec3(1.0, 1.0, 0.0));
    float e = hash(i + vec3(0.0, 0.0, 1.0));
    float f_ = hash(i + vec3(1.0, 0.0, 1.0));
    float g = hash(i + vec3(0.0, 1.0, 1.0));
    float h = hash(i + vec3(1.0, 1.0, 1.0));
    float ux = f.x, uy = f.y, uz = f.z;
    return mix(mix(mix(a, b, ux), mix(c, d, ux), uy),
               mix(mix(e, f_, ux), mix(g, h, ux), uy), uz);
}

void main() {
    vPosition = position;

    // 基于顶点位置 + 时间 + burnProgress 的扭曲量
    float t = uTime * 0.5;
    vec3 p = position * 2.5 + t;
    float n = noise(p);
    float n2 = noise(p * 1.7 + 100.0);

    // 扭曲强度：随 burnProgress 先增后减（最后阶段收缩）
    float swellPhase = smoothstep(0.0, 0.6, uBurnProgress);
    float shrinkPhase = smoothstep(0.6, 1.0, uBurnProgress);
    float displaceAmount = swellPhase * (1.0 - shrinkPhase) * 0.25 + shrinkPhase * -0.35;

    // 混合噪声产生不规则位移
    float displacement = (n * 0.6 + n2 * 0.4) * displaceAmount;

    vDistort = displacement * 5.0 + 0.5;

    vec3 displacedPos = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPos, 1.0);
}
`

const fragmentShader = `
uniform float uBurnProgress;

varying vec3 vPosition;
varying float vDistort;

void main() {
    // 颜色渐变：白 → 黄 → 橙 → 红 → 黑
    vec3 white = vec3(1.0, 1.0, 1.0);
    vec3 yellow = vec3(1.0, 1.0, 0.0);
    vec3 orange = vec3(1.0, 0.4, 0.0);
    vec3 red = vec3(0.8, 0.2, 0.0);
    vec3 dark = vec3(0.4, 0.0, 0.0);
    vec3 black = vec3(0.0, 0.0, 0.0);

    float p = uBurnProgress;

    vec3 color;
    if (p < 0.2) {
        color = mix(white, yellow, p / 0.2);
    } else if (p < 0.4) {
        color = mix(yellow, orange, (p - 0.2) / 0.2);
    } else if (p < 0.6) {
        color = mix(orange, red, (p - 0.4) / 0.2);
    } else if (p < 0.8) {
        color = mix(red, dark, (p - 0.6) / 0.2);
    } else {
        color = mix(dark, black, (p - 0.8) / 0.2);
    }

    // 添加基于扭曲的热量变化
    color += vec3(vDistort * 0.3, vDistort * 0.15, 0.0);
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
`

// ── 网格 ──

export const createBurningBoxMesh = (config: BurningBoxConfig): {mesh: Mesh; edges: LineSegments} => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    const mat = new ShaderMaterial({
        uniforms: {
            uBurnProgress: {value: 0},
            uTime: {value: 0},
        },
        vertexShader,
        fragmentShader,
    })
    const mesh = new Mesh(geo, mat)
    const edges = makeEdgeLines(geo, EDGE_COLOR)
    mesh.add(edges)
    return {mesh, edges}
}

export const updateBurningBoxMeshSize = (pb: BurningBox, config: BurningBoxConfig): void => {
    const geo = new BoxGeometry(config.width, config.height, config.depth)
    pb.mesh.geometry.dispose()
    pb.mesh.geometry = geo
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
    pb.edges = makeEdgeLines(geo, EDGE_COLOR)
    pb.mesh.add(pb.edges)
}

export const disposeBurningBoxMesh = (pb: BurningBox): void => {
    pb.mesh.geometry.dispose()
    ;(pb.mesh.material as ShaderMaterial).dispose()
    pb.mesh.remove(pb.edges)
    pb.edges.geometry.dispose()
    ;(pb.edges.material as LineBasicMaterial).dispose()
}

// ── 粒子系统 ──

export const createParticleData = (): ParticleData => ({
    pos: new Float32Array(MAX_PARTICLES * 3),
    vel: new Float32Array(MAX_PARTICLES * 3),
    color: new Float32Array(MAX_PARTICLES * 3),
    size: new Float32Array(MAX_PARTICLES),
    age: new Float32Array(MAX_PARTICLES),
    lifetime: new Float32Array(MAX_PARTICLES),
    active: new Uint8Array(MAX_PARTICLES),
})

export const createParticlePoints = (): Points => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
    geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
    geo.setAttribute('size', new Float32BufferAttribute(new Float32Array(MAX_PARTICLES), 1))

    const mat = new PointsMaterial({
        size: PARTICLE_SIZE_BASE,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
    })

    return new Points(geo, mat)
}

const spawnParticle = (
    data: ParticleData,
    index: number,
    boxSize: {width: number; height: number; depth: number},
    burnProgress: number,
): void => {
    const i3 = index * 3
    // 粒子位置使用局部坐标（相对于 Points 对象），Points.position 已经对齐到 body 位置
    const face = Math.floor(Math.random() * 6)
    const rx = (Math.random() - 0.5) * boxSize.width
    const ry = (Math.random() - 0.5) * boxSize.height
    const rz = (Math.random() - 0.5) * boxSize.depth

    const hw = boxSize.width / 2
    const hh = boxSize.height / 2
    const hd = boxSize.depth / 2

    switch (face) {
        case 0: data.pos[i3] = hw; data.pos[i3 + 1] = ry; data.pos[i3 + 2] = rz; break
        case 1: data.pos[i3] = -hw; data.pos[i3 + 1] = ry; data.pos[i3 + 2] = rz; break
        case 2: data.pos[i3] = rx; data.pos[i3 + 1] = hh; data.pos[i3 + 2] = rz; break
        case 3: data.pos[i3] = rx; data.pos[i3 + 1] = -hh; data.pos[i3 + 2] = rz; break
        case 4: data.pos[i3] = rx; data.pos[i3 + 1] = ry; data.pos[i3 + 2] = hd; break
        case 5: data.pos[i3] = rx; data.pos[i3 + 1] = ry; data.pos[i3 + 2] = -hd; break
    }

    // 速度：向上为主 + 随机外扩
    const speed = PARTICLE_SPEED * (0.5 + burnProgress * 0.5)
    data.vel[i3] = (Math.random() - 0.5) * speed * 0.6
    data.vel[i3 + 1] = speed * (0.8 + Math.random() * 0.4)
    data.vel[i3 + 2] = (Math.random() - 0.5) * speed * 0.6

    // 颜色：随 burnProgress 变化，粒子初始色偏亮
    const p = burnProgress
    if (p < 0.5) {
        // 火焰色：白→黄→橙
        const t = p * 2
        data.color[i3] = 1.0
        data.color[i3 + 1] = 1.0 - t * 0.4
        data.color[i3 + 2] = 1.0 - t * 0.8
    } else {
        // 后段：橙→红→暗
        const t = (p - 0.5) * 2
        data.color[i3] = 1.0 - t * 0.3
        data.color[i3 + 1] = 0.6 - t * 0.5
        data.color[i3 + 2] = 0.0
    }

    data.size[index] = PARTICLE_SIZE_BASE * (0.5 + Math.random())
    data.age[index] = 0
    data.lifetime[index] = PARTICLE_LIFETIME * (0.5 + Math.random() * 0.5)
    data.active[index] = 1
}

export const updateParticles = (
    data: ParticleData,
    points: Points,
    dt: number,
    boxSize: {width: number; height: number; depth: number},
    burnProgress: number,
): void => {
    const posAttr = points.geometry.attributes.position as Float32BufferAttribute
    const colAttr = points.geometry.attributes.color as Float32BufferAttribute
    const sizeAttr = points.geometry.attributes.size as Float32BufferAttribute

    // 更新现有粒子
    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (!data.active[i]) continue
        const i3 = i * 3
        data.age[i] += dt
        if (data.age[i] >= data.lifetime[i]) {
            data.active[i] = 0
            posAttr.array[i3] = 0
            posAttr.array[i3 + 1] = 0
            posAttr.array[i3 + 2] = 0
            continue
        }

        const lifeRatio = data.age[i] / data.lifetime[i]

        // 移动
        data.pos[i3] += data.vel[i3] * dt
        data.pos[i3 + 1] += data.vel[i3 + 1] * dt
        data.pos[i3 + 2] += data.vel[i3 + 2] * dt

        // 速度衰减 + 浮力上飘
        data.vel[i3 + 1] += 1.5 * dt
        data.vel[i3] *= 0.98
        data.vel[i3 + 2] *= 0.98

        // 大小：先增大后缩小
        const sizeScale = lifeRatio < 0.3 ? lifeRatio / 0.3 : 1.0 - (lifeRatio - 0.3) / 0.7
        data.size[i] = PARTICLE_SIZE_BASE + (PARTICLE_SIZE_MAX - PARTICLE_SIZE_BASE) * sizeScale

        // 颜色随生命周期变暗
        const fadeOut = 1.0 - lifeRatio * lifeRatio
        data.color[i3] *= fadeOut
        data.color[i3 + 1] *= fadeOut * 0.8
        data.color[i3 + 2] *= fadeOut * 0.3

        data.color[i3] = Math.max(0, data.color[i3])
        data.color[i3 + 1] = Math.max(0, data.color[i3 + 1])
        data.color[i3 + 2] = Math.max(0, data.color[i3 + 2])

        posAttr.array[i3] = data.pos[i3]
        posAttr.array[i3 + 1] = data.pos[i3 + 1]
        posAttr.array[i3 + 2] = data.pos[i3 + 2]
        colAttr.array[i3] = data.color[i3]
        colAttr.array[i3 + 1] = data.color[i3 + 1]
        colAttr.array[i3 + 2] = data.color[i3 + 2]
        sizeAttr.array[i] = data.size[i]
    }

    // 生成新粒子
    const spawnCount = Math.floor(PARTICLE_SPAWN_RATE * (0.5 + burnProgress * 1.5))
    let spawned = 0
    for (let i = 0; i < MAX_PARTICLES && spawned < spawnCount; i++) {
        if (!data.active[i]) {
            spawnParticle(data, i, boxSize, burnProgress)
            spawned++
        }
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
}

export const disposeParticlePoints = (points: Points): void => {
    points.geometry.dispose()
    ;(points.material as PointsMaterial).dispose()
}
