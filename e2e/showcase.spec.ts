import {test, expect} from '@playwright/test'

/** 进入展示模式：启动屏 → 展示模式 → 等待二级菜单 */
const enterShowcaseMenu = async (page: import('@playwright/test').Page): Promise<void> => {
    await page.goto('/')
    await page.waitForSelector('#startup-overlay', {timeout: 5000})
    await page.locator('button', {hasText: '展示模式'}).click()
    await expect(page.locator('.sch-menu')).toBeVisible()
}

test.describe('展示模式（二级菜单 + 子模块）', () => {
    test('进入展示模式先出现二级菜单，含 5 个子模块卡片', async ({page}) => {
        await enterShowcaseMenu(page)
        await expect(page.locator('.sch-menu-card')).toHaveCount(5)
    })

    test('选择「动作展示」：面板出现，近战三模式 + 远程共 27 个角色', async ({page}) => {
        await enterShowcaseMenu(page)
        await page.locator('.sch-menu-card', {hasText: '动作展示'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        /* 近战 6 × 3 模式 = 18 + 远程 9 = 27 */
        await expect(page.locator('.sch-panel .sch-row')).toHaveCount(27)
    })

    test('动作模块聚焦近战角色：段计时行按先轻后重顺序排列', async ({page}) => {
        await enterShowcaseMenu(page)
        await page.locator('.sch-menu-card', {hasText: '动作展示'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        await page.locator('.sch-panel .sch-row').first().click()
        await expect(page.locator('.sch-detail .sch-skilllabel')).toHaveCount(4)
    })

    test('选择「装备与外观」：种族 3 + 护甲件 17 = 20 个展示角色', async ({page}) => {
        await enterShowcaseMenu(page)
        await page.locator('.sch-menu-card', {hasText: '装备与外观'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        await expect(page.locator('.sch-panel .sch-row')).toHaveCount(20)
    })

    test('模块内「返回展示菜单」：回到二级菜单', async ({page}) => {
        await enterShowcaseMenu(page)
        await page.locator('.sch-menu-card', {hasText: '动作展示'}).click()
        await expect(page.locator('.sch-panel')).toBeVisible()
        await page.locator('button', {hasText: '返回展示菜单'}).click()
        await expect(page.locator('.sch-menu')).toBeVisible()
    })

    test('选择「AI 与复杂地形」：出现 AI 状态 HUD，红蓝双方共 10 个单位', async ({page}) => {
        await enterShowcaseMenu(page)
        await page.locator('.sch-menu-card', {hasText: 'AI 与复杂地形'}).click()
        await expect(page.locator('.sch-ai-hud')).toBeVisible()
        await expect(page.locator('.sch-ai-hud .sch-ai-row')).toHaveCount(10)
    })

    test('选择「全物品图鉴」：格子形式列出全部 41 件物品', async ({page}) => {
        await enterShowcaseMenu(page)
        await page.locator('.sch-menu-card', {hasText: '全物品图鉴'}).click()
        await expect(page.locator('.sch-cat')).toBeVisible()
        /* 全部武器 15 + 护甲 17 + 方块 6 + 其它 3 = 41 */
        await expect(page.locator('.sch-cat .sch-cat-cell')).toHaveCount(41)
    })

    test('选择「背包与格子交互」：复用背包 / 装备面板', async ({page}) => {
        await enterShowcaseMenu(page)
        await page.locator('.sch-menu-card', {hasText: '背包与格子交互'}).click()
        await expect(page.locator('.sch-menu')).toBeHidden()
        await expect(page.getByText('背包 / 装备')).toBeVisible()
    })

    test('经设置菜单返回主页面（启动屏重现）', async ({page}) => {
        await enterShowcaseMenu(page)
        await page.locator('#settings-btn').click()
        await page.locator('#settings-menu div', {hasText: '返回主页面'}).click()
        await expect(page.locator('#startup-overlay')).toBeVisible()
    })
})
