import {test, expect, type Page} from '@playwright/test'

/** 进入指定模式并打开「操作设置」面板 */
const openOperationsPanel = async (page: Page, modeButton: string): Promise<void> => {
    await page.goto('/')
    await page.waitForSelector('#startup-overlay', {timeout: 5000})
    await page.locator('button', {hasText: modeButton}).click()
    await page.waitForTimeout(500)
    await page.click('#settings-btn')
    await page.locator('#settings-menu div', {hasText: '操作设置'}).click()
    await expect(page.locator('.bp-panel')).toBeVisible()
}

test.describe('操作设置面板', () => {
    test('编辑模式：鼠标分组列出可改的旋转视角 / 生成物体与不可改项', async ({page}) => {
        await openOperationsPanel(page, '编辑模式')

        /* 鼠标分组列出可改的旋转视角 / 生成物体与不可改项 */
        await expect(page.locator('.bp-row', {hasText: '旋转视角'}).locator('.bp-row-key')).toHaveText('鼠标左键')
        await expect(page.locator('.bp-row', {hasText: '生成物体'}).locator('.bp-row-key').first()).toHaveText('Ctrl + 鼠标左键')

        /* 两项均可修改：各有替换按钮（生成物体默认左右 Ctrl 两个组合） */
        await expect(page.locator('.bp-row', {hasText: '旋转视角'}).locator('.bp-row-btn-edit')).toBeVisible()
        await expect(page.locator('.bp-row', {hasText: '生成物体'}).locator('.bp-row-btn-edit').first()).toBeVisible()

        /* 编辑模式下不可修改的鼠标操作单独成行 */
        await expect(page.locator('.bp-row', {hasText: '不可修改'})).toHaveCount(2)
        await expect(page.locator('.bp-row', {hasText: '雕刻地形'})).toContainText('不可修改')
    })

    test('游玩模式：鼠标分组列出旋转视角 / 轻击 / 重击 / 锁定目标，固定项仅滚轮', async ({page}) => {
        await openOperationsPanel(page, '游玩模式')

        await expect(page.locator('.bp-row', {hasText: '旋转视角'})).toHaveCount(1)
        await expect(page.locator('.bp-row', {hasText: '轻击'}).locator('.bp-row-key')).toHaveText('鼠标左键')
        await expect(page.locator('.bp-row', {hasText: '重击'}).locator('.bp-row-key')).toHaveText('鼠标右键')
        await expect(page.locator('.bp-row', {hasText: '锁定目标'}).locator('.bp-row-key')).toHaveText('鼠标中键')
        await expect(page.locator('.bp-row', {hasText: '锁定目标'}).locator('.bp-row-btn-edit')).toBeVisible()
        /* 生成物体 / 平移视角不参与游玩模式，不在面板中列出 */
        await expect(page.locator('.bp-row', {hasText: '生成物体'})).toHaveCount(0)
        await expect(page.locator('.bp-row', {hasText: '平移视角'})).toHaveCount(0)

        /* 攻击已可改，固定项只剩滚轮缩放 */
        await expect(page.locator('.bp-row', {hasText: '不可修改'})).toHaveCount(1)
        await expect(page.locator('.bp-row', {hasText: '视角缩放'})).toContainText('不可修改')
    })

    test('把「生成物体」改绑到鼠标中键（与锁定目标冲突时确认覆盖）', async ({page}) => {
        await openOperationsPanel(page, '编辑模式')

        const spawnRow = page.locator('.bp-row', {hasText: '生成物体'})
        await spawnRow.locator('.bp-row-btn-edit').first().click()
        await expect(page.locator('.bp-row-key-capturing')).toBeVisible()

        await page.mouse.move(600, 400)
        await page.mouse.down({button: 'middle'})
        await page.mouse.up({button: 'middle'})

        /* 中键默认绑定游玩模式的「锁定目标」，需确认覆盖 */
        await expect(page.locator('.bp-conflict-box')).toContainText('锁定目标')
        await page.locator('.bp-btn-confirm').click()

        await expect(spawnRow.locator('.bp-row-key').first()).toHaveText('鼠标中键')
        /* 捕获后的 click 被吞掉：面板保持打开 */
        await expect(page.locator('.bp-panel')).toBeVisible()
    })

    test('重绑到已被占用的按键会弹出冲突确认（覆盖后旧绑定被移除）', async ({page}) => {
        await openOperationsPanel(page, '编辑模式')

        const orbitRow = page.locator('.bp-row', {hasText: '旋转视角'})
        const spawnRow = page.locator('.bp-row', {hasText: '生成物体'})

        await spawnRow.locator('.bp-row-btn-edit').first().click()
        await page.mouse.move(600, 400)
        await page.mouse.down({button: 'left'})
        await page.mouse.up({button: 'left'})

        await expect(page.locator('.bp-conflict-box')).toContainText('旋转视角')
        await page.locator('.bp-btn-confirm').click()

        await expect(spawnRow.locator('.bp-row-key').first()).toHaveText('鼠标左键')
        /* 冲突方绑定被移出后行内出现「添加替代绑定」 */
        await expect(orbitRow.locator('.bp-row-btn-add')).toBeVisible()
    })

    test('重绑到被展示模式动作占用的右键会一并覆盖', async ({page}) => {
        await openOperationsPanel(page, '编辑模式')

        const orbitRow = page.locator('.bp-row', {hasText: '旋转视角'})
        const spawnRow = page.locator('.bp-row', {hasText: '生成物体'})

        await orbitRow.locator('.bp-row-btn-edit').click()
        await page.mouse.move(600, 400)
        await page.mouse.down({button: 'right'})
        await page.mouse.up({button: 'right'})

        /* 右键被展示模式的「平移视角」占用（编辑模式「生成物体」已改为 Ctrl+左键，不再占用右键） */
        const conflictBox = page.locator('.bp-conflict-box')
        await expect(conflictBox).toContainText('平移视角')
        await expect(conflictBox).not.toContainText('生成物体')
        await page.locator('.bp-btn-confirm').click()

        await expect(orbitRow.locator('.bp-row-key')).toHaveText('鼠标右键')
        /* 生成物体的两个默认组合（Ctrl+左键）不受影响 */
        await expect(spawnRow.locator('.bp-row-key')).toHaveCount(2)
    })
})

test.describe('生成物体绑定生效', () => {
    /** 编辑模式左侧实体列表的行数（生成成功的可观测信号） */
    const elementRows = (page: Page) => page.locator('#element-list-panel [data-id]')

    const ctrlClickCanvas = async (page: Page): Promise<void> => {
        await page.mouse.move(600, 400)
        await page.keyboard.down('Control')
        await page.mouse.down({button: 'left'})
        await page.mouse.up({button: 'left'})
        await page.keyboard.up('Control')
    }

    test('默认：Ctrl+左键在指针处生成实体', async ({page}) => {
        await openOperationsPanel(page, '编辑模式')
        await page.locator('.bp-close-btn').click()

        const rows = elementRows(page)
        const before = await rows.count()
        await ctrlClickCanvas(page)

        await expect.poll(async () => rows.count()).toBeGreaterThan(before)
    })

    test('改绑到中键后：中键生成，Ctrl+左键不再生成', async ({page}) => {
        await openOperationsPanel(page, '编辑模式')

        const spawnRow = page.locator('.bp-row', {hasText: '生成物体'})
        await spawnRow.locator('.bp-row-btn-edit').first().click()
        await page.mouse.move(600, 400)
        await page.mouse.down({button: 'middle'})
        await page.mouse.up({button: 'middle'})
        /* 中键与「锁定目标」冲突：确认覆盖后才能完成改绑 */
        await page.locator('.bp-btn-confirm').click()
        await expect(spawnRow.locator('.bp-row-key').first()).toHaveText('鼠标中键')
        await page.locator('.bp-close-btn').click()

        const rows = elementRows(page)
        const before = await rows.count()

        /* 原 Ctrl+左键绑定已失效 */
        await ctrlClickCanvas(page)
        await page.waitForTimeout(300)
        expect(await rows.count()).toBe(before)

        /* 新中键绑定生效 */
        await page.mouse.move(650, 420)
        await page.mouse.down({button: 'middle'})
        await page.mouse.up({button: 'middle'})
        await expect.poll(async () => rows.count()).toBeGreaterThan(before)
    })
})
