import { describe, it, expect } from 'vitest';
import { computeLayout, DiagramLayout } from '../layout';
import { computeRouting, collectObstacles } from '../routing';
import type { Obstacle } from '../orthogonalRouter';
import { createProcessModel, ProcessModel } from '../../models/processModel';
import { State, ProcessOperator, Flow } from '../../models/fpdModel';

/**
 * Overlap gates for the drawing.
 *
 * The layout has to keep three kinds of things apart: element bodies, the label
 * blocks that hang off states, and the connections between them. Every one of
 * these was violated at some point — labels three times wider than the shape the
 * layout reserved space for, and edges routed straight through whatever lay
 * between their endpoints — and both regressed silently because nothing measured
 * it. These tests are that measurement.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildModel(setup: (m: ProcessModel) => void): ProcessModel {
    const m = createProcessModel();
    setup(m);
    return m;
}

function makeState(id: string, label?: string, opts: Partial<State> = {}): State {
    return {
        id,
        stateType: 'product',
        identification: { uniqueIdent: id },
        label: label ?? id,
        ...opts,
    };
}

function makePO(id: string, label?: string): ProcessOperator {
    return { id, identification: { uniqueIdent: id }, label: label ?? id };
}

function makeFlow(sourceRef: string, targetRef: string): Flow {
    return {
        id: `flow_${sourceRef}_${targetRef}`,
        sourceRef,
        targetRef,
        flowType: 'flow',
    };
}

function findElement(layout: DiagramLayout, id: string) {
    const el = layout.elements.find((e) => e.id === id);
    if (!el) throw new Error(`Element '${id}' not found in layout`);
    return el;
}

/** The element an obstacle belongs to — a label block shares its state's id. */
function ownerOf(obstacle: Obstacle): string {
    return obstacle.id.split('::')[0];
}

function overlapArea(a: Obstacle, b: Obstacle): number {
    const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return ox > 0.5 && oy > 0.5 ? ox * oy : 0;
}

/** Nothing in the drawing may sit on top of anything belonging to another element. */
function findOverlaps(layout: DiagramLayout): string[] {
    const obstacles = collectObstacles(layout.elements);
    const hits: string[] = [];
    for (let i = 0; i < obstacles.length; i++) {
        for (let j = i + 1; j < obstacles.length; j++) {
            if (ownerOf(obstacles[i]) === ownerOf(obstacles[j])) continue;
            if (overlapArea(obstacles[i], obstacles[j]) > 0) {
                hits.push(`${obstacles[i].id} <> ${obstacles[j].id}`);
            }
        }
    }
    return hits;
}

/** No connection may be drawn across an element or label it does not belong to. */
function findCrossings(layout: DiagramLayout): string[] {
    const obstacles = collectObstacles(layout.elements);
    const routed = computeRouting(layout.elements, layout.connections);
    const hits: string[] = [];

    for (const route of routed) {
        // Alternative flows are straight lines by definition of the notation.
        if (route.isDirect) continue;
        // The endpoints' own bodies are touched by definition; label blocks are
        // never allowed, not even the endpoints' own.
        const own = new Set([route.conn.sourceId, route.conn.targetId]);

        for (let k = 0; k + 1 < route.points.length; k++) {
            const [x1, y1] = route.points[k];
            const [x2, y2] = route.points[k + 1];
            const loX = Math.min(x1, x2);
            const hiX = Math.max(x1, x2);
            const loY = Math.min(y1, y2);
            const hiY = Math.max(y1, y2);

            for (const o of obstacles) {
                if (own.has(o.id)) continue;
                // Strict interior: touching a boundary is not a crossing.
                if (hiX <= o.x || loX >= o.x + o.width) continue;
                if (hiY <= o.y || loY >= o.y + o.height) continue;
                hits.push(`${route.conn.id} through ${o.id}`);
            }
        }
    }
    return hits;
}

function expectClean(layout: DiagramLayout): void {
    expect(findOverlaps(layout)).toEqual([]);
    expect(findCrossings(layout)).toEqual([]);
}

// ---------------------------------------------------------------------------
// Models that used to produce collisions
// ---------------------------------------------------------------------------

/** Wide fan-in: n operators feeding one, each through its own state. */
function fanInModel(n: number, longLabels: boolean): ProcessModel {
    return buildModel((m) => {
        m.processOperators.push(makePO('po_merge', 'Fermentieren'));
        for (let i = 0; i < n; i++) {
            m.processOperators.push(makePO(`po_src${i}`, `Prozessschritt Nummer ${i}`));
            m.states.push(
                makeState(
                    `s_mid${i}`,
                    longLabels ? `Säure / Lauge (dosiert, Zwischenschritt ${i})` : `S${i}`,
                ),
            );
            m.flows.push(makeFlow(`po_src${i}`, `s_mid${i}`));
            m.flows.push(makeFlow(`s_mid${i}`, 'po_merge'));
            // An input that will be classified as a boundary state.
            m.states.push(
                makeState(`s_in${i}`, longLabels ? `Einsatzstoff Nummer ${i} (roh)` : `I${i}`),
            );
            m.flows.push(makeFlow(`s_in${i}`, `po_src${i}`));
        }
        m.states.push(makeState('s_out', 'Fermentationsbrühe (unbehandelt)'));
        m.flows.push(makeFlow('po_merge', 's_out'));
    });
}

/** A long chain with an edge that skips most of it. */
function skipChainModel(length: number): ProcessModel {
    return buildModel((m) => {
        for (let i = 0; i < length; i++) {
            m.processOperators.push(makePO(`po${i}`, `Schritt ${i}`));
        }
        m.states.push(makeState('s_in', 'Rohstoff (angeliefert)'));
        m.flows.push(makeFlow('s_in', 'po0'));
        for (let i = 0; i + 1 < length; i++) {
            const mid = `s${i}`;
            m.states.push(makeState(mid, `Zwischenprodukt Stufe ${i}`));
            m.flows.push(makeFlow(`po${i}`, mid));
            m.flows.push(makeFlow(mid, `po${i + 1}`));
        }
        // The skip: first operator straight to the last.
        m.states.push(makeState('s_skip', 'Nebenstrom (direkt zur Endstufe)'));
        m.flows.push(makeFlow('po0', 's_skip'));
        m.flows.push(makeFlow('s_skip', `po${length - 1}`));
    });
}

/** Two feedback loops over the same span. */
function feedbackModel(): ProcessModel {
    return buildModel((m) => {
        m.processOperators.push(makePO('po_a', 'Reaktor betreiben'));
        m.processOperators.push(makePO('po_b', 'Produkt abtrennen'));
        m.states.push(makeState('s_fwd', 'Reaktionsgemisch (ausgetragen)'));
        m.flows.push(makeFlow('po_a', 's_fwd'));
        m.flows.push(makeFlow('s_fwd', 'po_b'));
        for (const tag of ['x', 'y']) {
            m.states.push(makeState(`s_back_${tag}`, `Rückführung ${tag} (aufbereitet)`));
            m.flows.push(makeFlow('po_b', `s_back_${tag}`));
            m.flows.push(makeFlow(`s_back_${tag}`, 'po_a'));
        }
    });
}

/**
 * Several operators side by side, each with its own boundary input whose label is
 * wider than the spacing between the operators. The operator row deliberately
 * reserves only the *shape* span of a boundary cluster, so it is the cluster
 * packing that has to keep these labels apart.
 */
function wideBoundaryLabelModel(n: number): ProcessModel {
    return buildModel((m) => {
        m.processOperators.push(makePO('po_merge', 'Zusammenfuehren'));
        for (let i = 0; i < n; i++) {
            m.processOperators.push(makePO(`po${i}`, `Stufe ${i}`));
            m.states.push(
                makeState(
                    `in${i}`,
                    `Einsatzstoff ${i} aus der vorgelagerten Anlage, konditioniert und dosiert`,
                ),
            );
            m.flows.push(makeFlow(`in${i}`, `po${i}`));
            m.states.push(makeState(`mid${i}`, `Zwischenprodukt ${i}`));
            m.flows.push(makeFlow(`po${i}`, `mid${i}`));
            m.flows.push(makeFlow(`mid${i}`, 'po_merge'));
        }
    });
}

describe('drawing collisions', () => {
    it('keeps a narrow fan-in clean', () => {
        expectClean(computeLayout(fanInModel(3, false)));
    });

    it('keeps boundary labels wider than the operator pitch apart', () => {
        expectClean(computeLayout(wideBoundaryLabelModel(5)));
    });

    it('puts a lone boundary input right over its operator', () => {
        // One input per operator, so nothing competes for the space: each state
        // should sit on its operator's centre line rather than off to the side.
        const layout = computeLayout(fanInModel(4, false));
        for (let i = 0; i < 4; i++) {
            const input = findElement(layout, `s_in${i}`);
            const operator = findElement(layout, `po_src${i}`);
            const offset = input.x + input.width / 2 - (operator.x + operator.width / 2);
            expect(Math.abs(offset)).toBeLessThan(12);
        }
    });

    it('deals a wide input cluster across label lanes instead of splaying it sideways', () => {
        // Four inputs to one operator: they cannot fit its width in one row, so
        // they use more than one and stay near the box they feed.
        const model = buildModel((m) => {
            m.processOperators.push(makePO('po', 'Lagern (Kühlen & Rühren)'));
            m.processOperators.push(makePO('po_next', 'Dosieren'));
            for (const name of ['Substrat', 'Harnstoff', 'Spurenelemente', 'Antischaummittel']) {
                m.states.push(makeState(name, `${name} (bereitgestellt)`));
                m.flows.push(makeFlow(name, 'po'));
            }
            m.states.push(makeState('mid', 'Medien (gekühlt, homogenisiert)'));
            m.flows.push(makeFlow('po', 'mid'));
            m.flows.push(makeFlow('mid', 'po_next'));
        });

        const layout = computeLayout(model);
        const inputs = ['Substrat', 'Harnstoff', 'Spurenelemente', 'Antischaummittel'].map((id) =>
            findElement(layout, id),
        );
        const operator = findElement(layout, 'po');

        // All of them stay on the system limit edge — that is what the notation
        // shows — and it is their labels that move into another lane.
        expect(new Set(inputs.map((e) => e.y)).size).toBe(1);
        expect(new Set(inputs.map((e) => e.labelRow ?? 0)).size).toBeGreaterThan(1);
        for (const input of inputs) {
            const offset = input.x + input.width / 2 - (operator.x + operator.width / 2);
            expect(Math.abs(offset)).toBeLessThan(operator.width * 1.5);
        }
        // Distinct x for each, so their drop lines cannot block one another.
        expect(new Set(inputs.map((e) => e.x)).size).toBe(4);
        expectClean(layout);
    });

    it('keeps a wide fan-in with long labels clean', () => {
        // Eight parallel branches whose labels are three times the shape width —
        // the case that made every label in a band overlap its neighbours.
        expectClean(computeLayout(fanInModel(8, true)));
    });

    it('keeps a long chain with a skipping edge clean', () => {
        // The skip used to be drawn straight down through every box between its
        // endpoints.
        expectClean(computeLayout(skipChainModel(8)));
    });

    it('keeps overlapping feedback loops clean', () => {
        expectClean(computeLayout(feedbackModel()));
    });

    it('reserves room above an intermediate band for its labels', () => {
        // The band's label blocks used to reach into the row above, covering the
        // ports of the operators there and leaving edges unable to leave the box.
        const layout = computeLayout(fanInModel(4, true));
        const obstacles = collectObstacles(layout.elements);
        const operators = layout.elements.filter((e) => e.type === 'processOperator');

        for (const po of operators) {
            for (const o of obstacles) {
                if (ownerOf(o) === po.id) continue;
                const coversPortColumn = o.x < po.x + po.width / 2 && o.x + o.width > po.x;
                const touchesBottomEdge =
                    o.y < po.y + po.height + 8 && o.y + o.height > po.y + po.height;
                expect(coversPortColumn && touchesBottomEdge).toBe(false);
            }
        }
    });

    it('scales to a large branching graph without collisions', () => {
        const model = buildModel((m) => {
            m.processOperators.push(makePO('collect', 'Sammeln und verteilen'));
            for (let i = 0; i < 6; i++) {
                m.processOperators.push(makePO(`up${i}`, `Vorstufe ${i}`));
                m.processOperators.push(makePO(`down${i}`, `Nachstufe ${i}`));
                m.states.push(makeState(`u${i}`, `Vorprodukt ${i} (konditioniert)`));
                m.states.push(makeState(`d${i}`, `Nachprodukt ${i} (abgetrennt)`));
                m.flows.push(makeFlow(`up${i}`, `u${i}`));
                m.flows.push(makeFlow(`u${i}`, 'collect'));
                m.flows.push(makeFlow('collect', `d${i}`));
                m.flows.push(makeFlow(`d${i}`, `down${i}`));
            }
        });
        expectClean(computeLayout(model));
    });
});
