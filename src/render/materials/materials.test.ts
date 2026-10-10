import {describe, expect, it} from 'vitest'
import {MATERIAL_INDEX_TO_ID, SURFACE_MATERIAL_IDS, SURFACE_MATERIAL_INDEX} from './ids.ts'

describe('surface material ids', () => {
    it('索引从 1 起且与顺序一致', () => {
        SURFACE_MATERIAL_IDS.forEach((id, i) => {
            expect(SURFACE_MATERIAL_INDEX[id]).toBe(i + 1)
            expect(MATERIAL_INDEX_TO_ID[i + 1]).toBe(id)
        })
    })

    it('索引 0 表示空', () => {
        expect(MATERIAL_INDEX_TO_ID[0]).toBeUndefined()
    })
})
