export interface FragmentData {
    renderVertices: Float32Array
    renderIndices: number[]
    hullVertices: { x: number; y: number; z: number }[]
    hullFaces: number[][]
    centroid: [number, number, number]
    massRatio: number
    boxSize: [number, number, number]
}
