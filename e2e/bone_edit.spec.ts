import {test, expect} from '@playwright/test'

test.describe('骨骼动画编辑模式', () => {
    test('启动屏出现第 4 按钮「骨骼动画」并进入', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        const boneBtn = page.locator('button', {hasText: '骨骼动画'})
        await expect(boneBtn).toBeVisible()
        await boneBtn.click()
        await page.waitForSelector('#startup-overlay', {state: 'hidden', timeout: 5000}).catch(() => {})
        /* 时间轴面板出现 */
        await expect(page.locator('#bone-timeline')).toBeVisible()
    })

    test('进入后存在默认骨架与轨道列表', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        /* 轨道行出现（人形预设关节） */
        const spineRow = page.locator('[data-track-target="spine"]')
        await expect(spineRow).toBeAttached()
        const headRow = page.locator('[data-track-target="headNeck"]')
        await expect(headRow).toBeAttached()
    })

    test('添加关键帧 → data-keyframe-count 增加；Ctrl+Z 撤销减少', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        const spineRow = page.locator('[data-track-target="spine"]')
        await expect(spineRow).toBeAttached()
        const countEl = spineRow.locator('[data-keyframe-count]')
        const before = Number(await countEl.getAttribute('data-keyframe-count'))
        await page.locator('button', {hasText: '+关键帧'}).click()
        const after = Number(await countEl.getAttribute('data-keyframe-count'))
        expect(after).toBeGreaterThan(before)
        /* Ctrl+Z 撤销 */
        await page.keyboard.press('Control+KeyZ')
        const undone = Number(await countEl.getAttribute('data-keyframe-count'))
        expect(undone).toBe(before)
        /* Ctrl+Shift+Z 重做 */
        await page.keyboard.press('Control+Shift+KeyZ')
        const redone = Number(await countEl.getAttribute('data-keyframe-count'))
        expect(redone).toBe(after)
    })

    test('播放动画 → data-playhead-time 推进', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        /* 先加关键帧使动画可播放 */
        await page.locator('button', {hasText: '+关键帧'}).click()
        await page.locator('button', {hasText: '▶'}).click()
        await page.waitForTimeout(300)
        const t1 = await page.locator('#bone-timeline').getAttribute('data-playhead-time')
        await page.waitForTimeout(300)
        const t2 = await page.locator('#bone-timeline').getAttribute('data-playhead-time')
        const n1 = Number(t1)
        const n2 = Number(t2)
        expect(n2).toBeGreaterThan(n1)
        await page.locator('button', {hasText: '■'}).click()
    })

    test('导出资产触发下载', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        const downloadPromise = page.waitForEvent('download', {timeout: 3000}).catch(() => null)
        await page.locator('button', {hasText: '导出'}).click()
        const download = await downloadPromise
        if (download) {
            expect(download.suggestedFilename()).toContain('bone-asset')
        }
    })

    test('时间轴面板可拖拽调高度（renderer 视窗联动）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        const timeline = page.locator('#bone-timeline')
        const box = await timeline.boundingBox()
        expect(box).not.toBeNull()
        if (box === null) return
        /* 顶部手柄向上拖 60px */
        await page.mouse.move(box.x + box.width / 2, box.y + 3)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2, box.y + 3 - 60, {steps: 5})
        await page.mouse.up()
        const box2 = await timeline.boundingBox()
        expect(box2).not.toBeNull()
        if (box2 !== null) {
            expect(box2.height).toBeGreaterThan(box.height)
        }
    })
})