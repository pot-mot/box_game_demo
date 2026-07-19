import type {Vec3} from 'cannon-es'

export interface FragmentData {
    renderVertices: Float32Array
    renderIndices: number[]
    hullVertices: Vec3[]
    hullFaces: number[][]
    centroid: [number, number, number]
    massRatio: number
}
