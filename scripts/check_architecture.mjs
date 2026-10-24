import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs'
import {dirname, join, normalize, relative} from 'node:path'

const root = process.cwd()
const debt = JSON.parse(readFileSync(join(root, 'scripts', 'architecture_debt.json'), 'utf8').replace(/^\uFEFF/, ''))
const allowed = new Set(debt.allowed)

const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full, out)
        else if (name.endsWith('.ts')) out.push(full)
    }
    return out
}

const sourceFiles = walk(join(root, 'src')).filter(file => !file.endsWith('.test.ts'))
const violations = new Set()
const toPosix = value => value.replaceAll('\\', '/')
const rel = file => toPosix(relative(root, file))

for (const file of sourceFiles) {
    const text = readFileSync(file, 'utf8')
    const fileRel = rel(file)
    for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = match[1]
        if (!spec.startsWith('.')) continue
        const target = toPosix(relative(root, normalize(join(dirname(file), spec))))
        if (fileRel.startsWith('src/character/') && target.startsWith('src/entity/')) {
            violations.add(`character->entity:${fileRel}`)
        }
        if (fileRel.startsWith('src/entity/character/body_form/common/') &&
            /src\/entity\/character\/body_form\/(humanoid|wolf|horse|wyvern)\//.test(target)) {
            violations.add(`common->form:${fileRel}`)
        }
        if (fileRel.startsWith('src/entity/skeleton/') &&
            /src\/(entity\/character|character)\//.test(target)) {
            violations.add(`skeleton->character:${fileRel}`)
        }
        if (fileRel.startsWith('src/entity/character/body_form/') &&
            /src\/skeleton\/anim\/player\.ts$/.test(target)) {
            violations.add(`clip-player-in-body-form:${fileRel}`)
        }
    }
}

if (readdirSync(join(root, 'src', 'entity', 'character')).includes('forms')) violations.add('legacy-forms-dir')
if (readdirSync(join(root, 'src', 'character', 'weapon')).includes('attack_clips')) violations.add('attack-clips-in-domain')

const inventoryTypes = readFileSync(join(root, 'src', 'inventory', 'types.ts'), 'utf8')
if (/export const EQUIP_SLOTS/.test(inventoryTypes)) violations.add('legacy-global-equip-slots')

const bodyFormTypes = readFileSync(join(root, 'src', 'entity', 'character', 'body_form', 'common', 'types.ts'), 'utf8')
if (/readonly weapon: boolean/.test(bodyFormTypes)) violations.add('legacy-weapon-boolean')

const animationCommon = join(root, 'src', 'entity', 'character', 'body_form', 'common', 'skeleton_animation')
if (existsSync(join(animationCommon, 'composition.ts')) || existsSync(join(animationCommon, 'factory.ts'))) {
    violations.add('legacy-time-composition')
}
const formAnimationText = readFileSync(join(animationCommon, 'form_animation.ts'), 'utf8')
if (/createFormAnimationSystem|createBoneAnimationPlayer|defineFormAnimation/.test(formAnimationText)) {
    violations.add('legacy-clip-runtime')
}

const unknown = [...violations].filter(v => !allowed.has(v))
console.log(`架构审计：${violations.size} 个已知/当前违规，${allowed.size} 个债务基线条目`)
for (const v of [...violations].sort()) console.log(`  ${allowed.has(v) ? 'DEBT' : 'FAIL'} ${v}`)
if (unknown.length > 0) {
    console.error(`新增违规 ${unknown.length} 个；请修复或显式记录到 scripts/architecture_debt.json`)
    process.exit(1)
}
