import {Vec3} from 'cannon-es'
import type {FragmentData} from '../types'

const EPS = 1e-6
const PLANE_EPS = 1e-5

interface ConstraintPlane {
    normal: Vec3
    d: number
    isBoxFace: boolean
}

const solvePlanes = (p1: ConstraintPlane, p2: ConstraintPlane, p3: ConstraintPlane): Vec3 | null => {
    const n1 = p1.normal, d1 = p1.d
    const n2 = p2.normal, d2 = p2.d
    const n3 = p3.normal, d3 = p3.d

    const n2xn3 = new Vec3(
        n2.y * n3.z - n2.z * n3.y,
        n2.z * n3.x - n2.x * n3.z,
        n2.x * n3.y - n2.y * n3.x,
    )
    const det = n1.x * n2xn3.x + n1.y * n2xn3.y + n1.z * n2xn3.z

    if (Math.abs(det) < EPS) return null

    const invDet = 1 / det
    const n3xn1 = new Vec3(
        n3.y * n1.z - n3.z * n1.y,
        n3.z * n1.x - n3.x * n1.z,
        n3.x * n1.y - n3.y * n1.x,
    )
    const n1xn2 = new Vec3(
        n1.y * n2.z - n1.z * n2.y,
        n1.z * n2.x - n1.x * n2.z,
        n1.x * n2.y - n1.y * n2.x,
    )

    return new Vec3(
        (d1 * n2xn3.x + d2 * n3xn1.x + d3 * n1xn2.x) * invDet,
        (d1 * n2xn3.y + d2 * n3xn1.y + d3 * n1xn2.y) * invDet,
        (d1 * n2xn3.z + d2 * n3xn1.z + d3 * n1xn2.z) * invDet,
    )
}

const pointInsideConstraint = (p: Vec3, plane: ConstraintPlane): boolean =>
    p.x * plane.normal.x + p.y * plane.normal.y + p.z * plane.normal.z <= plane.d + PLANE_EPS

const vec3Key = (v: Vec3): string =>
    `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`

const dedupVec3 = (verts: Vec3[]): {unique: Vec3[]; map: Map<string, number>} => {
    const unique: Vec3[] = []
    const map = new Map<string, number>()
    for (const v of verts) {
        const key = vec3Key(v)
        if (!map.has(key)) {
            map.set(key, unique.length)
            unique.push(v)
        }
    }
    return {unique, map}
}

const computeVoronoiCell = (
    seedIdx: number,
    seeds: Vec3[],
    boxSize: Vec3,
): {vertices: Vec3[]; facePlaneIndices: number[][]; constraints: ConstraintPlane[]} | null => {
    const hw = boxSize.x / 2, hh = boxSize.y / 2, hd = boxSize.z / 2
    const seed = seeds[seedIdx]

    const constraints: ConstraintPlane[] = [
        {normal: new Vec3(1, 0, 0), d: hw, isBoxFace: true},
        {normal: new Vec3(-1, 0, 0), d: hw, isBoxFace: true},
        {normal: new Vec3(0, 1, 0), d: hh, isBoxFace: true},
        {normal: new Vec3(0, -1, 0), d: hh, isBoxFace: true},
        {normal: new Vec3(0, 0, 1), d: hd, isBoxFace: true},
        {normal: new Vec3(0, 0, -1), d: hd, isBoxFace: true},
    ]

    for (let i = 0; i < seeds.length; i++) {
        if (i === seedIdx) continue
        const dir = new Vec3(
            seeds[i].x - seed.x,
            seeds[i].y - seed.y,
            seeds[i].z - seed.z,
        )
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
        if (len < EPS) continue
        dir.x /= len; dir.y /= len; dir.z /= len
        const mid = new Vec3(
            (seed.x + seeds[i].x) / 2,
            (seed.y + seeds[i].y) / 2,
            (seed.z + seeds[i].z) / 2,
        )
        const d = dir.x * mid.x + dir.y * mid.y + dir.z * mid.z
        constraints.push({normal: dir, d, isBoxFace: false})
    }

    const numConstraints = constraints.length
    const rawVerts: Vec3[] = []
    const vertConstraints: number[][] = []

    for (let i = 0; i < numConstraints - 2; i++) {
        for (let j = i + 1; j < numConstraints - 1; j++) {
            for (let k = j + 1; k < numConstraints; k++) {
                const p = solvePlanes(constraints[i], constraints[j], constraints[k])
                if (!p) continue

                let valid = true
                for (let ci = 0; ci < numConstraints; ci++) {
                    if (!pointInsideConstraint(p, constraints[ci])) {
                        valid = false
                        break
                    }
                }
                if (!valid) continue

                rawVerts.push(p)
                vertConstraints.push([i, j, k])
            }
        }
    }

    if (rawVerts.length < 4) return null

    const {unique: vertices, map: vertMap} = dedupVec3(rawVerts)

    const faceVertSets: number[][] = Array.from({length: numConstraints}, () => [])
    for (let vi = 0; vi < rawVerts.length; vi++) {
        const uniqueIdx = vertMap.get(vec3Key(rawVerts[vi]))!
        for (const ci of vertConstraints[vi]) {
            if (!faceVertSets[ci].includes(uniqueIdx)) {
                faceVertSets[ci].push(uniqueIdx)
            }
        }
    }

    const facePlaneIndices: number[][] = []
    for (let ci = 0; ci < numConstraints; ci++) {
        if (faceVertSets[ci].length >= 3) {
            const normal = constraints[ci].normal
            const verts = faceVertSets[ci].map(idx => vertices[idx])
            const center = new Vec3(0, 0, 0)
            for (const v of verts) { center.x += v.x; center.y += v.y; center.z += v.z }
            const invN = 1 / verts.length
            center.x *= invN; center.y *= invN; center.z *= invN

            let ref = new Vec3(1, 0, 0)
            const ndot = normal.x * ref.x + normal.y * ref.y + normal.z * ref.z
            if (Math.abs(ndot) > 0.9) ref = new Vec3(0, 1, 0)
            const u = new Vec3(0, 0, 0)
            u.x = ref.y * normal.z - ref.z * normal.y
            u.y = ref.z * normal.x - ref.x * normal.z
            u.z = ref.x * normal.y - ref.y * normal.x
            const uLen = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z)
            if (uLen < EPS) continue
            u.x /= uLen; u.y /= uLen; u.z /= uLen

            const vDir = new Vec3(
                normal.y * u.z - normal.z * u.y,
                normal.z * u.x - normal.x * u.z,
                normal.x * u.y - normal.y * u.x,
            )

            const sorted = verts.map((v, idx) => {
                const dx = v.x - center.x, dy = v.y - center.y, dz = v.z - center.z
                const angle = Math.atan2(
                    dx * vDir.x + dy * vDir.y + dz * vDir.z,
                    dx * u.x + dy * u.y + dz * u.z,
                )
                return {idx: faceVertSets[ci][idx], angle}
            })
            sorted.sort((a, b) => a.angle - b.angle)
            facePlaneIndices.push(sorted.map(s => s.idx))
        }
    }

    if (facePlaneIndices.length < 4) return null

    return {vertices, facePlaneIndices, constraints}
}

const computeCentroid = (verts: Vec3[]): [number, number, number] => {
    const c = new Vec3(0, 0, 0)
    for (const v of verts) { c.x += v.x; c.y += v.y; c.z += v.z }
    const n = verts.length
    return [c.x / n, c.y / n, c.z / n]
}

const seededRandom = (seed: number): () => number => {
    let s = seed
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff
        return (s >>> 0) / 0xffffffff
    }
}

const triangleFanIndices = (faceVerts: number[]): number[] => {
    const tris: number[] = []
    if (faceVerts.length < 3) return tris
    for (let i = 1; i < faceVerts.length - 1; i++) {
        tris.push(faceVerts[0], faceVerts[i], faceVerts[i + 1])
    }
    return tris
}

const computeVolume = (verts: Vec3[], faces: number[][]): number => {
    let vol = 0
    for (const face of faces) {
        if (face.length < 3) continue
        const v0 = verts[face[0]]
        for (let i = 1; i < face.length - 1; i++) {
            const v1 = verts[face[i]]
            const v2 = verts[face[i + 1]]
            const cx = v1.y * v2.z - v1.z * v2.y
            const cy = v1.z * v2.x - v1.x * v2.z
            const cz = v1.x * v2.y - v1.y * v2.x
            vol += (v0.x * cx + v0.y * cy + v0.z * cz) / 6
        }
    }
    return Math.abs(vol)
}

const buildFragmentsFromSeeds = (seeds: Vec3[], boxSize: Vec3): FragmentData[] => {
    const fragments: FragmentData[] = []

    for (let si = 0; si < seeds.length; si++) {
        const cell = computeVoronoiCell(si, seeds, boxSize)
        if (!cell) continue

        const {vertices, facePlaneIndices} = cell

        const centroid = computeCentroid(vertices)
        const offX = centroid[0], offY = centroid[1], offZ = centroid[2]

        const renderVerts = new Float32Array(vertices.length * 3)
        const hullVerts: Vec3[] = []
        for (let i = 0; i < vertices.length; i++) {
            const v = vertices[i]
            const sx = v.x - offX, sy = v.y - offY, sz = v.z - offZ
            renderVerts[i * 3] = sx
            renderVerts[i * 3 + 1] = sy
            renderVerts[i * 3 + 2] = sz
            hullVerts.push(new Vec3(sx, sy, sz))
        }

        const allTris: number[] = []
        for (const face of facePlaneIndices) {
            const triFan = triangleFanIndices(face)
            allTris.push(...triFan)
        }

        if (allTris.length < 3) continue

        const hullFaces: number[][] = facePlaneIndices.map(face => [...face])
        const vol = computeVolume(hullVerts, hullFaces)

        fragments.push({
            renderVertices: renderVerts,
            renderIndices: allTris,
            hullVertices: hullVerts,
            hullFaces,
            centroid,
            massRatio: vol,
        })
    }

    const totalVol = fragments.reduce((s, f) => s + f.massRatio, 0)
    if (totalVol > EPS) {
        for (const f of fragments) { f.massRatio /= totalVol }
    } else {
        const eq = 1 / Math.max(fragments.length, 1)
        for (const f of fragments) { f.massRatio = eq }
    }

    return fragments
}

export const computeFractureFromPoints = (
    boxSize: [number, number, number],
    seedPoints: Vec3[],
    minCount: number,
): FragmentData[] => {
    const bv = new Vec3(boxSize[0], boxSize[1], boxSize[2])
    const seeds: Vec3[] = []

    seeds.push(new Vec3(0, 0, 0))

    for (const sp of seedPoints) {
        const isDup = seeds.some(s => {
            const dx = s.x - sp.x, dy = s.y - sp.y, dz = s.z - sp.z
            return dx * dx + dy * dy + dz * dz < EPS
        })
        if (!isDup) seeds.push(new Vec3(sp.x, sp.y, sp.z))
    }

    if (seeds.length < minCount) {
        const rng = seededRandom(Date.now())
        const pool = [...seeds]
        while (seeds.length < minCount) {
            const src = pool[Math.floor(rng() * pool.length)]
            seeds.push(new Vec3(
                Math.max(-bv.x / 2, Math.min(bv.x / 2, src.x + (rng() - 0.5) * bv.x * 0.3)),
                Math.max(-bv.y / 2, Math.min(bv.y / 2, src.y + (rng() - 0.5) * bv.y * 0.3)),
                Math.max(-bv.z / 2, Math.min(bv.z / 2, src.z + (rng() - 0.5) * bv.z * 0.3)),
            ))
        }
    }

    return buildFragmentsFromSeeds(seeds, bv)
}
