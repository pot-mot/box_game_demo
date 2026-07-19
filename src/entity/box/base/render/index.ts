import type {BufferGeometry} from 'three'
import {EdgesGeometry, LineBasicMaterial, LineSegments} from 'three'

export const makeEdgeLines = (geo: BufferGeometry, color: number): LineSegments => {
    const e = new EdgesGeometry(geo)
    return new LineSegments(e, new LineBasicMaterial({color}))
}
