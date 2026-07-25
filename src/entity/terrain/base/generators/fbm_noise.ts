import type {HeightGenerator} from '../types'

const hash2D = (x: number, y: number): number => {
    let h = x * 374761393 + y * 668265263
    h = (h ^ (h >> 13)) * 1274126177
    return (h ^ (h >> 16)) / 2147483647
}

const smoothNoise = (x: number, y: number): number => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const v00 = hash2D(ix, iy)
    const v10 = hash2D(ix + 1, iy)
    const v01 = hash2D(ix, iy + 1)
    const v11 = hash2D(ix + 1, iy + 1)
    return v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v11 - v10 - v01 + v00) * sx * sy
}

const fbm = (x: number, y: number, octaves: number): number => {
    let value = 0
    let amplitude = 1
    let frequency = 1
    let maxVal = 0
    for (let i = 0; i < octaves; i++) {
        value += amplitude * smoothNoise(x * frequency, y * frequency)
        maxVal += amplitude
        amplitude *= 0.5
        frequency *= 2
    }
    return value / maxVal
}

const fbmNoiseGenerator: HeightGenerator = {
    id: 'fbm',
    label: 'FBM 噪声',
    generate: (gridSize: number, _cellSize: number, minHeight: number, maxHeight: number): number[][] => {
        const heights: number[][] = []
        for (let x = 0; x < gridSize; x++) {
            const row: number[] = []
            for (let z = 0; z < gridSize; z++) {
                const n = fbm(x * 0.08, z * 0.08, 4)
                row.push(Math.round((minHeight + n * (maxHeight - minHeight)) * 100) / 100)
            }
            heights.push(row)
        }
        return heights
    },
}

export default fbmNoiseGenerator
