import type {HeightGenerator} from '../types'
import fbmNoiseGenerator from './fbm_noise.ts'
import flatGenerator from './flat.ts'
import sineGenerator from './sine.ts'
import stepsGenerator from './steps.ts'

const GENERATORS: HeightGenerator[] = [
    fbmNoiseGenerator,
    flatGenerator,
    sineGenerator,
    stepsGenerator,
]

const getGenerator = (id: string): HeightGenerator =>
    GENERATORS.find(g => g.id === id) ?? flatGenerator

const GENERATOR_IDS: string[] = GENERATORS.map(g => g.id)

export {GENERATORS, getGenerator, GENERATOR_IDS}
