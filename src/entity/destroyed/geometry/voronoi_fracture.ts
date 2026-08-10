import {v3Length, type RapVector3} from '../../../physics/rapier_utils.ts'

const EPS = 1e-6
const PLANE_EPS = 1e-5

interface ConstraintPlane {
    normal: RapVector3
    d: number
    isBoxFace: boolean
}

const cross = (a: RapVector3, b: RapVector3): RapVector3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
})

const dot = (a: RapVector3, b: RapVector3): number =>
    a.x * b.x + a.y * b.y + a.z * b.z

const solvePlanes = (p1: ConstraintPlane, p2: ConstraintPlane, p3: ConstraintPlane): RapVector3 | null => {
    const n1 = p1.normal, d1 = p1.d
    const n2 = p2.normal, d2 = p2.d
    const n3 = p3.normal, d3 = p3.d

    const n2xn3 = cross(n2, n3)
    const det = dot(n1, n2xn3)

    if (Math.abs(det) < EPS) return null

    const invDet = 1 / det
    const n3xn1 = cross(n3, n1)
    const n1xn2 = cross(n1, n2)

    return {
        x: (d1 * n2xn3.x + d2 * n3xn1.x + d3 * n1xn2.x) * invDet,
        y: (d1 * n2xn3.y + d2 * n3xn1.y + d3 * n1xn2.y) * invDet,
        z: (d1 * n2xn3.z + d2 * n3xn1.z + d3 * n1xn2.z) * invDet,
    }
}

const pointInsideConstraint = (p: RapVector3, plane: ConstraintPlane): boolean =>
    dot(p, plane.normal) <= plane.d + PLANE_EPS

const vec3Key = (v: RapVector3): string =>
    `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`

const dedupVec3 = (verts: RapVector3[]): {unique: RapVector3[]; map: Map<string, number>} => {
    const unique: RapVector3[] = []
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
    seeds: RapVector3[],
    boxSize: RapVector3,
): {vertices: RapVector3[]; facePlaneIndices: number[][]; constraints: ConstraintPlane[]} | null => {
    const hw = boxSize.x / 2, hh = boxSize.y / 2, hd = boxSize.z / 2
    const seed = seeds[seedIdx]

    const constraints: ConstraintPlane[] = [
        {normal: {x: 1, y: 0, z: 0}, d: hw, isBoxFace: true},
        {normal: {x: -1, y: 0, z: 0}, d: hw, isBoxFace: true},
        {normal: {x: 0, y: 1, z: 0}, d: hh, isBoxFace: true},
        {normal: {x: 0, y: -1, z: 0}, d: hh, isBoxFace: true},
        {normal: {x: 0, y: 0, z: 1}, d: hd, isBoxFace: true},
        {normal: {x: 0, y: 0, z: -1}, d: hd, isBoxFace: true},
    ]

    for (let i = 0; i < seeds.length; i++) {
        if (i === seedIdx) continue
        const dx = seeds[i].x - seed.x
        const dy = seeds[i].y - seed.y
        const dz = seeds[i].z - seed.z
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (len < EPS) continue
        const dir: RapVector3 = {x: dx / len, y: dy / len, z: dz / len}
        const mx = (seed.x + seeds[i].x) / 2
        const my = (seed.y + seeds[i].y) / 2
        const mz = (seed.z + seeds[i].z) / 2
        const d = dot(dir, {x: mx, y: my, z: mz})
        constraints.push({normal: dir, d, isBoxFace: false})
    }

    const numConstraints = constraints.length
    const rawVerts: RapVector3[] = []
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
            const cverts = faceVertSets[ci].map(idx => vertices[idx])
            let cx = 0, cy = 0, cz = 0
            for (const v of cverts) { cx += v.x; cy += v.y; cz += v.z }
            const invN = 1 / cverts.length
            cx *= invN; cy *= invN; cz *= invN

            let ref: RapVector3 = {x: 1, y: 0, z: 0}
            const ndot = dot(normal, ref)
            if (Math.abs(ndot) > 0.9) ref = {x: 0, y: 1, z: 0}
            const u = cross(ref, normal)
            const uLen = v3Length(u)
            if (uLen < EPS) continue
            u.x /= uLen; u.y /= uLen; u.z /= uLen

            const vDir = cross(normal, u)

            const sorted = cverts.map((v, idx) => {
                const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz
                const angle = Math.atan2(
                    dot({x: dx, y: dy, z: dz}, vDir),
                    dot({x: dx, y: dy, z: dz}, u),
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

const computeCentroid = (verts: RapVector3[]): [number, number, number] => {
    let cx = 0, cy = 0, cz = 0
    for (const v of verts) { cx += v.x; cy += v.y; cz += v.z }
    const n = verts.length
    return [cx / n, cy / n, cz / n]
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

const computeVolume = (verts: RapVector3[], faces: number[][]): number => {
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

const buildFragmentsFromSeeds = (seeds: RapVector3[], boxSize: RapVector3): import('../types').FragmentData[] => {
    const fragments: import('../types').FragmentData[] = []

    for (let si = 0; si < seeds.length; si++) {
        const cell = computeVoronoiCell(si, seeds, boxSize)
        if (!cell) continue

        const {vertices, facePlaneIndices} = cell

        const centroid = computeCentroid(vertices)
        const offX = centroid[0], offY = centroid[1], offZ = centroid[2]

        const renderVerts = new Float32Array(vertices.length * 3)
        const hullVerts: {x: number; y: number; z: number}[] = []
        for (let i = 0; i < vertices.length; i++) {
            const v = vertices[i]
            const sx = v.x - offX, sy = v.y - offY, sz = v.z - offZ
            renderVerts[i * 3] = sx
            renderVerts[i * 3 + 1] = sy
            renderVerts[i * 3 + 2] = sz
            hullVerts.push({x: sx, y: sy, z: sz})
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
            boxSize: [boxSize.x, boxSize.y, boxSize.z],
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
    seedPoints: RapVector3[],
    minCount: number,
): import('../types').FragmentData[] => {
    const bv: RapVector3 = {x: boxSize[0], y: boxSize[1], z: boxSize[2]}
    const seeds: RapVector3[] = []

    seeds.push({x: 0, y: 0, z: 0})

    for (const sp of seedPoints) {
        const isDup = seeds.some(s => {
            const dx = s.x - sp.x, dy = s.y - sp.y, dz = s.z - sp.z
            return dx * dx + dy * dy + dz * dz < EPS
        })
        if (!isDup) seeds.push({x: sp.x, y: sp.y, z: sp.z})
    }

    if (seeds.length < minCount) {
        const rng = seededRandom(Date.now())
        const pool = [...seeds]
        while (seeds.length < minCount) {
            const src = pool[Math.floor(rng() * pool.length)]
            seeds.push({
                x: Math.max(-bv.x / 2, Math.min(bv.x / 2, src.x + (rng() - 0.5) * bv.x * 0.3)),
                y: Math.max(-bv.y / 2, Math.min(bv.y / 2, src.y + (rng() - 0.5) * bv.y * 0.3)),
                z: Math.max(-bv.z / 2, Math.min(bv.z / 2, src.z + (rng() - 0.5) * bv.z * 0.3)),
            })
        }
    }

    return buildFragmentsFromSeeds(seeds, bv)
}
