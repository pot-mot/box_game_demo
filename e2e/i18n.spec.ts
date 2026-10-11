import {test, expect, type Page} from '@playwright/test'

/**
 * 国际化（i18n）端到端契约：
 * - 启动屏语言选择即时切换文案；
 * - 设置菜单切换语言后，已在屏的 UI（生成类型面板）原地重译；
 * - 语言偏好写入 localStorage，供下次进入复用。
 */

const enterEditMode = async (page: Page): Promise<void> => {
    await page.goto('/')
    await page.waitForSelector('#startup-overlay', {timeout: 5000})
    await page.locator('button', {hasText: '编辑模式'}).click()
}

test.describe('国际化', () => {
    test('启动屏切换语言即时更新文案并写入 localStorage', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})

        await expect(page.locator('#startup-overlay', {hasText: '3D 物理沙盒'})).toBeVisible()

        await page.locator('#startup-language').selectOption('en')
        await expect(page.locator('#startup-overlay', {hasText: '3D Physics Sandbox'})).toBeVisible()
        await expect(page.locator('button', {hasText: 'Edit Mode'})).toBeVisible()

        /* 自绘文件选择与缓存提示的文案也随语言切换 */
        await expect(page.getByRole('button', {name: 'Choose File'})).toBeVisible()
        await expect(page.locator('#startup-overlay', {hasText: 'No file chosen'})).toBeVisible()

        const stored = await page.evaluate(() => localStorage.getItem('box_demo_language'))
        expect(stored).toBe('en')
        expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
    })

    test('设置菜单切换语言后已渲染 UI 原地重译', async ({page}) => {
        await enterEditMode(page)
        await page.waitForSelector('#spawn-mode-panel', {timeout: 5000})

        /* 默认中文：生成类型面板显示中文项 */
        await expect(page.locator('#spawn-mode-panel')).toContainText('普通方块')

        /* 打开设置菜单并切换英文 */
        await page.locator('#settings-btn').click()
        await page.locator('#settings-language').selectOption('en')

        /* 已渲染的生成类型面板原地更新 */
        await expect(page.locator('#spawn-mode-panel')).toContainText('Common Box')
    })

    test('切换语言不破坏面板内下拉框 / 输入框等子控件', async ({page}) => {
        await enterEditMode(page)
        await page.waitForTimeout(400)
        /* 生成类型切到「角色」后生成并选中，弹出角色面板（含大量 select / input） */
        for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown')
        await page.mouse.move(600, 400)
        await page.keyboard.down('Control')
        await page.mouse.down({button: 'left'})
        await page.mouse.up({button: 'left'})
        await page.keyboard.up('Control')
        await page.locator('#element-list-panel [data-id][data-type="character"]').click()
        await expect(page.locator('#character-panel')).toBeVisible()

        /* 切换前控件齐备 */
        const selectsBefore = await page.locator('#character-panel select').count()
        expect(selectsBefore).toBeGreaterThan(0)
        await expect(page.locator('#character-panel #hold-mode-select')).toHaveCount(1)
        await expect(page.locator('#character-panel #offhand-weapon-select')).toHaveCount(1)
        await expect(page.locator('#character-panel label', {hasText: /^头盔/}).locator('select')).toHaveCount(1)

        /* 切换语言（原地重译） */
        await page.locator('#settings-btn').click()
        await page.locator('#settings-language').selectOption('en')

        /* 切换后子控件不丢失，标签文本更新为英文 */
        await expect(page.locator('#character-panel')).toContainText('Character Control')
        await expect(page.locator('#character-panel #hold-mode-select')).toHaveCount(1)
        await expect(page.locator('#character-panel #offhand-weapon-select')).toHaveCount(1)
        expect(await page.locator('#character-panel select').count()).toBe(selectsBefore)
        await expect(page.locator('#character-panel label', {hasText: /^Head/}).locator('select')).toHaveCount(1)

        /* 选项文案 / 装备预览 / 列表行「物·魔」短名 均随语言切换更新 */
        await expect(page.locator('#character-panel #offhand-weapon-select option', {hasText: 'Long Sword'})).toHaveCount(1)
        await expect(page.locator('#character-panel option', {hasText: 'Cloth Cap'})).toHaveCount(1)
        await expect(page.locator('#character-panel option', {hasText: 'Hostile All'})).toHaveCount(1)
        await expect(page.locator('#character-panel')).toContainText('Effective defense')
        await expect(page.locator('#element-list-panel [data-id][data-type="character"]')).toContainText('def:Phys')
    })

    test('展示模式切换语言后列表名称与聚焦选项重译', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await page.locator('.sch-menu-card', {hasText: '装备与外观'}).click()
        await page.waitForSelector('.sch-panel', {timeout: 5000})

        /* 外观模块首行（种族展示）：骷髅 */
        await expect(page.locator('.sch-panel .sch-skill').first()).toHaveText('骷髅')

        await page.locator('#settings-btn').click()
        await page.locator('#settings-language').selectOption('en')

        await expect(page.locator('.sch-panel .sch-skill').first()).toHaveText('Skeleton')
    })

    test('背包面板切换语言后物品名 / 装备槽名同步重译', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '展示模式'}).click()
        await page.locator('.sch-menu-card', {hasText: '背包与格子交互'}).click()
        /* 演示背包预装主手短剑：装备槽显示「主手: 短剑」 */
        await expect(page.getByText('短剑').first()).toBeVisible()

        await page.locator('#settings-btn').click()
        await page.locator('#settings-language').selectOption('en')

        await expect(page.getByText('Short Sword').first()).toBeVisible()
        await expect(page.getByText('Main Hand').first()).toBeVisible()
    })

    test('骨骼动画洋葱皮按钮随语言切换按当前开合态重译', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()

        /* 初始关闭态 */
        await expect(page.getByRole('button', {name: '洋葱皮', exact: true})).toBeVisible()
        /* 打开洋葱皮 */
        await page.getByRole('button', {name: '洋葱皮', exact: true}).click()
        await expect(page.getByRole('button', {name: '洋葱皮开', exact: true})).toBeVisible()

        /* 切换英文：按「开」态显示对应英文，而非回退或丢失状态 */
        await page.locator('#settings-btn').click()
        await page.locator('#settings-language').selectOption('en')
        await expect(page.getByRole('button', {name: 'Onion Skin On', exact: true})).toBeVisible()
    })
})
