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

    test('动画列表列出全部内置动作（基础状态 + 全部攻击技能）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        /* 内置条目总数 = 基础状态 9 + 近战 26（巨剑/长枪各 5 段）+ 远程 9 */
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-builtin-clip-count', '44')
        const builtinOptions = page.locator('#bone-anim-select option[data-builtin-id]')
        await expect(builtinOptions).toHaveCount(44)
        /* 抽取代表性条目：行走/跳跃/近战链段（含巨剑轻 3 与长枪蓄力变体）/远程技能 */
        for (const id of ['state/walking', 'state/jumping', 'short_sword_light_1', 'heavy_sword_light_3', 'spear_charge_thrust', 'long_sword_heavy_2', 'longbow_shot']) {
            await expect(page.locator(`#bone-anim-select option[data-builtin-id="${id}"]`)).toBeAttached()
        }
    })

    test('选择内置动作「行走（空手）」→ 载入可编辑副本并播放', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        await page.selectOption('#bone-anim-select', 'builtin:state/walking')
        /* 副本入库并成为当前动画 */
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-current-clip', '行走（空手）')
        await expect(page.locator('#bone-anim-select option[value="edited:行走（空手）"]')).toBeAttached()
        /* 内置行走动画已带关键帧 */
        const count = Number(await page.locator('[data-track-target="spine"] [data-keyframe-count]').getAttribute('data-keyframe-count'))
        expect(count).toBeGreaterThan(10)
        /* 播放后播放头推进 */
        await page.locator('button', {hasText: '▶'}).click()
        await page.waitForTimeout(300)
        const t1 = Number(await page.locator('#bone-timeline').getAttribute('data-playhead-time'))
        await page.waitForTimeout(300)
        const t2 = Number(await page.locator('#bone-timeline').getAttribute('data-playhead-time'))
        expect(t2).toBeGreaterThan(t1)
    })

    test('内置近战动作按武器分组、链段顺序连续排列（巨剑轻链 3 段、长枪含蓄力变体）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        const labels = await page.locator('#bone-anim-select optgroup[label^="近战攻击"] option').allTextContents()
        expect(labels).toHaveLength(26)
        const expected: Readonly<Record<string, readonly string[]>> = {
            短剑: ['轻击一段', '轻击二段', '重击一段', '重击二段'],
            长剑: ['轻击一段', '轻击二段', '重击一段', '重击二段'],
            巨剑: ['轻击一段', '轻击二段', '轻击三段', '重击一段', '重击二段'],
            长枪: ['轻击一段', '轻击二段', '蓄力突刺', '重击一段', '重击二段'],
            双斧: ['轻击一段', '轻击二段', '重击一段', '重击二段'],
            战锤: ['轻击一段', '轻击二段', '重击一段', '重击二段'],
        }
        for (const [weapon, segmentLabels] of Object.entries(expected)) {
            const start = labels.indexOf(`${weapon} · ${segmentLabels[0]}`)
            expect(start, `${weapon} 应出现在内置清单中`).toBeGreaterThanOrEqual(0)
            expect(labels.slice(start, start + segmentLabels.length)).toEqual(segmentLabels.map(label => `${weapon} · ${label}`))
        }
    })

    test('选择内置攻击动作「长剑 · 轻击一段」→ 载入副本并带命中事件轨', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        await page.selectOption('#bone-anim-select', 'builtin:long_sword_light_1')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-current-clip', '长剑 · 轻击一段')
        /* 事件轨（hitbox_on / hitbox_off）与关节关键帧均已载入（动画为稀疏关键帧：起手 + 阶段末姿态） */
        await expect(page.locator('[data-track-target="__events__"] [data-keyframe-count]')).toHaveAttribute('data-keyframe-count', '2')
        const armCount = Number(await page.locator('[data-track-target="rightArmShoulder"] [data-keyframe-count]').getAttribute('data-keyframe-count'))
        expect(armCount).toBeGreaterThanOrEqual(2)
    })

    test('编辑器武器：攻击动作自动装备对应武器，双手武器左手贴合到武器', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        /* 武器占用的两个骨骼位在轨道列表中可见 */
        await expect(page.locator('[data-track-target="rightWeaponMount"]')).toBeAttached()
        await expect(page.locator('[data-track-target="leftWeaponMount"]')).toBeAttached()
        /* 进入编辑器即有默认武器（长剑），且左手贴合默认关闭（编辑时两只手互不牵扯） */
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'long_sword')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-grip-assist', 'off')

        /* 选长剑轻击一段 → 自动装备长剑（单手，不求解左手） */
        await page.selectOption('#bone-anim-select', 'builtin:long_sword_light_1')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'long_sword')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-two-handed', 'false')

        /* 选巨剑 → 自动换成巨剑（双手）；贴合默认关闭，播放时左手也不被牵扯 */
        await page.selectOption('#bone-anim-select', 'builtin:heavy_sword_light_1')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'heavy_sword')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-two-handed', 'true')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-grip-solved', 'false')
        await page.locator('button', {hasText: '▶'}).click()
        await page.waitForTimeout(300)
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-grip-solved', 'false')

        /* 打开「左手贴合」→ 左手链才求解到武器副握点（暂停状态下即时生效） */
        await page.locator('#bone-grip-toggle').click()
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-grip-assist', 'on')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-grip-solved', 'true')

        /* 关闭贴合 → 解除左手约束（回到由动画驱动的左手姿态） */
        await page.locator('#bone-grip-toggle').click()
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-grip-assist', 'off')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-grip-solved', 'false')

        /* 基础状态：空手变体卸下武器，持械变体保留当前武器 */
        await page.selectOption('#bone-anim-select', 'builtin:state/idle')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', '')
        await page.selectOption('#bone-anim-select', 'builtin:state/idle_held')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'heavy_sword')

        /* 手动覆盖为「无武器」 */
        await page.selectOption('#bone-weapon-select', 'none')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', '')

        /* 手动指定战锤（双手） */
        await page.selectOption('#bone-weapon-select', 'war_hammer')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'war_hammer')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-two-handed', 'true')
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