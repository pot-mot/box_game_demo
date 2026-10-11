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

/** Ctrl+左键在指针处生成默认生成类型（普通方块） */
const spawnAt = async (page: Page, x: number, y: number): Promise<void> => {
    await page.mouse.move(x, y)
    await page.keyboard.down('Control')
    await page.mouse.down({button: 'left'})
    await page.mouse.up({button: 'left'})
    await page.keyboard.up('Control')
}

test.describe('编辑模式 Delete 删除选中元素', () => {
    test('Delete 删除画布中选中的实体', async ({page}) => {
        const {x, y} = await enterEditMode(page)

        const rows = page.locator('#element-list-panel [data-id]')
        await spawnAt(page, x, y)
        await expect(rows).toHaveCount(1)

        /* 左键点击画布中的实体选中（生成点在指针处，暂停态下实体不动） */
        await page.mouse.click(x, y)
        await expect(page.locator('#element-list-panel .dc-list-row.is-selected')).toHaveCount(1)

        /* Delete 删除当前选中元素 */
        await page.keyboard.press('Delete')
        await expect(rows).toHaveCount(0)
    })
})
