/** 角色配置默认值（供 schema .default() 引用） */
export const CHARACTER_CONFIG_DEFAULTS = {
    speed: 3,
    jumpHeight: 2,
    scale: 1,
}

/** 角色基础碰撞箱尺寸（scale=1 时） */
export const CHARACTER_BASE_SIZE = {
    width: 0.25,
    height: 1,
    depth: 0.1625,
}

export const CHARACTER_COLLISION_GROUP = 1
export const CHARACTER_COLLISION_MASK = -1
