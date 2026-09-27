/**
 * 角色锁定点：除默认的身体中心点外，可额外配置若干绑定到骨架关节的锁定点。
 * 偏移量为关节本地坐标（随关节动画与角色朝向一起变换），锁定镜头对准命中的锁定点。
 */
export interface LockPointConfig {
    /** 目标关节 id（对应骨架关节；运行时找不到该关节时跳过此点） */
    readonly jointId: string
    /** 相对关节本地的三维偏移（米，[x, y, z]） */
    readonly offset: readonly [number, number, number]
}

/** 过滤非法条目并拷贝为安全配置（缺失 / 非法偏移 / 空关节 id 一律剔除，不抛错） */
export const sanitizeLockPoints = (points: readonly LockPointConfig[] | undefined): LockPointConfig[] => {
    const result: LockPointConfig[] = []
    if (points === undefined) return result
    for (const point of points) {
        if (typeof point.jointId !== 'string' || point.jointId.length === 0) continue
        const [x, y, z] = point.offset
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
        result.push({jointId: point.jointId, offset: [x, y, z]})
    }
    return result
}
