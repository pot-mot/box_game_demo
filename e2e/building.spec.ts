import {readFileSync} from 'node:fs'
import {test, expect, type Page} from '@playwright/test'

const enterEditAndSpawnBuilding = async (page: Page): Promise<{x: number; y: number}> => {
    await page.goto('/')
    await page.waitForSelector('#startup-overlay', {timeout: 5000})
    await page.locator('button', {hasText: '编辑模式'}).click()
    await page.waitForSelector('#spawn-mode-panel', {timeout: 5000})

    await page.locator('#spawn-mode-panel > div').first().click()
    await page.locator('#spawn-mode-panel').getByText('Building', {exact: true}).click()

    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('canvas missing')
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.click(x, y, {button: 'right'})
    return {x, y}
}

const saveAndRead = async (page: Page): Promise<string> => {
    const downloadPromise = page.waitForEvent('download', {timeout: 5000})
    await page.keyboard.press('Control+S')
    const download = await downloadPromise
    const path = await download.path()
    return readFileSync(path, 'utf-8')
}

test.describe('建筑生成器', () => {
    test('编辑模式生成建筑并写入存档 v7 + 笔刷控件', async ({page}) => {
        const {x, y} = await enterEditAndSpawnBuilding(page)

        /* 左键点击建筑应选中并打开建筑面板（chunk 网格经父 Group 匹配实体） */
        await page.mouse.click(x, y - 60)
        await expect(page.locator('#building-generator-panel')).toBeVisible()

        /* 面板按钮为「应用 / 删除」（作用于选中世界），不再是「生成」 */
        await expect(page.getByRole('button', {name: '应用', exact: true})).toBeVisible()
        await expect(page.getByRole('button', {name: '删除', exact: true})).toBeVisible()

        /* 建筑笔刷面板常驻；六种工具可切换 */
        const brushPanel = page.locator('#building-brush-panel')
        await expect(brushPanel).toBeVisible()
        await expect(page.locator('#brush-tool option')).toHaveCount(6)
        await page.locator('#brush-tool').selectOption('prop')
        await expect(page.locator('#brush-prop')).toBeVisible()
        await page.locator('#brush-tool').selectOption('stamp')
        await expect(page.locator('#brush-stamp-recipe')).toBeVisible()

        await expect(page.locator('#element-list-panel')).toContainText('house')
        const text = await saveAndRead(page)
        expect(text).toContain('building_generator')
    })

    test('道具放置 / 区域填充 / 全建筑材质替换实际交互', async ({page}) => {
        const {x, y} = await enterEditAndSpawnBuilding(page)
        await expect(page.locator('#element-list-panel')).toContainText('house')

        /* 选中建筑世界以打开建筑面板 */
        await page.locator('#element-list-panel [data-id]').first().click()
        await expect(page.locator('#building-generator-panel')).toBeVisible()

        /* 启用笔刷 → 放置道具（材质 wood，默认门）；略高于屏幕中心以命中房屋正面 */
        await page.locator('#brush-enable').check()
        await page.locator('#brush-material').selectOption('wood')
        await page.locator('#brush-tool').selectOption('prop')
        await page.mouse.click(x, y - 60)

        let text = await saveAndRead(page)
        expect(text).toContain('"props"')
        expect(text).toContain('"door"')

        /* 区域填充 rusty_iron：两次单击 */
        await page.locator('#brush-tool').selectOption('fill')
        await page.locator('#brush-material').selectOption('rusty_iron')
        await page.mouse.click(x, y - 60)
        await page.mouse.click(x, y - 90)

        text = await saveAndRead(page)
        expect(text).toContain('"rusty_iron"')

        /* 全建筑材质替换 brick → tile */
        await page.locator('#building-replace-from').selectOption('brick')
        await page.locator('#building-replace-to').selectOption('tile')
        await page.locator('#building-generator-panel button', {hasText: '替换'}).click()

        text = await saveAndRead(page)
        expect(text).not.toContain('"brick"')
    })
})
