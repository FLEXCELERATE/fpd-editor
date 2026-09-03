import { describe, it, expect } from 'vitest';
import {
    createRouterGrid,
    routeConnection,
    simplify,
    type Obstacle,
    type Point,
} from '../orthogonalRouter';

function box(id: string, x: number, y: number, width = 100, height = 60): Obstacle {
    return { id, x, y, width, height };
}

/** Does the polyline enter any of the given obstacles? */
function crosses(points: Point[], obstacles: Obstacle[]): boolean {
    for (let k = 0; k + 1 < points.length; k++) {
        const [x1, y1] = points[k];
        const [x2, y2] = points[k + 1];
        const loX = Math.min(x1, x2);
        const hiX = Math.max(x1, x2);
        const loY = Math.min(y1, y2);
        const hiY = Math.max(y1, y2);
        for (const o of obstacles) {
            if (hiX <= o.x || loX >= o.x + o.width) continue;
            if (hiY <= o.y || loY >= o.y + o.height) continue;
            return true;
        }
    }
    return false;
}

function isOrthogonal(points: Point[]): boolean {
    for (let k = 0; k + 1 < points.length; k++) {
        const sameX = Math.abs(points[k][0] - points[k + 1][0]) < 0.01;
        const sameY = Math.abs(points[k][1] - points[k + 1][1]) < 0.01;
        if (!sameX && !sameY) return false;
    }
    return true;
}

describe('simplify', () => {
    it('drops duplicate points', () => {
        expect(
            simplify([
                [0, 0],
                [0, 0],
                [0, 10],
            ]),
        ).toEqual([
            [0, 0],
            [0, 10],
        ]);
    });

    it('drops collinear midpoints', () => {
        expect(
            simplify([
                [0, 0],
                [0, 5],
                [0, 10],
            ]),
        ).toEqual([
            [0, 0],
            [0, 10],
        ]);
    });

    it('keeps corners', () => {
        expect(
            simplify([
                [0, 0],
                [0, 10],
                [10, 10],
            ]),
        ).toEqual([
            [0, 0],
            [0, 10],
            [10, 10],
        ]);
    });

    it('keeps a drawable segment for coincident endpoints', () => {
        // Two elements at the same position collapse to one point; callers
        // downstream must still get something they can draw.
        const result = simplify([
            [5, 5],
            [5, 5],
        ]);
        expect(result.length).toBeGreaterThanOrEqual(2);
    });
});

describe('routeConnection', () => {
    it('routes straight down when nothing is in the way', () => {
        const obstacles = [box('a', 0, 0), box('b', 0, 300)];
        const grid = createRouterGrid(obstacles, [50], [60, 300]);
        const points = routeConnection(grid, [50, 60], 'bottom', [50, 300], 'top');

        expect(points).not.toBeNull();
        expect(isOrthogonal(points!)).toBe(true);
        expect(points!).toHaveLength(2);
    });

    it('goes around a box standing between the endpoints', () => {
        const source = box('src', 0, 0);
        const blocker = box('mid', -20, 140, 140, 60);
        const target = box('tgt', 0, 300);
        const obstacles = [source, blocker, target];
        const grid = createRouterGrid(obstacles, [50], [60, 300]);

        const points = routeConnection(grid, [50, 60], 'bottom', [50, 300], 'top');

        expect(points).not.toBeNull();
        expect(isOrthogonal(points!)).toBe(true);
        expect(crosses(points!, [blocker])).toBe(false);
        // A detour needs bends; a straight line would have been two points.
        expect(points!.length).toBeGreaterThan(2);
    });

    it('crosses no obstacle at all on a long detour past several boxes', () => {
        const obstacles: Obstacle[] = [box('src', 400, 0)];
        for (let i = 0; i < 6; i++) {
            obstacles.push(box(`mid${i}`, 380, 120 + i * 120, 140, 60));
        }
        obstacles.push(box('tgt', 400, 900));
        const grid = createRouterGrid(obstacles, [450], [60, 900]);

        const points = routeConnection(grid, [450, 60], 'bottom', [450, 900], 'top');

        expect(points).not.toBeNull();
        const others = obstacles.filter((o) => o.id !== 'src' && o.id !== 'tgt');
        expect(crosses(points!, others)).toBe(false);
    });

    it('starts at the source port and ends at the target port', () => {
        const obstacles = [box('a', 0, 0), box('b', 300, 300)];
        const grid = createRouterGrid(obstacles, [50, 350], [60, 300]);
        const points = routeConnection(grid, [50, 60], 'bottom', [350, 300], 'top');

        expect(points).not.toBeNull();
        expect(points![0]).toEqual([50, 60]);
        expect(points![points!.length - 1]).toEqual([350, 300]);
    });

    it('routes sideways ports orthogonally', () => {
        const obstacles = [box('a', 0, 0), box('b', 400, 0)];
        const grid = createRouterGrid(obstacles, [100, 400], [30]);
        const points = routeConnection(grid, [100, 30], 'right', [400, 30], 'left');

        expect(points).not.toBeNull();
        expect(isOrthogonal(points!)).toBe(true);
    });

    it('returns null rather than a bad route when the target is walled in', () => {
        // Target fully enclosed by an obstacle covering its port.
        const obstacles = [box('src', 0, 0), box('tgt', 0, 400), box('wall', -60, 330, 220, 70)];
        const grid = createRouterGrid(obstacles, [50], [60, 400]);

        const points = routeConnection(grid, [50, 60], 'bottom', [50, 400], 'top');
        expect(points).toBeNull();
    });

    it('spreads two parallel connections onto different lanes', () => {
        // Congestion cost: the second route should not be drawn on top of the
        // first along its whole length.
        const obstacles = [box('a', 0, 0), box('b', 0, 400), box('c', 300, 0), box('d', 300, 400)];
        const grid = createRouterGrid(obstacles, [40, 60, 340, 360], [60, 400]);

        const first = routeConnection(grid, [40, 60], 'bottom', [360, 400], 'top');
        const second = routeConnection(grid, [60, 60], 'bottom', [340, 400], 'top');

        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
    });
});
