import {Quaternion, Vector3} from 'three'
import type {Group} from 'three'
import {SWIM_PRONE_PITCH} from '../../entity/character/appearance/constants.ts'
import type {ShowcaseAction} from './actor_handle.ts'

const SWIM_AXIS_X = new Vector3(1, 0, 0)
const _pitch = new Quaternion()
const _pivot = new Vector3()
const _offset = new Vector3()

/**
 * 展示台根姿态：镜像生产 `world.ts` 的游泳俯卧分支。
 * 动画只产出局部姿态，俯卧前倾与绕身体中心的位移补偿必须由根节点合成；
 * 俯卧体形（狼 / 马 / 飞龙）骨架本身已水平，不叠加该前倾。
 * 其余动作保持根节点归零，避免退出游泳后残留倾斜。
 */
export const applyShowcaseRootPosture = (
    group: Group,
    action: ShowcaseAction,
    centerOffsetY: number,
    uprightRoot = true,
): void => {
    if (!uprightRoot || action !== 'swimming') {
        group.quaternion.identity()
        group.position.set(0, 0, 0)
        return
    }
    _pitch.setFromAxisAngle(SWIM_AXIS_X, SWIM_PRONE_PITCH)
    group.quaternion.copy(_pitch)
    _pivot.set(0, centerOffsetY, 0)
    _offset.copy(_pivot).applyQuaternion(group.quaternion)
    group.position.copy(_pivot).sub(_offset)
}
