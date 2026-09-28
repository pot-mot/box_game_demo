/**
 * chunk 体素数据的 RLE 压缩。
 *
 * 编码格式：每个游程 3 字节 [值, 计数低 8 位, 计数高 8 位]，整体 Base64。
 * 计数上限 0xFFFF（chunk 体素数 16³ = 4096 < 65536，足够）。
 */

const BINARY_CHUNK = 0x2000

const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = ''
    for (let i = 0; i < bytes.length; i += BINARY_CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + BINARY_CHUNK))
    }
    return btoa(binary)
}

const base64ToBytes = (encoded: string): Uint8Array => {
    const binary = atob(encoded)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
}

/** 编码体素数组为 Base64 RLE 字符串 */
export const encodeRle = (data: Uint8Array): string => {
    const bytes: number[] = []
    let i = 0
    while (i < data.length) {
        const value = data[i]
        let run = 1
        while (i + run < data.length && data[i + run] === value && run < 0xffff) run++
        bytes.push(value, run & 0xff, (run >> 8) & 0xff)
        i += run
    }
    return bytesToBase64(Uint8Array.from(bytes))
}

/**
 * 解码 Base64 RLE 字符串为定长体素数组。
 * 长度不匹配 / 格式错误返回 undefined（由调用方安全跳过该 chunk，不抛错）。
 */
export const decodeRle = (encoded: string, expectedLength: number): Uint8Array | undefined => {
    if (encoded === '') return new Uint8Array(0)
    let bytes: Uint8Array
    try {
        bytes = base64ToBytes(encoded)
    } catch {
        return undefined
    }
    if (bytes.length % 3 !== 0) return undefined
    const out = new Uint8Array(expectedLength)
    let pos = 0
    for (let i = 0; i < bytes.length; i += 3) {
        const value = bytes[i]
        const count = bytes[i + 1] | (bytes[i + 2] << 8)
        if (count <= 0 || pos + count > expectedLength) return undefined
        out.fill(value, pos, pos + count)
        pos += count
    }
    if (pos !== expectedLength) return undefined
    return out
}
