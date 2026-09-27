import {test, expect, type Page} from '@playwright/test'

/**
 * 角色装备与属性面板：进入编辑模式 → 把生成类型切到「角色」→ 右键生成并选中角色 →
 * 在角色面板选择护甲 / 基础防御 → Apply → 列表行防御数值更新。
 * 生成类型顺序见 `src/modes/edit/spawn_mode.ts`（角色 = 第 7 项，ArrowDown = 循环下一项）。
 */
const CHARACTER_SPAWN_CYCLES = 6

const openCharacterPanel = async (page: Page): Promise<void> => {
    await page.goto('/')
    await page.waitForSelector('#startup-overlay', {timeout: 5000})
    await page.locator('button', {hasText: '编辑模式'}).click()
    await page.waitForTimeout(500)
    for (let i = 0; i < CHARACTER_SPAWN_CYCLES; i++) {
        await page.keyboard.press('ArrowDown')
    }
    await page.mouse.move(600, 400)
    await page.mouse.down({button: 'right'})
    await page.mouse.up({button: 'right'})
    /* 生成后需在元素列表中点击角色行才会弹出角色面板（与编辑模式选中交互一致） */
    const row = page.locator('#element-list-panel [data-id][data-type="character"]')
    await expect(row).toHaveCount(1)
    await row.click()
    await expect(page.locator('#character-panel')).toBeVisible()
}

test.describe('角色装备与属性面板', () => {
    test('选择护甲与基础防御后 Apply：有效防御预览与列表行同步更新', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const headSelect = panel.locator('label', {hasText: '头盔'}).locator('select')
        const basePhys = panel.locator('label', {hasText: '基础物防'}).locator('input')
        const baseMagic = panel.locator('label', {hasText: '基础魔防'}).locator('input')

        /* 默认无护甲、零基础防御 */
        await expect(panel).toContainText('有效防御：物 0 / 魔 0')

        await headSelect.selectOption('iron_helmet')
        await basePhys.fill('2')
        await baseMagic.fill('1')
        /* 铁盔（物 2）+ 基础物防 2 → 有效物理 4；魔法 1 */
        await expect(panel).toContainText('有效防御：物 4 / 魔 1')

        await panel.locator('button', {hasText: 'Apply'}).click()
        await expect(page.locator('#element-list-panel [data-id]', {hasText: 'def:物4/魔1'})).toHaveCount(1)
    })

    test('换下护甲后有效防御回落，Apply 后列表行同步', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const chestSelect = panel.locator('label', {hasText: '胸甲'}).locator('select')

        await chestSelect.selectOption('iron_plate')
        await expect(panel).toContainText('有效防御：物 3 / 魔 0')
        await panel.locator('button', {hasText: 'Apply'}).click()
        await expect(page.locator('#element-list-panel [data-id]', {hasText: 'def:物3/魔0'})).toHaveCount(1)

        /* 选回「无」→ 预览与列表行回到零防御 */
        await chestSelect.selectOption('')
        await expect(panel).toContainText('有效防御：物 0 / 魔 0')
        await panel.locator('button', {hasText: 'Apply'}).click()
        await expect(page.locator('#element-list-panel [data-id]', {hasText: 'def:物0/魔0'})).toHaveCount(1)
    })

    test('锁定点：添加额外锁定点（关节 + 偏移）Apply 后面板回显', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        await expect(panel).toContainText('默认：身体中心（不可删除）')
        await panel.locator('button', {hasText: '添加锁定点'}).click()

        const row = panel.locator('.lock-point-row')
        await expect(row).toHaveCount(1)
        await row.locator('.lock-point-joint').selectOption('headNeck')
        /* 第二个偏移输入 = Y */
        await row.locator('.lock-point-offset').nth(1).fill('0.3')

        await panel.locator('button', {hasText: 'Apply'}).click()

        /* 重新聚焦面板（点击角色行）后回显已 Apply 的锁定点 */
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel .lock-point-row')).toHaveCount(1)
        await expect(page.locator('#character-panel .lock-point-joint')).toHaveValue('headNeck')
        await expect(page.locator('#character-panel .lock-point-offset').nth(1)).toHaveValue('0.3')
    })

    test('臂甲与加速鞋：攻击加成 / 有效移速预览与列表行同步', async ({page}) => {
        await openCharacterPanel(page)

        const panel = page.locator('#character-panel')
        const armsSelect = panel.locator('label', {hasText: '臂甲'}).locator('select')
        const legsSelect = panel.locator('label', {hasText: '护腿'}).locator('select')

        /* 战臂甲：物攻 +2、移速 ×0.97；基础移速 3 → 2.91 */
        await armsSelect.selectOption('battle_bracers')
        await expect(panel).toContainText('攻击加成：物 2 / 魔 0')
        await expect(panel).toContainText('有效移速：2.91')

        /* 再叠疾行靴 ×1.15 → 3 × 0.97 × 1.15 = 3.3465，列表行保留两位小数 */
        await legsSelect.selectOption('swift_boots')
        await expect(panel).toContainText('有效移速：3.3465')
        await panel.locator('button', {hasText: 'Apply'}).click()
        await expect(page.locator('#element-list-panel [data-id]', {hasText: 'spd:3.35'})).toHaveCount(1)
    })
})
