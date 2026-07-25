import type {HeightGenerator} from '../types'

const flatGenerator: HeightGenerator = {
    id: 'flat',
    label: '平坦',
    generate: (gridSize: number, _cellSize: number, _maxHeight: number): number[][] => {
        const heights: number[][] = []
        for (let x = 0; x < gridSize; x++) {
            heights.push(new Array(gridSize).fill(0))
        }
        return heights
    },
}

export default flatGenerator
