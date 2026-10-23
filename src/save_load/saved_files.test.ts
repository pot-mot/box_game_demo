import {describe, it, expect} from 'vitest'
import {parseSaveData} from './validation.ts'
import {SAVE_FORMAT_VERSION} from './types.ts'

/** 以 Vite 原始文本方式载入 saved/ 下全部存档（测试环境无 Node 类型，不直接使用 fs） */
const SAVED_FILES = import.meta.glob('../../saved/*.json', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Readonly<Record<string, string>>

const entries = Object.entries(SAVED_FILES)

describe('saved/ 存档文件（v18 重写后）', () => {
    it('至少存在一个存档文件', () => {
        expect(entries.length).toBeGreaterThan(0)
    })

    it.each(entries)('%s 可完整解析为 v18（无跳过实体）', (_path, raw) => {
        const parsed = parseSaveData(JSON.parse(raw) as unknown)
        expect(parsed.skipped).toEqual([])
        expect(parsed.data.version).toBe(SAVE_FORMAT_VERSION)
        expect(parsed.data.version).toBe(18)
    })

    it.each(entries)('%s 的角色装备分层且不含旧字段', (path, raw) => {
        const data = JSON.parse(raw) as {entities: Array<{type: string; config?: Record<string, unknown>}>}
        for (const entity of data.entities) {
            if (entity.type !== 'character' || entity.config === undefined) continue
            expect(entity.config.bodyFormId, path).toBeTypeOf('string')
            expect(entity.config.equipment, path).toBeTypeOf('object')
            for (const legacy of ['attack', 'offhand', 'holdMode', 'handedness', 'armor', 'limb', 'breathModuleId']) {
                expect(entity.config, `${path} 仍含旧字段 ${legacy}`).not.toHaveProperty(legacy)
            }
        }
    })
})
