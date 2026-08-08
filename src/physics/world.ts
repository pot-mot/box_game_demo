import {
    World,
    Body,
    BODY_TYPES,
    Plane,
    Vec3,
    Material,
    ContactMaterial,
    SAPBroadphase,
} from 'cannon-es'
import {
    GRAVITY,
    GROUND_Y,
    BOX_BOX_FRICTION,
    BOX_GROUND_FRICTION,
    DEFAULT_COLLISION_GROUP,
    DEFAULT_COLLISION_MASK,
} from './constants.ts'

export interface SharedWorld {
    world: World
    boxMat: Material
    /** 角色材质：摩擦 0，velocity 驱动的角色不受地面摩擦拖拽（Box 底面 4 接触点会放大摩擦） */
    charMat: Material
}

/** 创建 cannon-es 物理世界（地面、接触材质），供 entity/box 各实体共享 */
export const createSharedWorld = (): SharedWorld => {
    const world = new World()
    world.gravity.set(0, GRAVITY, 0)
    world.broadphase = new SAPBroadphase(world)
    world.allowSleep = true

    const boxMat = new Material('box')
    const groundMat = new Material('ground')
    const charMat = new Material('char')
    world.addContactMaterial(new ContactMaterial(boxMat, boxMat, {friction: BOX_BOX_FRICTION}))
    world.addContactMaterial(new ContactMaterial(boxMat, groundMat, {friction: BOX_GROUND_FRICTION}))
    /* 角色接触对摩擦 0：velocity 驱动的角色不受地面/箱子摩擦拖拽（Box 底面 4 接触点会放大摩擦） */
    world.addContactMaterial(new ContactMaterial(charMat, groundMat, {friction: 0}))
    world.addContactMaterial(new ContactMaterial(charMat, boxMat, {friction: 0}))
    world.addContactMaterial(new ContactMaterial(charMat, charMat, {friction: 0}))

    const groundBody = new Body({
        mass: 0,
        type: BODY_TYPES.STATIC,
        collisionFilterGroup: DEFAULT_COLLISION_GROUP,
        collisionFilterMask: DEFAULT_COLLISION_MASK,
    })
    groundBody.addShape(new Plane())
    groundBody.material = groundMat
    groundBody.position.set(0, GROUND_Y, 0)
    groundBody.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2)
    world.addBody(groundBody)

    return {world, boxMat, charMat}
}
