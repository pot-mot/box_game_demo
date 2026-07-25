import type {HeightGenerator} from '../types'

const stepsGenerator: HeightGenerator = {
    id: 'steps',
    label: '阶梯',
    generate: (gridSize: number, _cellSize: number, minHeight: number, maxHeight: number): number[][] => {
        const range = maxHeight - minHeight
        const steps = 5
        const heights: number[][] = []
        for (let x = 0; x < gridSize; x++) {
            const row: number[] = []
            for (let z = 0; z < gridSize; z++) {
                const n = Math.min(1, ((x + z) / (gridSize * 2)))
                const stepped = Math.round(n * steps) / steps
                row.push(Math.round((minHeight + stepped * range) * 100) / 100)
            }
            heights.push(row)
        }
        return heights
    },
}

export default stepsGenerator
