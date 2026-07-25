import type {HeightGenerator} from '../types'

const flatGenerator: HeightGenerator = {
    id: 'flat',
    label: '平坦',
    generate: (gridSize: number, _cellSize: number, minHeight: number, _maxHeight: number): number[][] => {
        const heights: number[][] = []
        for (let x = 0; x < gridSize; x++) {
            heights.push(new Array(gridSize).fill(minHeight))
        }
        return heights
    },
}

export default flatGenerator
