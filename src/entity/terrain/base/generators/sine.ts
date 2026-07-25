import type {HeightGenerator} from '../types'

const sineGenerator: HeightGenerator = {
    id: 'sine',
    label: '正弦波',
    generate: (gridSize: number, cellSize: number, minHeight: number, maxHeight: number): number[][] => {
        const worldSize = (gridSize - 1) * cellSize
        const half = worldSize / 2
        const heights: number[][] = []
        for (let x = 0; x < gridSize; x++) {
            const row: number[] = []
            const px = x * cellSize - half
            for (let z = 0; z < gridSize; z++) {
                const pz = z * cellSize - half
                const n = (Math.sin(px * 0.5) * Math.cos(pz * 0.4) + 1) / 2
                row.push(Math.round((minHeight + n * (maxHeight - minHeight)) * 100) / 100)
            }
            heights.push(row)
        }
        return heights
    },
}

export default sineGenerator
