import { describe, it, expect } from 'vitest';
import {
    Point,
    RoutedConnection,
    centerOf,
    determineSide,
    portPosition,
    orthogonalWaypoints,
    computeRouting,
    computeContentBounds,
    autoFontSize,
} from '../routing';
import { LayoutElement, LayoutConnection } from '../layout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEl(
    id: string,
    x: number,
    y: number,
    width = 100,
    height = 50,
    opts: Partial<LayoutElement> = {},
): LayoutElement {
    return { id, type: 'processOperator', label: id, x, y, width, height, ...opts };
}

function makeConn(
    sourceId: string,
    targetId: string,
    opts: Partial<LayoutConnection> = {},
): LayoutConnection {
    return { id: `${sourceId}_${targetId}`, sourceId, targetId, isUsage: false, ...opts };
}

function isOnPerimeter(el: LayoutElement, [px, py]: Point): boolean {
    const onVerticalEdge =
        (px === el.x || px === el.x + el.width) && py >= el.y && py <= el.y + el.height;
    const onHorizontalEdge =
        (py === el.y || py === el.y + el.height) && px >= el.x && px <= el.x + el.width;
    return onVerticalEdge || onHorizontalEdge;
}

function expectNoNaN(routed: RoutedConnection[]): void {
    for (const r of routed) {
        for (const [px, py] of r.points) {
            expect(Number.isFinite(px), `${r.conn.id}: x is not finite`).toBe(true);
            expect(Number.isFinite(py), `${r.conn.id}: y is not finite`).toBe(true);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('centerOf', () => {
    it('returns the geometric center of an element', () => {
        expect(centerOf(makeEl('a', 10, 20, 100, 50))).toEqual([60, 45]);
    });
});

describe('determineSide', () => {
    const from = makeEl('from', 0, 0);

    it('returns bottom when the target is below', () => {
        expect(determineSide(from, makeEl('t', 0, 200))).toBe('bottom');
    });

    it('returns top when the target is above', () => {
        expect(determineSide(from, makeEl('t', 0, -200))).toBe('top');
    });

    it('returns right when the target is to the right', () => {
        expect(determineSide(from, makeEl('t', 300, 0))).toBe('right');
    });

    it('returns left when the target is to the left', () => {
        expect(determineSide(from, makeEl('t', -300, 0))).toBe('left');
    });

    it('prefers the vertical axis when displacements are equal', () => {
        // dx === dy => |dy| >= |dx| => vertical side
        expect(determineSide(from, makeEl('t', 100, 100))).toBe('bottom');
    });
});

describe('portPosition', () => {
    const el = makeEl('a', 0, 0, 100, 50);

    it('places a single port at the middle of each side', () => {
        expect(portPosition(el, 'top', 0, 1)).toEqual([50, 0]);
        expect(portPosition(el, 'bottom', 0, 1)).toEqual([50, 50]);
        expect(portPosition(el, 'left', 0, 1)).toEqual([0, 25]);
        expect(portPosition(el, 'right', 0, 1)).toEqual([100, 25]);
    });

    it('spreads multiple ports evenly along a side', () => {
        expect(portPosition(el, 'top', 0, 3)).toEqual([25, 0]);
        expect(portPosition(el, 'top', 1, 3)).toEqual([50, 0]);
        expect(portPosition(el, 'top', 2, 3)).toEqual([75, 0]);
    });

    it('always yields points on the element perimeter', () => {
        for (const side of ['top', 'bottom', 'left', 'right']) {
            for (let i = 0; i < 4; i++) {
                const p = portPosition(el, side, i, 4);
                expect(isOnPerimeter(el, p), `${side} port ${i}`).toBe(true);
            }
        }
    });
});

describe('orthogonalWaypoints', () => {
    it('returns a straight segment for vertically aligned ports', () => {
        const pts = orthogonalWaypoints([50, 0], [50, 100], 'bottom', 'top');
        expect(pts).toEqual([
            [50, 0],
            [50, 100],
        ]);
    });

    it('returns a Z-shape with a horizontal middle segment for offset vertical ports', () => {
        const pts = orthogonalWaypoints([0, 0], [100, 100], 'bottom', 'top');
        expect(pts).toHaveLength(4);
        expect(pts[0]).toEqual([0, 0]);
        expect(pts[3]).toEqual([100, 100]);
        // Middle segment is horizontal at the vertical midpoint
        expect(pts[1][1]).toBe(pts[2][1]);
        expect(pts[1][0]).toBe(0);
        expect(pts[2][0]).toBe(100);
    });

    it('returns a straight segment for horizontally aligned ports', () => {
        const pts = orthogonalWaypoints([0, 25], [200, 25], 'right', 'left');
        expect(pts).toEqual([
            [0, 25],
            [200, 25],
        ]);
    });

    it('returns a Z-shape with a vertical middle segment for offset horizontal ports', () => {
        const pts = orthogonalWaypoints([0, 0], [200, 80], 'right', 'left');
        expect(pts).toHaveLength(4);
        expect(pts[1][0]).toBe(pts[2][0]);
        expect(pts[1][1]).toBe(0);
        expect(pts[2][1]).toBe(80);
    });

    it('returns an L-shape for mixed vertical/horizontal sides', () => {
        // Vertical source side: elbow directly below the source
        const fromVertical = orthogonalWaypoints([50, 0], [200, 100], 'bottom', 'left');
        expect(fromVertical).toEqual([
            [50, 0],
            [50, 100],
            [200, 100],
        ]);

        // Horizontal source side: elbow directly beside the source
        const fromHorizontal = orthogonalWaypoints([100, 25], [200, 200], 'right', 'top');
        expect(fromHorizontal).toEqual([
            [100, 25],
            [200, 25],
            [200, 200],
        ]);
    });

    it('every consecutive segment is axis-aligned', () => {
        const cases: [Point, Point, string, string][] = [
            [[0, 0], [100, 100], 'bottom', 'top'],
            [[0, 0], [200, 80], 'right', 'left'],
            [[50, 0], [200, 100], 'bottom', 'left'],
            [[100, 25], [200, 200], 'right', 'top'],
        ];
        for (const [src, tgt, sSide, tSide] of cases) {
            const pts = orthogonalWaypoints(src, tgt, sSide, tSide);
            for (let i = 1; i < pts.length; i++) {
                const horizontal = pts[i - 1][1] === pts[i][1];
                const vertical = pts[i - 1][0] === pts[i][0];
                expect(horizontal || vertical).toBe(true);
            }
        }
    });
});

describe('computeRouting', () => {
    it('routes a vertical connection from the source bottom edge to the target top edge', () => {
        const source = makeEl('s', 100, 0, 55, 50);
        const target = makeEl('po', 50, 200, 150, 80);
        const routed = computeRouting([source, target], [makeConn('s', 'po')]);

        expect(routed).toHaveLength(1);
        const { points } = routed[0];
        expect(points.length).toBeGreaterThanOrEqual(2);

        const start = points[0];
        const end = points[points.length - 1];

        // Start on the source bottom edge
        expect(start[1]).toBe(source.y + source.height);
        expect(start[0]).toBeGreaterThanOrEqual(source.x);
        expect(start[0]).toBeLessThanOrEqual(source.x + source.width);

        // End on the target top edge
        expect(end[1]).toBe(target.y);
        expect(end[0]).toBeGreaterThanOrEqual(target.x);
        expect(end[0]).toBeLessThanOrEqual(target.x + target.width);
    });

    it('starts and ends every routed polyline on the element perimeters', () => {
        const a = makeEl('a', 0, 0);
        const b = makeEl('b', 300, 0);
        const c = makeEl('c', 150, 200);
        const routed = computeRouting(
            [a, b, c],
            [makeConn('a', 'b'), makeConn('a', 'c'), makeConn('b', 'c')],
        );

        expect(routed).toHaveLength(3);
        const lookup: Record<string, LayoutElement> = { a, b, c };
        for (const r of routed) {
            const src = lookup[r.conn.sourceId];
            const tgt = lookup[r.conn.targetId];
            expect(isOnPerimeter(src, r.points[0]), `${r.conn.id} start`).toBe(true);
            expect(isOnPerimeter(tgt, r.points[r.points.length - 1]), `${r.conn.id} end`).toBe(
                true,
            );
        }
    });

    it('respects explicit sourceSide/targetSide hints', () => {
        const a = makeEl('a', 0, 0);
        const b = makeEl('b', 0, 200);
        const routed = computeRouting(
            [a, b],
            [makeConn('a', 'b', { sourceSide: 'right', targetSide: 'left' })],
        );

        const { points } = routed[0];
        expect(points[0][0]).toBe(a.x + a.width); // starts on right edge
        expect(points[points.length - 1][0]).toBe(b.x); // ends on left edge
    });

    it('routes alternative flows as direct straight lines (two points)', () => {
        const a = makeEl('a', 0, 0);
        const b = makeEl('b', 300, 200);
        const routed = computeRouting(
            [a, b],
            [makeConn('a', 'b', { flowType: 'alternativeFlow' })],
        );

        expect(routed).toHaveLength(1);
        expect(routed[0].isDirect).toBe(true);
        expect(routed[0].points).toHaveLength(2);
    });

    it('routes regular flows orthogonally (isDirect false)', () => {
        const a = makeEl('a', 0, 0);
        const b = makeEl('b', 300, 200);
        const routed = computeRouting([a, b], [makeConn('a', 'b')]);

        expect(routed[0].isDirect).toBe(false);
        // Every segment of a non-direct route is axis-aligned
        const pts = routed[0].points;
        for (let i = 1; i < pts.length; i++) {
            expect(pts[i - 1][0] === pts[i][0] || pts[i - 1][1] === pts[i][1]).toBe(true);
        }
    });

    it('skips connections whose source or target does not exist', () => {
        const a = makeEl('a', 0, 0);
        const routed = computeRouting(
            [a],
            [makeConn('a', 'missing'), makeConn('missing', 'a'), makeConn('x', 'y')],
        );
        expect(routed).toHaveLength(0);
    });

    it('assigns distinct ports when multiple connections share an element side', () => {
        const left = makeEl('left', 0, 0);
        const right = makeEl('right', 400, 0);
        const target = makeEl('target', 200, 300);
        const routed = computeRouting(
            [left, right, target],
            [makeConn('left', 'target'), makeConn('right', 'target')],
        );

        expect(routed).toHaveLength(2);
        const end1 = routed[0].points[routed[0].points.length - 1];
        const end2 = routed[1].points[routed[1].points.length - 1];
        // Both end on the target top edge but at different ports
        expect(end1[1]).toBe(target.y);
        expect(end2[1]).toBe(target.y);
        expect(end1[0]).not.toBe(end2[0]);
    });

    it('sorts ports by the position of the connected element', () => {
        const left = makeEl('left', 0, 0);
        const right = makeEl('right', 400, 0);
        const target = makeEl('target', 200, 300);
        const routed = computeRouting(
            [left, right, target],
            [makeConn('left', 'target'), makeConn('right', 'target')],
        );

        const endFor = (id: string) => {
            const r = routed.find((x) => x.conn.sourceId === id)!;
            return r.points[r.points.length - 1];
        };
        // The connection coming from the left element gets the leftmost port
        expect(endFor('left')[0]).toBeLessThan(endFor('right')[0]);
    });

    it('produces no NaN coordinates for fully overlapping elements', () => {
        const a = makeEl('a', 100, 100);
        const b = makeEl('b', 100, 100); // exact same geometry
        const routed = computeRouting([a, b], [makeConn('a', 'b')]);

        expect(routed).toHaveLength(1);
        expect(routed[0].points.length).toBeGreaterThanOrEqual(2);
        expectNoNaN(routed);
    });

    it('produces no NaN coordinates for zero-size elements', () => {
        const a = makeEl('a', 0, 0, 0, 0);
        const b = makeEl('b', 100, 100, 0, 0);
        const routed = computeRouting([a, b], [makeConn('a', 'b')]);
        expectNoNaN(routed);
    });

    it('routes collinear horizontally-aligned elements as a straight line', () => {
        const a = makeEl('a', 0, 0, 100, 50);
        const b = makeEl('b', 300, 0, 100, 50); // same y and height
        const routed = computeRouting([a, b], [makeConn('a', 'b')]);

        const { points } = routed[0];
        // Single port on each facing side at equal height -> straight segment
        expect(points).toHaveLength(2);
        expect(points[0][1]).toBe(points[1][1]);
        expect(points[0][0]).toBe(a.x + a.width);
        expect(points[1][0]).toBe(b.x);
    });

    it('is stable and NaN-free for a dense mixed scenario', () => {
        const elements: LayoutElement[] = [];
        const connections: LayoutConnection[] = [];
        for (let i = 0; i < 5; i++) {
            elements.push(makeEl(`po${i}`, 100 * (i % 3), 150 * i));
            elements.push(makeEl(`s${i}`, 100 * (i % 3) + 20, 150 * i + 100, 55, 50));
            connections.push(makeConn(`po${i}`, `s${i}`));
            if (i > 0) {
                connections.push(makeConn(`s${i - 1}`, `po${i}`));
                connections.push(makeConn(`po${i - 1}`, `po${i}`, { flowType: 'alternativeFlow' }));
            }
        }

        const first = computeRouting(elements, connections);
        const second = computeRouting(elements, connections);

        expect(first).toHaveLength(connections.length);
        expectNoNaN(first);
        // Deterministic: identical output for identical input
        expect(second.map((r) => r.points)).toEqual(first.map((r) => r.points));
    });
});

describe('computeContentBounds', () => {
    it('returns the default canvas for empty input', () => {
        expect(computeContentBounds([], [])).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    });

    it('encloses all element geometry with a margin', () => {
        const elements = [makeEl('po1', 100, 100, 150, 80), makeEl('po2', 400, 300, 150, 80)];
        const b = computeContentBounds(elements, []);

        for (const el of elements) {
            expect(b.x).toBeLessThan(el.x);
            expect(b.y).toBeLessThan(el.y);
            expect(b.x + b.width).toBeGreaterThan(el.x + el.width);
            expect(b.y + b.height).toBeGreaterThan(el.y + el.height);
        }
    });

    it('expands leftwards for states with long labels', () => {
        const short = computeContentBounds(
            [makeEl('s', 100, 100, 55, 50, { type: 'state', label: 's' })],
            [],
        );
        const long = computeContentBounds(
            [
                makeEl('s', 100, 100, 55, 50, {
                    type: 'state',
                    label: 'a_very_long_state_label_indeed',
                }),
            ],
            [],
        );
        expect(long.x).toBeLessThan(short.x);
    });

    it('reserves space on the right for system limit labels', () => {
        const sl = { id: 'sys', x: 0, y: 0, width: 300, height: 200 };
        const without = computeContentBounds([], [{ ...sl, label: '' }]);
        const withLabel = computeContentBounds([], [{ ...sl, label: 'A rather long system name' }]);
        expect(withLabel.x + withLabel.width).toBeGreaterThan(without.x + without.width);
    });

    it('encloses system limits including headroom above for the label', () => {
        const sl = { id: 'sys', label: 'Sys', x: 50, y: 50, width: 300, height: 200 };
        const b = computeContentBounds([], [sl]);
        expect(b.x).toBeLessThan(sl.x);
        expect(b.y).toBeLessThan(sl.y);
        expect(b.x + b.width).toBeGreaterThan(sl.x + sl.width);
        expect(b.y + b.height).toBeGreaterThan(sl.y + sl.height);
    });

    it('returns only finite values', () => {
        const b = computeContentBounds(
            [makeEl('a', -500, -500), makeEl('b', 1000, 1000)],
            [{ id: 'sys', label: 'S', x: -600, y: -600, width: 2000, height: 2000 }],
        );
        for (const v of [b.x, b.y, b.width, b.height]) {
            expect(Number.isFinite(v)).toBe(true);
        }
        expect(b.width).toBeGreaterThan(0);
        expect(b.height).toBeGreaterThan(0);
    });
});

describe('autoFontSize', () => {
    it('returns the default size when the text fits', () => {
        expect(autoFontSize(['ab'], 200, 14)).toBe(14);
    });

    it('shrinks the size when the text is too wide', () => {
        const size = autoFontSize(['a'.repeat(40)], 100, 14);
        expect(size).toBeLessThan(14);
        expect(size).toBeGreaterThanOrEqual(7);
    });

    it('never goes below the minimum size', () => {
        expect(autoFontSize(['a'.repeat(1000)], 100, 14, 7)).toBe(7);
    });

    it('uses the longest line to decide', () => {
        const short = autoFontSize(['ab'], 100, 14);
        const mixed = autoFontSize(['ab', 'a'.repeat(40)], 100, 14);
        expect(short).toBe(14);
        expect(mixed).toBeLessThan(14);
    });

    it('returns the default size for empty lines', () => {
        expect(autoFontSize([''], 100, 14)).toBe(14);
        expect(autoFontSize([], 100, 14)).toBe(14);
    });
});

// ---------------------------------------------------------------------------
// Flow kinds are told apart by their routing, not by colour
// ---------------------------------------------------------------------------

describe('shared ports for parallel and alternative flows', () => {
    /** Where a connection meets `elementId`. */
    function portOn(routed: RoutedConnection[], connId: string, atSource: boolean): Point {
        const route = routed.find((r) => r.conn.id === connId)!;
        return atSource ? route.points[0] : route.points[route.points.length - 1];
    }

    it('merges parallel flows into a single port on the shared element', () => {
        const a = makeEl('a', 0, 0);
        const b = makeEl('b', 200, 0);
        const merge = makeEl('merge', 100, 300);
        const routed = computeRouting(
            [a, b, merge],
            [
                makeConn('a', 'merge', { flowType: 'parallelFlow' }),
                makeConn('b', 'merge', { flowType: 'parallelFlow' }),
            ],
        );

        expect(portOn(routed, 'a_merge', false)).toEqual(portOn(routed, 'b_merge', false));
    });

    it('branches alternative flows from a single port on the shared element', () => {
        const src = makeEl('src', 100, 0);
        const t1 = makeEl('t1', 0, 300);
        const t2 = makeEl('t2', 200, 300);
        const routed = computeRouting(
            [src, t1, t2],
            [
                makeConn('src', 't1', { flowType: 'alternativeFlow' }),
                makeConn('src', 't2', { flowType: 'alternativeFlow' }),
            ],
        );

        expect(portOn(routed, 'src_t1', true)).toEqual(portOn(routed, 'src_t2', true));
    });

    it('gives plain flows their own port on the same element', () => {
        const a = makeEl('a', 0, 0);
        const b = makeEl('b', 200, 0);
        const merge = makeEl('merge', 100, 300);
        const routed = computeRouting(
            [a, b, merge],
            [makeConn('a', 'merge'), makeConn('b', 'merge')],
        );

        expect(portOn(routed, 'a_merge', false)).not.toEqual(portOn(routed, 'b_merge', false));
    });

    it('keeps a plain flow out of a parallel bundle on the same element', () => {
        const a = makeEl('a', 0, 0);
        const b = makeEl('b', 200, 0);
        const c = makeEl('c', 400, 0);
        const merge = makeEl('merge', 200, 300);
        const routed = computeRouting(
            [a, b, c, merge],
            [
                makeConn('a', 'merge', { flowType: 'parallelFlow' }),
                makeConn('b', 'merge', { flowType: 'parallelFlow' }),
                makeConn('c', 'merge'),
            ],
        );

        const bundled = portOn(routed, 'a_merge', false);
        expect(portOn(routed, 'b_merge', false)).toEqual(bundled);
        expect(portOn(routed, 'c_merge', false)).not.toEqual(bundled);
    });

    it('draws an alternative flow as a straight line and a parallel one angled', () => {
        const src = makeEl('src', 100, 0);
        const alt = makeEl('alt', 0, 300);
        const par = makeEl('par', 300, 300);
        const routed = computeRouting(
            [src, alt, par],
            [
                makeConn('src', 'alt', { flowType: 'alternativeFlow' }),
                makeConn('src', 'par', { flowType: 'parallelFlow' }),
            ],
        );

        const straight = routed.find((r) => r.conn.id === 'src_alt')!;
        expect(straight.isDirect).toBe(true);
        expect(straight.points).toHaveLength(2);

        const angled = routed.find((r) => r.conn.id === 'src_par')!;
        expect(angled.isDirect).toBe(false);
        // An angled route needs a bend, so more than the two endpoints.
        expect(angled.points.length).toBeGreaterThan(2);
    });
});

describe('bundled flows agree on a side', () => {
    it('shares one port even when the geometry suggests different sides', () => {
        // 'above' sits over the merge point, 'beside' next to it. Deciding the
        // side per flow would put one on 'top' and the other on 'right', leaving
        // them in different port groups and unable to share a point.
        const above = makeEl('above', 0, 0);
        const beside = makeEl('beside', 500, 380);
        const merge = makeEl('merge', 0, 400);

        const routed = computeRouting(
            [above, beside, merge],
            [
                makeConn('above', 'merge', { flowType: 'parallelFlow' }),
                makeConn('beside', 'merge', { flowType: 'parallelFlow' }),
            ],
        );

        const endOf = (id: string) => {
            const r = routed.find((x) => x.conn.id === id)!;
            return r.points[r.points.length - 1];
        };
        expect(endOf('above_merge')).toEqual(endOf('beside_merge'));
    });

    it('leaves an explicitly given side alone', () => {
        const a = makeEl('a', 0, 0);
        const b = makeEl('b', 200, 0);
        const merge = makeEl('merge', 100, 300);
        const routed = computeRouting(
            [a, b, merge],
            [
                makeConn('a', 'merge', { flowType: 'parallelFlow', targetSide: 'left' }),
                makeConn('b', 'merge', { flowType: 'parallelFlow' }),
            ],
        );

        const endOf = (id: string) => {
            const r = routed.find((x) => x.conn.id === id)!;
            return r.points[r.points.length - 1];
        };
        // The pinned one keeps the left edge; the other is not dragged onto it.
        expect(endOf('a_merge')[0]).toBe(merge.x);
        expect(endOf('b_merge')).not.toEqual(endOf('a_merge'));
    });

    it('does not bundle plain flows onto a common side', () => {
        const above = makeEl('above', 0, 0);
        const beside = makeEl('beside', 500, 380);
        const merge = makeEl('merge', 0, 400);
        const routed = computeRouting(
            [above, beside, merge],
            [makeConn('above', 'merge'), makeConn('beside', 'merge')],
        );

        const endOf = (id: string) => {
            const r = routed.find((x) => x.conn.id === id)!;
            return r.points[r.points.length - 1];
        };
        expect(endOf('above_merge')).not.toEqual(endOf('beside_merge'));
    });
});
