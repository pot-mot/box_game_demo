import type {HeightGenerator} from '../types'

const stepsGenerator: HeightGenerator = {
    id: 'steps',
    label: '阶梯',
    generate: (gridSize: number, _cellSize: number, maxHeight: number): number[][] => {
        const steps = 5
        const heights: number[][] = []
        for (let x = 0; x < gridSize; x++) {
            const row: number[] = []
            for (let z = 0; z < gridSize; z++) {
                const raw = ((x + z) / (gridSize * 2)) * maxHeight
                const stepped = Math.round(raw / (maxHeight / steps)) * (maxHeight / steps)
                row.push(Math.round(Math.min(maxHeight, stepped) * 100) / 100)
            }
            heights.push(row)
        }
        return heights
    },
}

export default stepsGenerator
