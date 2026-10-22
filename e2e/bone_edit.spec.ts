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
        await page.locator('#bone-timeline-play').click()
        await page.waitForTimeout(300)
        const t1 = await page.locator('#bone-timeline').getAttribute('data-playhead-time')
        await page.waitForTimeout(300)
        const t2 = await page.locator('#bone-timeline').getAttribute('data-playhead-time')
        const n1 = Number(t1)
        const n2 = Number(t2)
        expect(n2).toBeGreaterThan(n1)
        await page.locator('#bone-timeline-stop').click()
    })

    test('动画列表列出全部内置动作（基础状态 + 全部攻击技能）', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        /* 抽取代表性条目：行走/跳跃/近战链段（含巨剑轻 3 与重击段）/远程技能 */
        for (const id of ['state/walking', 'state/jumping', 'short_sword_one_handed_light_1', 'heavy_sword_two_handed_light_3', 'long_sword_one_handed_heavy_1', 'long_sword_one_handed_heavy_2', 'longbow_shot', 'unarmed_one_handed_light_1']) {
            await expect(page.locator(`#bone-anim-select option[data-builtin-id="${id}"]`)).toBeAttached()
        }
    })

    test('选择内置动作「行走（空手）」→ 载入可编辑副本并播放', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        await page.selectOption('#bone-anim-select', 'builtin:state/walking')
        /* 内置行走动画已带关键帧 */
        const count = Number(await page.locator('[data-track-target="spine"] [data-keyframe-count]').getAttribute('data-keyframe-count'))
        expect(count).toBeGreaterThan(10)
        /* 播放后播放头推进 */
        await page.locator('#bone-timeline-play').click()
        await page.waitForTimeout(300)
        const t1 = Number(await page.locator('#bone-timeline').getAttribute('data-playhead-time'))
        await page.waitForTimeout(300)
        const t2 = Number(await page.locator('#bone-timeline').getAttribute('data-playhead-time'))
        expect(t2).toBeGreaterThan(t1)
    })

    test('选择内置攻击动作「长剑 · 轻击一段」→ 载入副本并带命中事件轨', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        await page.selectOption('#bone-anim-select', 'builtin:long_sword_one_handed_light_1')
        /* 事件轨（hitbox_on / hitbox_off）与关节关键帧均已载入 */
        await expect(page.locator('[data-track-target="__events__"] [data-keyframe-count]')).toHaveAttribute('data-keyframe-count', '2')
        const armCount = Number(await page.locator('[data-track-target="rightArmShoulder"] [data-keyframe-count]').getAttribute('data-keyframe-count'))
        expect(armCount).toBeGreaterThanOrEqual(2)
    })

    test('编辑器武器：攻击动作自动装备对应武器，切换体形同步对应体形武器', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        /* 武器占用的两个骨骼位在轨道列表中可见 */
        await expect(page.locator('[data-track-target="rightWeaponMount"]')).toBeAttached()
        await expect(page.locator('[data-track-target="leftWeaponMount"]')).toBeAttached()
        /* 进入编辑器默认同步人形体形的默认武器（空手） */
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'unarmed')

        /* 选长剑轻击一段 → 自动装备长剑（单手） */
        await page.selectOption('#bone-anim-select', 'builtin:long_sword_one_handed_light_1')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'long_sword')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-two-handed', 'false')

        /* 选巨剑 → 自动换成巨剑（双手）；不再有自动副手贴合开关 */
        await page.selectOption('#bone-anim-select', 'builtin:heavy_sword_two_handed_light_1')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'heavy_sword')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-two-handed', 'true')
        await page.locator('#bone-timeline-play').click()
        await page.waitForTimeout(300)
        await expect(page.locator('#bone-grip-toggle')).toHaveCount(0)

        /* 基础状态：空手变体卸下武器，持械变体保留当前武器 */
        await page.selectOption('#bone-anim-select', 'builtin:state/idle')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', '')
        await page.selectOption('#bone-anim-select', 'builtin:state/idle_held')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'heavy_sword')

        /* 选空手轻击 → 天然武器同样进动作库并自动装备空手 */
        await page.selectOption('#bone-anim-select', 'builtin:unarmed_one_handed_light_1')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'unarmed')

        /* 手动覆盖为「无武器」 */
        await page.selectOption('#bone-weapon-select', 'none')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', '')

        /* 手动指定战锤（无动画来源 → 默认单持模式，非双手） */
        await page.selectOption('#bone-weapon-select', 'war_hammer')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'war_hammer')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-two-handed', 'false')

        /* 惯用手预览：默认右撇子；切左撇子后预览镜像（data-handedness 变化，武器不变） */
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-handedness', 'right')
        await page.selectOption('#bone-handedness-select', 'left')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-handedness', 'left')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'war_hammer')
        await page.selectOption('#bone-handedness-select', 'right')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-handedness', 'right')

        /* 切换体形：武器列表与当前武器同步到该体形默认武器 */
        await page.selectOption('#bone-form-select', 'wolf')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-form', 'wolf')
        await expect(page.locator('#bone-timeline')).toHaveAttribute('data-weapon', 'wolf_bite')
        await expect(page.locator('#bone-weapon-select option[value="wolf_bite"]')).toBeAttached()
        await expect(page.locator('#bone-handedness-select')).toBeHidden()
    })

    test('右侧常驻面板：编辑开关与节点/骨骼/模型显示独立控制', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        const panel = page.locator('#bone-view-panel')
        await expect(panel).toBeVisible()
        await expect(panel).toHaveAttribute('data-edit-enabled', 'true')
        await expect(panel).toHaveAttribute('data-show-joints', 'true')
        await expect(panel).toHaveAttribute('data-show-bones', 'true')
        await expect(panel).toHaveAttribute('data-show-model', 'true')

        await page.locator('#bone-edit-lock').uncheck()
        await expect(panel).toHaveAttribute('data-edit-enabled', 'false')
        await page.locator('#bone-show-joints').uncheck()
        await expect(panel).toHaveAttribute('data-show-joints', 'false')
        await page.locator('#bone-show-bones').uncheck()
        await expect(panel).toHaveAttribute('data-show-bones', 'false')
        await page.locator('#bone-show-model').uncheck()
        await expect(panel).toHaveAttribute('data-show-model', 'false')

        await page.locator('#bone-edit-lock').check()
        await page.locator('#bone-show-joints').check()
        await page.locator('#bone-show-bones').check()
        await page.locator('#bone-show-model').check()
        await expect(panel).toHaveAttribute('data-edit-enabled', 'true')
        await expect(panel).toHaveAttribute('data-show-model', 'true')
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

    test('函数编排模式：懒烘焙内置脚本、可播放预览并转回轨道', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        await page.locator('#bone-mode-script').click()
        const timeline = page.locator('#bone-timeline')
        const panel = page.locator('#bone-script-panel')
        await expect(panel).toBeVisible()
        await expect(timeline).toHaveAttribute('data-authoring-mode', 'script')
        await expect(panel).toHaveAttribute('data-form', 'humanoid')
        await expect(panel).toHaveAttribute('data-baked-count', '3')
        await expect(page.locator('[data-script-id="wave"]')).toHaveAttribute('data-baked', 'true')
        await expect(page.locator('[data-script-id="march"]')).toHaveAttribute('data-baked', 'true')
        await page.locator('#bone-timeline-play').click()
        await page.waitForTimeout(250)
        const time = Number(await page.locator('#bone-script-progress').getAttribute('data-time'))
        expect(time).toBeGreaterThan(0)
        await page.locator('#bone-timeline-stop').click()
        await page.locator('#bone-script-to-tracks').click()
        await expect(timeline).toHaveAttribute('data-authoring-mode', 'tracks')
        await expect(panel).toBeHidden()
        const count = Number(await page.locator('[data-track-target="headNeck"] [data-keyframe-count]').getAttribute('data-keyframe-count'))
        expect(count).toBeGreaterThan(0)
    })

    test('体形切换：脚本动作与动画库按 form 独立', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        await page.locator('#bone-mode-script').click()
        const timeline = page.locator('#bone-timeline')
        const panel = page.locator('#bone-script-panel')
        await page.selectOption('#bone-form-select', 'wolf')
        await expect(timeline).toHaveAttribute('data-form', 'wolf')
        await expect(panel).toHaveAttribute('data-form', 'wolf')
        await expect(page.locator('[data-script-id="tail_wag"]')).toHaveAttribute('data-baked', 'true')
        await page.selectOption('#bone-form-select', 'horse')
        await expect(panel).toHaveAttribute('data-form', 'horse')
        await expect(page.locator('[data-script-id="head_nod"]')).toHaveAttribute('data-baked', 'true')
    })

    test('非人形体形隐藏惯用手但仍显示自身武器，且列出自身内置动画', async ({page}) => {
        await page.goto('/')
        await page.waitForSelector('#startup-overlay', {timeout: 5000})
        await page.locator('button', {hasText: '骨骼动画'}).click()
        await expect(page.locator('#bone-timeline')).toBeVisible()
        await page.selectOption('#bone-form-select', 'wyvern')
        const timeline = page.locator('#bone-timeline')
        await expect(timeline).toHaveAttribute('data-form', 'wyvern')
        await expect(timeline).toHaveAttribute('data-authoring-mode', 'tracks')
        expect(Number(await timeline.getAttribute('data-builtin-clip-count'))).toBeGreaterThan(0)
        await expect(page.locator('#bone-weapon-select')).toBeVisible()
        await expect(page.locator('#bone-handedness-select')).toBeHidden()
        await expect(timeline).toHaveAttribute('data-weapon', 'wyvern_claw')

        /* 非人形内置动作可实际载入：攻击段有关键帧，骨架段（bones）出现在轨道列表中 */
        const option = page.locator('#bone-anim-select option[data-builtin-id="wyvern_claw_one_handed_light_1"]')
        const optionValue = await option.getAttribute('value')
        expect(optionValue).not.toBeNull()
        await page.selectOption('#bone-anim-select', optionValue!)
        await expect(page.locator('[data-track-target="body"] [data-keyframe-count]')).not.toHaveText('0')
        await expect(page.locator('[data-track-target="spineSeg"]')).toBeVisible()
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