import {describe, expect, it} from 'vitest'
import {decodeRle, encodeRle} from './rle.ts'

describe('rle', () => {
    it('往返一致（含长游程与交替值）', () => {
        const data = new Uint8Array(4096)
        data.fill(3, 0, 1000)
        data[1000] = 5
        for (let i = 1001; i < 3000; i++) data[i] = i % 2 === 0 ? 1 : 2
        data.fill(7, 3000, 4096)
        const encoded = encodeRle(data)
        const decoded = decodeRle(encoded, data.length)
        expect(decoded).toBeDefined()
        expect(Array.from(decoded!)).toEqual(Array.from(data))
    })

    it('全空数组往返一致', () => {
        const data = new Uint8Array(4096)
        const decoded = decodeRle(encodeRle(data), 4096)
        expect(decoded).toBeDefined()
        expect(decoded!.every(v => v === 0)).toBe(true)
    })

    it('长度不匹配返回 undefined', () => {
        const data = new Uint8Array(4096)
        data.fill(1)
        expect(decodeRle(encodeRle(data), 1024)).toBeUndefined()
    })

    it('非法 Base64 返回 undefined', () => {
        expect(decodeRle('not valid base64 !!!', 4096)).toBeUndefined()
    })

    it('游程计数超过 255 正确还原', () => {
        const data = new Uint8Array(5000)
        data.fill(4, 0, 5000)
        const decoded = decodeRle(encodeRle(data), 5000)
        expect(decoded).toBeDefined()
        expect(decoded![4999]).toBe(4)
    })
})
