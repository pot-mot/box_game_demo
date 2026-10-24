import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dir = path.join(root, 'src/entity/character/body_form/humanoid/skeleton_animation/attack_clips')

const DATA_FILES = readdirSync(dir)
    .filter(name => name.endsWith('.ts') && name !== 'index.ts' && name !== 'types.ts')
    .sort()

const num = value => JSON.stringify(value)
const tuple = value => `[${value.map(num).join(', ')}]`
const times = value => `[${value.map(num).join(', ')}]`
const jointArray = value => `[${value.map(tuple).join(', ')}]`

const formatClip = (clip, indent) => {
    const pad = ' '.repeat(indent)
    const lines = [`${pad}{`]
    const entries = Object.entries(clip)
    entries.forEach(([key, value], index) => {
        const closingComma = index < entries.length - 1 ? ',' : ''
        if (key === 'times') {
            lines.push(`${pad}    "times": ${times(value)}${closingComma}`)
            return
        }
        if (key === 'joints' || key === 'positions') {
            lines.push(`${pad}    "${key}": {`)
            const items = Object.entries(value)
            items.forEach(([jointId, array], itemIndex) => {
                const itemComma = itemIndex < items.length - 1 ? ',' : ''
                lines.push(`${pad}        ${JSON.stringify(jointId)}: ${jointArray(array)}${itemComma}`)
            })
            lines.push(`${pad}    }${closingComma}`)
            return
        }
        if (key === 'events') {
            lines.push(`${pad}    "events": [`)
            value.forEach((event, eventIndex) => {
                const eventEntries = Object.entries(event)
                lines.push(`${pad}        {`)
                eventEntries.forEach(([eventKey, eventValue], eventEntryIndex) => {
                    const eventComma = eventEntryIndex < eventEntries.length - 1 ? ',' : ''
                    lines.push(`${pad}            ${JSON.stringify(eventKey)}: ${JSON.stringify(eventValue)}${eventComma}`)
                })
                const eventComma = eventIndex < value.length - 1 ? ',' : ''
                lines.push(`${pad}        }${eventComma}`)
            })
            lines.push(`${pad}    ]${closingComma}`)
            return
        }
        lines.push(`${pad}    ${JSON.stringify(key)}: ${JSON.stringify(value)}${closingComma}`)
    })
    lines.push(`${pad}}`)
    return lines
}

const formatFile = (file) => {
    const fullPath = path.join(dir, file)
    const source = readFileSync(fullPath, 'utf8')
    const match = source.match(/export const (\w+) = (\{[\s\S]*\})\s+satisfies Readonly<Record<string, AuthoredAttackClip>>\s*$/)
    if (match === null) throw new Error(`无法解析攻击作者数据：${file}`)
    const [, name, raw] = match
    const data = JSON.parse(raw)
    const lines = [
        "import type {AuthoredAttackClip} from './types.ts'",
        '',
        `export const ${name} = {`,
    ]
    const clipEntries = Object.entries(data)
    clipEntries.forEach(([clipId, clip], index) => {
        lines.push(`    ${JSON.stringify(clipId)}: ${formatClip(clip, 4).join('\n').trimStart()}`)
        if (index < clipEntries.length - 1) lines[lines.length - 1] += ','
    })
    lines.push('} satisfies Readonly<Record<string, AuthoredAttackClip>>', '')
    const output = lines.join('\n')

    const before = JSON.stringify(data)
    const objectStart = output.indexOf('= {') + 2
    const objectEnd = output.lastIndexOf('} satisfies')
    const after = JSON.parse(output.slice(objectStart, objectEnd + 1))
    if (JSON.stringify(after) !== before) throw new Error(`格式化改变数据：${file}`)
    writeFileSync(fullPath, output, 'utf8')
}

for (const file of DATA_FILES) formatFile(file)
console.log(`formatted ${DATA_FILES.length} attack clip files`)
