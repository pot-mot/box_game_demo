import {describe, it, expect} from 'vitest'
import {createSkeletonJoint, connectJoint, disconnectJoint} from './joint.ts'

describe('骨骼关节点', () => {
    it('创建：默认 id 全局唯一，position/rotation 为单位值', () => {
        const a = createSkeletonJoint('a')
        const b = createSkeletonJoint('b')
        expect(a.id).not.toBe(b.id)
        expect(a.position.x).toBe(0)
        expect(a.rotation.w).toBe(1)
        expect(a.parent).toBeUndefined()
        expect(a.children).toHaveLength(0)
        expect(a.ikRootLevel).toBeUndefined()
    })

    it('创建：可显式指定 id（序列化/预设用）', () => {
        const a = createSkeletonJoint('a', 'spine')
        expect(a.id).toBe('spine')
    })

    it('创建：显式 id 形如 joint_N 时推进计数器避免后续自动 id 碰撞', () => {
        const explicit = createSkeletonJoint('e', 'joint_42')
        expect(explicit.id).toBe('joint_42')
        /* 计数器被推进到 43，后续自动 id 不再生成 joint_42 */
        const auto = createSkeletonJoint('a')
        expect(auto.id).not.toBe('joint_42')
        expect(Number(auto.id.replace('joint_', ''))).toBeGreaterThan(42)
    })

    it('单向连接：parent 与 children 互指一致', () => {
        const parent = createSkeletonJoint('parent')
        const child = createSkeletonJoint('child')
        connectJoint(parent, child)
        expect(child.parent).toBe(parent)
        expect(parent.children).toContain(child)
    })

    it('单向连接：重复连接不重复入列', () => {
        const parent = createSkeletonJoint('parent')
        const child = createSkeletonJoint('child')
        connectJoint(parent, child)
        connectJoint(parent, child)
        expect(parent.children).toHaveLength(1)
    })

    it('单向连接：已有父关节时重连会先断开旧连接', () => {
        const p1 = createSkeletonJoint('p1')
        const p2 = createSkeletonJoint('p2')
        const child = createSkeletonJoint('child')
        connectJoint(p1, child)
        connectJoint(p2, child)
        expect(child.parent).toBe(p2)
        expect(p1.children).toHaveLength(0)
        expect(p2.children).toContain(child)
    })

    it('禁止自环：不能连接自身', () => {
        const a = createSkeletonJoint('a')
        expect(() => connectJoint(a, a)).toThrow()
    })

    it('禁止自环：不能连接自身祖先', () => {
        const a = createSkeletonJoint('a')
        const b = createSkeletonJoint('b')
        const c = createSkeletonJoint('c')
        connectJoint(a, b)
        connectJoint(b, c)
        expect(() => connectJoint(a, c)).toThrow()
    })

    it('断开：从父 children 移除，自身 parent 置 undefined', () => {
        const parent = createSkeletonJoint('parent')
        const child = createSkeletonJoint('child')
        connectJoint(parent, child)
        disconnectJoint(child)
        expect(child.parent).toBeUndefined()
        expect(parent.children).toHaveLength(0)
    })

    it('断开：无父关节时为空操作', () => {
        const a = createSkeletonJoint('a')
        expect(() => disconnectJoint(a)).not.toThrow()
        expect(a.parent).toBeUndefined()
    })

    it('ikRootLevel 读写', () => {
        const a = createSkeletonJoint('a')
        a.ikRootLevel = 1
        expect(a.ikRootLevel).toBe(1)
        a.ikRootLevel = undefined
        expect(a.ikRootLevel).toBeUndefined()
    })
})