import {test, expect, type Page} from '@playwright/test'

/** 进入编辑模式并返回画布中心坐标 */
const enterEditMode = async (page: Page): Promise<{x: number; y: number}> => {
    await page.goto('/')
    await page.waitForSelector('#startup-overlay', {timeout: 5000})
    await page.locator('button', {hasText: '编辑模式'}).click()
    await page.waitForSelector('#spawn-mode-panel', {timeout: 5000})
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('canvas missing')
    return {x: box.x + box.width / 2, y: box.y + box.height / 2}
}

/** 通过生成类型下拉选择「区域」 */
const selectAreaSpawnMode = async (page: Page): Promise<void> => {
    await page.locator('#spawn-mode-panel .dc-dropdown__header').click()
    await page.locator('#spawn-mode-panel .dc-dropdown__item', {hasText: '区域'}).click()
}

/** Ctrl+左键在指针处生成当前类型实体 */
const spawnAt = async (page: Page, x: number, y: number): Promise<void> => {
    await page.mouse.move(x, y)
    await page.keyboard.down('Control')
    await page.mouse.down({button: 'left'})
    await page.mouse.up({button: 'left'})
    await page.keyboard.up('Control')
}

test.describe('区域（area）实体', () => {
    test('生成类型下拉包含「区域」，生成后进入元素列表', async ({page}) => {
        const {x, y} = await enterEditMode(page)

        /* 下拉中列出「区域」（旧「水体」已统一为区域） */
        await page.locator('#spawn-mode-panel .dc-dropdown__header').click()
        await expect(page.locator('#spawn-mode-panel .dc-dropdown__item', {hasText: '区域'})).toBeVisible()
        await page.locator('#spawn-mode-panel .dc-dropdown__item', {hasText: '区域'}).click()

        const rows = page.locator('#element-list-panel [data-id]')
        await spawnAt(page, x, y)
        await expect(rows).toHaveCount(1)
    })

    test('切换生成类型后生成的是区域而非箱子', async ({page}) => {
        const {x, y} = await enterEditMode(page)
        await selectAreaSpawnMode(page)

        const rows = page.locator('#element-list-panel [data-id]')
        await spawnAt(page, x, y)
        await expect(rows).toHaveCount(1)
        /* 区域行文本含默认几何（2×2×2）与视觉材质（water） */
        await expect(rows.first()).toContainText('water')
    })
})
