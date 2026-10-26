import type {CharacterMaterialId} from '../../../../../render/character_materials.ts'

/** 手部模型高度（相对前臂）：前臂的 0.7 倍再缩短为 1/4，避免手部过长 */
export const HAND_HEIGHT_RATIO = 0.7 / 4

/** 持械戒备位：肩前举角（rad，负值 = 前摆，刃尖朝上收至体侧前方） */
export const WEAPON_READY_SHOULDER = -0.45

/** 持械戒备位：肘弯曲（rad，负值 = 前臂向前折、肘尖朝后，符合人体） */
export const WEAPON_READY_ELBOW = -0.85

/** 持械戒备位：持械臂微摆幅度（rad，武器竖持微摆） */
export const WEAPON_READY_SWAY = 0.03

/** 持械行走：持械臂摆动幅度（rad，远小于空手摆臂） */
export const WEAPON_WALK_ARM_SWING = 0.12

/** 基础状态 clip 关键帧烘焙采样率（fps） */
export const CLIP_SAMPLE_FPS = 60

/** 行走步态周期频率（用于步行 clip 时长与相位） */
export const WALK_CYCLE_FREQ = 6

/** 游泳划水周期频率（rad/s）：clip 时长与姿态采样共用，保证一个 clip 正好一个完整划水周期 */
export const SWIM_CYCLE_FREQ = 2

/** 跳跃伸展动作结束时长（秒） */
export const JUMP_EXTEND_END = 0.3

/** 死亡倒下动作结束时长（秒） */
export const FALL_END = 0.3

/** 格挡 / 蓄力期间叠加下半身行走动画的最低水平速度（m/s） */
export const ENGAGED_WALK_MIN_SPEED = 0.3

/** 护甲外扩边距（米）：包裹对应身体部件且不产生明显穿模 */
export const ARMOR_PAD = 0.03

/** 护甲材质厚度系数（宽 / 深 = 身体对应部件尺寸 × 该系数） */
export const ARMOR_MATERIAL_THICKNESS: Readonly<Partial<Record<CharacterMaterialId, number>>> = {
    cloth: 1.05,
    leather: 1.1,
    scale: 1.15,
    metal: 1.2,
    stone: 1.25,
}

/** 未知材质的护甲厚度回退值 */
export const ARMOR_DEFAULT_THICKNESS = 1.1

/** 取某材质对应的护甲厚度系数 */
export const armorThicknessOf = (material: CharacterMaterialId): number =>
    ARMOR_MATERIAL_THICKNESS[material] ?? ARMOR_DEFAULT_THICKNESS

/** 护甲顶缘相对身体部件顶面的额外上探量（米） */
export const ARMOR_TOP_OVERLAP = ARMOR_PAD

/** 受击后仰幅度（rad，spine.rotation.x 负值 = 向后仰） */
export const FLINCH_SPINE_BACK = 0.25

/** 受击双臂抬举护头（rad，肩 X 前抬） */
export const FLINCH_ARM_RAISE = 0.9

/** 受击双臂外张（rad，肩 Z） */
export const FLINCH_ARM_SPREAD = 0.5

/** 受击屈肘（rad，负值 = 前折） */
export const FLINCH_ELBOW = -1.2

/** 受击头部后仰（rad） */
export const FLINCH_HEAD_BACK = 0.15

/** 举盾臂前抬角（rad，负值 = 前举） */
export const BLOCK_SHOULDER = -0.35

/** 举盾屈肘（rad，负值 = 前臂前折收盾于身前） */
export const BLOCK_ELBOW = -1.35

/** 格挡躯干前倾（rad） */
export const BLOCK_LEAN = 0.08

/** 格挡姿态轻微起伏幅度（rad） */
export const BLOCK_SWAY = 0.02

/** 未持盾侧手臂自然下垂角（肩 / 肘，rad） */
export const BLOCK_IDLE_SHOULDER = -0.05
export const BLOCK_IDLE_ELBOW = -0.1

/** 盾面朝前时武器骨骼相对前臂链的净 X 转角（rad） */
export const SHIELD_FACE_NET_X = Math.PI / 2

/** 副手盾挂背时的额外倾角（rad，绕武器本地 X） */
export const SHIELD_STOW_TILT_X = -Math.PI / 2
