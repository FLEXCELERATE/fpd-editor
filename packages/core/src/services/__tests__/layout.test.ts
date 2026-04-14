import { describe, it, expect } from 'vitest';
import { computeLayout, createLayoutConfig, DiagramLayout, LayoutElement, LayoutConnection } from '../layout';
import { createProcessModel, ProcessModel } from '../../models/processModel';
import { State, ProcessOperator, TechnicalResource, Flow, Usage } from '../../models/fpdModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(id: string, stateType: 'product' | 'energy' | 'information' = 'product', opts: Partial<State> = {}): State {
    return {
        id,
        stateType,
        identification: { uniqueIdent: id },
        label: id,
        ...opts,
    };
}

function makePO(id: string, opts: Partial<ProcessOperator> = {}): ProcessOperator {
    return {
        id,
        identification: { uniqueIdent: id },
        label: id,
        ...opts,
    };
}

function makeTR(id: string, opts: Partial<TechnicalResource> = {}): TechnicalResource {
    return {
        id,
        identification: { uniqueIdent: id },
        label: id,
        ...opts,
    };
}

function makeFlow(sourceRef: string, targetRef: string, opts: Partial<Flow> = {}): Flow {
    return {
        id: `flow_${sourceRef}_${targetRef}`,
        sourceRef,
        targetRef,
        flowType: 'flow',
        ...opts,
    };
}

function makeUsage(poRef: string, trRef: string, opts: Partial<Usage> = {}): Usage {
    return {
        id: `usage_${poRef}_${trRef}`,
        processOperatorRef: poRef,
        technicalResourceRef: trRef,
        ...opts,
    };
}

function buildModel(setup: (m: ProcessModel) => void): ProcessModel {
    const m = createProcessModel();
    setup(m);
    return m;
}

function findElement(layout: DiagramLayout, id: string): LayoutElement {
    const el = layout.elements.find(e => e.id === id);
    if (!el) throw new Error(`Element '${id}' not found in layout`);
    return el;
}

function findConnection(layout: DiagramLayout, sourceId: string, targetId: string): LayoutConnection {
    const conn = layout.connections.find(c => c.sourceId === sourceId && c.targetId === targetId);
    if (!conn) throw new Error(`Connection ${sourceId} -> ${targetId} not found`);
    return conn;
}

function centerX(el: LayoutElement): number {
    return el.x + el.width / 2;
}

function centerY(el: LayoutElement): number {
    return el.y + el.height / 2;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeLayout', () => {
    // -----------------------------------------------------------------------
    // 1. Empty / minimal models
    // -----------------------------------------------------------------------

    describe('empty and minimal models', () => {
        it('returns empty layout for an empty model', () => {
            const model = createProcessModel();
            const layout = computeLayout(model);

            expect(layout.elements).toHaveLength(0);
            expect(layout.connections).toHaveLength(0);
            expect(layout.systemLimits).toHaveLength(0);
            expect(layout.systemLimit).toBeNull();
        });

        it('returns a single PO element when model has only one PO', () => {
            const model = buildModel(m => {
                m.processOperators.push(makePO('po1'));
            });
            const layout = computeLayout(model);

            expect(layout.elements).toHaveLength(1);
            const po = findElement(layout, 'po1');
            expect(po.type).toBe('processOperator');
            expect(po.width).toBe(150);
            expect(po.height).toBe(80);
        });

        it('returns a single state element when model has only one state', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
            });
            const layout = computeLayout(model);

            expect(layout.elements).toHaveLength(1);
            const s = findElement(layout, 's1');
            expect(s.type).toBe('state');
            expect(s.stateType).toBe('product');
        });
    });

    // -----------------------------------------------------------------------
    // 2. Linear chain: State -> PO -> State
    // -----------------------------------------------------------------------

    describe('linear chain (input -> PO -> output)', () => {
        function linearModel(): ProcessModel {
            return buildModel(m => {
                m.states.push(makeState('input'));
                m.states.push(makeState('output'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('input', 'po1'));
                m.flows.push(makeFlow('po1', 'output'));
            });
        }

        it('places all three elements', () => {
            const layout = computeLayout(linearModel());
            expect(layout.elements).toHaveLength(3);
            expect(layout.elements.map(e => e.id).sort()).toEqual(['input', 'output', 'po1']);
        });

        it('creates flow connections for all flows in the model', () => {
            const layout = computeLayout(linearModel());
            const flowConns = layout.connections.filter(c => !c.isUsage);
            expect(flowConns.length).toBeGreaterThanOrEqual(2);

            const c1 = findConnection(layout, 'input', 'po1');
            expect(c1.isUsage).toBe(false);
            expect(c1.flowType).toBe('flow');

            const c2 = findConnection(layout, 'po1', 'output');
            expect(c2.isUsage).toBe(false);
        });

        it('classifies input as boundary-top and output as boundary-bottom', () => {
            const layout = computeLayout(linearModel());
            const input = findElement(layout, 'input');
            const output = findElement(layout, 'output');
            const po = findElement(layout, 'po1');

            // Input (pure source) should be above PO
            expect(input.y).toBeLessThan(po.y);
            // Output (pure sink) should be below PO
            expect(output.y).toBeGreaterThan(po.y);
        });

        it('creates a system limit that encompasses all elements', () => {
            const layout = computeLayout(linearModel());
            expect(layout.systemLimits.length).toBeGreaterThanOrEqual(1);

            const sl = layout.systemLimits[0];
            for (const el of layout.elements) {
                // Each element center should be within or on the system limit boundary
                const cx = centerX(el);
                const cy = centerY(el);
                // Boundary states sit on the edge (half inside, half outside),
                // so just check they're close
                expect(cx).toBeGreaterThanOrEqual(sl.x - el.width);
                expect(cy).toBeGreaterThanOrEqual(sl.y - el.height);
                expect(cx).toBeLessThanOrEqual(sl.x + sl.width + el.width);
                expect(cy).toBeLessThanOrEqual(sl.y + sl.height + el.height);
            }
        });
    });

    // -----------------------------------------------------------------------
    // 3. Topological sort with multiple POs
    // -----------------------------------------------------------------------

    describe('topological sort of process operators', () => {
        it('orders POs vertically by dependency (upstream PO has lower Y)', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.states.push(makeState('s2'));
                m.states.push(makeState('s3'));
                m.processOperators.push(makePO('po1'));
                m.processOperators.push(makePO('po2'));
                // s1 -> po1 -> s2 -> po2 -> s3
                m.flows.push(makeFlow('s1', 'po1'));
                m.flows.push(makeFlow('po1', 's2'));
                m.flows.push(makeFlow('s2', 'po2'));
                m.flows.push(makeFlow('po2', 's3'));
            });

            const layout = computeLayout(model);
            const po1 = findElement(layout, 'po1');
            const po2 = findElement(layout, 'po2');

            // po1 should be above po2 (lower Y)
            expect(po1.y).toBeLessThan(po2.y);
        });

        it('handles three chained POs in correct vertical order', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.states.push(makeState('s2'));
                m.states.push(makeState('s3'));
                m.states.push(makeState('s4'));
                m.processOperators.push(makePO('po1'));
                m.processOperators.push(makePO('po2'));
                m.processOperators.push(makePO('po3'));
                m.flows.push(makeFlow('s1', 'po1'));
                m.flows.push(makeFlow('po1', 's2'));
                m.flows.push(makeFlow('s2', 'po2'));
                m.flows.push(makeFlow('po2', 's3'));
                m.flows.push(makeFlow('s3', 'po3'));
                m.flows.push(makeFlow('po3', 's4'));
            });

            const layout = computeLayout(model);
            const po1 = findElement(layout, 'po1');
            const po2 = findElement(layout, 'po2');
            const po3 = findElement(layout, 'po3');

            expect(po1.y).toBeLessThan(po2.y);
            expect(po2.y).toBeLessThan(po3.y);
        });

        it('handles cycle in PO dependencies without crashing', () => {
            // po1 -> s1 -> po2 -> s2 -> po1 (cycle)
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.states.push(makeState('s2'));
                m.processOperators.push(makePO('po1'));
                m.processOperators.push(makePO('po2'));
                m.flows.push(makeFlow('po1', 's1'));
                m.flows.push(makeFlow('s1', 'po2'));
                m.flows.push(makeFlow('po2', 's2'));
                m.flows.push(makeFlow('s2', 'po1'));
            });

            // Should not throw
            const layout = computeLayout(model);
            expect(layout.elements.length).toBeGreaterThanOrEqual(2);
            // Both POs should be present
            expect(layout.elements.filter(e => e.type === 'processOperator')).toHaveLength(2);
        });
    });

    // -----------------------------------------------------------------------
    // 4. Boundary state classification
    // -----------------------------------------------------------------------

    describe('boundary state placement', () => {
        it('respects explicit @boundary-top placement', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1', 'product', { placement: 'boundary-top' }));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s1', 'po1'));
            });

            const layout = computeLayout(model);
            const s1 = findElement(layout, 's1');
            const po1 = findElement(layout, 'po1');
            expect(s1.y).toBeLessThan(po1.y);
        });

        it('respects explicit @boundary-bottom placement', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1', 'product', { placement: 'boundary-bottom' }));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('po1', 's1'));
            });

            const layout = computeLayout(model);
            const s1 = findElement(layout, 's1');
            const po1 = findElement(layout, 'po1');
            expect(s1.y).toBeGreaterThan(po1.y);
        });

        it('respects explicit @boundary-left placement', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1', 'energy', { placement: 'boundary-left' }));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s1', 'po1'));
            });

            const layout = computeLayout(model);
            const s1 = findElement(layout, 's1');
            const po1 = findElement(layout, 'po1');
            expect(s1.x).toBeLessThan(po1.x);
        });

        it('respects explicit @boundary-right placement', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1', 'energy', { placement: 'boundary-right' }));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('po1', 's1'));
            });

            const layout = computeLayout(model);
            const s1 = findElement(layout, 's1');
            const po1 = findElement(layout, 'po1');
            expect(s1.x).toBeGreaterThan(po1.x);
        });

        it('auto-detects energy/info inputs as boundary-left', () => {
            const model = buildModel(m => {
                m.states.push(makeState('e1', 'energy'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('e1', 'po1'));
            });

            const layout = computeLayout(model);
            const e1 = findElement(layout, 'e1');
            const po1 = findElement(layout, 'po1');
            // Energy pure-source with no placement => boundary-left
            expect(e1.x).toBeLessThan(po1.x);
        });

        it('auto-detects energy/info outputs as boundary-right', () => {
            const model = buildModel(m => {
                m.states.push(makeState('e1', 'energy'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('po1', 'e1'));
            });

            const layout = computeLayout(model);
            const e1 = findElement(layout, 'e1');
            const po1 = findElement(layout, 'po1');
            // Energy pure-sink with no placement => boundary-right
            expect(e1.x).toBeGreaterThan(po1.x);
        });

        it('auto-classifies product source as boundary-top for single PO', () => {
            const model = buildModel(m => {
                m.states.push(makeState('p1', 'product'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('p1', 'po1'));
            });

            const layout = computeLayout(model);
            const p1 = findElement(layout, 'p1');
            const po1 = findElement(layout, 'po1');
            expect(p1.y).toBeLessThan(po1.y);
        });
    });

    // -----------------------------------------------------------------------
    // 5. Internal (intermediate) states
    // -----------------------------------------------------------------------

    describe('internal states between POs', () => {
        it('places internal state between the two POs it connects', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s_in'));
                m.states.push(makeState('s_mid'));
                m.states.push(makeState('s_out'));
                m.processOperators.push(makePO('po1'));
                m.processOperators.push(makePO('po2'));
                m.flows.push(makeFlow('s_in', 'po1'));
                m.flows.push(makeFlow('po1', 's_mid'));
                m.flows.push(makeFlow('s_mid', 'po2'));
                m.flows.push(makeFlow('po2', 's_out'));
            });

            const layout = computeLayout(model);
            const po1 = findElement(layout, 'po1');
            const po2 = findElement(layout, 'po2');
            const sMid = findElement(layout, 's_mid');

            // s_mid should be vertically between po1 and po2
            expect(sMid.y).toBeGreaterThan(po1.y);
            expect(sMid.y).toBeLessThan(po2.y);
        });

        it('respects explicit @internal placement', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1', 'product', { placement: 'internal' }));
                m.processOperators.push(makePO('po1'));
                m.processOperators.push(makePO('po2'));
                m.flows.push(makeFlow('po1', 's1'));
                m.flows.push(makeFlow('s1', 'po2'));
            });

            const layout = computeLayout(model);
            const s1 = findElement(layout, 's1');
            const po1 = findElement(layout, 'po1');
            const po2 = findElement(layout, 'po2');

            expect(s1.y).toBeGreaterThan(po1.y);
            expect(s1.y).toBeLessThan(po2.y);
        });
    });

    // -----------------------------------------------------------------------
    // 6. Feedback (backward) internal states
    // -----------------------------------------------------------------------

    describe('backward (feedback) internal states', () => {
        it('places feedback state left of POs', () => {
            // po1 -> s_fwd -> po2, po2 -> s_back -> po1 (feedback)
            const model = buildModel(m => {
                m.states.push(makeState('s_in'));
                m.states.push(makeState('s_fwd'));
                m.states.push(makeState('s_back'));
                m.states.push(makeState('s_out'));
                m.processOperators.push(makePO('po1'));
                m.processOperators.push(makePO('po2'));
                m.flows.push(makeFlow('s_in', 'po1'));
                m.flows.push(makeFlow('po1', 's_fwd'));
                m.flows.push(makeFlow('s_fwd', 'po2'));
                m.flows.push(makeFlow('po2', 's_out'));
                // Feedback: po2 -> s_back -> po1
                m.flows.push(makeFlow('po2', 's_back'));
                m.flows.push(makeFlow('s_back', 'po1'));
            });

            const layout = computeLayout(model);
            const po1 = findElement(layout, 'po1');
            const sBack = findElement(layout, 's_back');

            // Feedback state should be left of po1
            expect(sBack.x).toBeLessThan(po1.x);
        });

        it('sets routing hints for feedback connections', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s_in'));
                m.states.push(makeState('s_fwd'));
                m.states.push(makeState('s_back'));
                m.states.push(makeState('s_out'));
                m.processOperators.push(makePO('po1'));
                m.processOperators.push(makePO('po2'));
                m.flows.push(makeFlow('s_in', 'po1'));
                m.flows.push(makeFlow('po1', 's_fwd'));
                m.flows.push(makeFlow('s_fwd', 'po2'));
                m.flows.push(makeFlow('po2', 's_out'));
                m.flows.push(makeFlow('po2', 's_back'));
                m.flows.push(makeFlow('s_back', 'po1'));
            });

            const layout = computeLayout(model);

            // PO -> feedback state: source side left, target side bottom
            const poToFeedback = findConnection(layout, 'po2', 's_back');
            expect(poToFeedback.sourceSide).toBe('left');
            expect(poToFeedback.targetSide).toBe('bottom');

            // Feedback state -> PO: source side top, target side left
            const feedbackToPo = findConnection(layout, 's_back', 'po1');
            expect(feedbackToPo.sourceSide).toBe('top');
            expect(feedbackToPo.targetSide).toBe('left');
        });
    });

    // -----------------------------------------------------------------------
    // 7. Technical resources
    // -----------------------------------------------------------------------

    describe('technical resources', () => {
        it('places technical resource to the right of the PO', () => {
            const model = buildModel(m => {
                m.processOperators.push(makePO('po1'));
                m.technicalResources.push(makeTR('tr1'));
                m.usages.push(makeUsage('po1', 'tr1'));
            });

            const layout = computeLayout(model);
            const po1 = findElement(layout, 'po1');
            const tr1 = findElement(layout, 'tr1');

            expect(tr1.x).toBeGreaterThan(po1.x + po1.width);
            expect(tr1.type).toBe('technicalResource');
        });

        it('creates usage connection', () => {
            const model = buildModel(m => {
                m.processOperators.push(makePO('po1'));
                m.technicalResources.push(makeTR('tr1'));
                m.usages.push(makeUsage('po1', 'tr1'));
            });

            const layout = computeLayout(model);
            const conn = findConnection(layout, 'po1', 'tr1');
            expect(conn.isUsage).toBe(true);
        });

        it('aligns TR vertically with its connected PO', () => {
            const model = buildModel(m => {
                m.processOperators.push(makePO('po1'));
                m.technicalResources.push(makeTR('tr1'));
                m.usages.push(makeUsage('po1', 'tr1'));
            });

            const layout = computeLayout(model);
            const po1 = findElement(layout, 'po1');
            const tr1 = findElement(layout, 'tr1');

            // TR should be vertically centered with PO
            expect(centerY(tr1)).toBeCloseTo(centerY(po1), 0);
        });
    });

    // -----------------------------------------------------------------------
    // 8. Disconnected elements
    // -----------------------------------------------------------------------

    describe('disconnected elements', () => {
        it('places disconnected states below connected elements', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.states.push(makeState('s_disc'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s1', 'po1'));
                // s_disc has no flows
            });

            const layout = computeLayout(model);
            const po1 = findElement(layout, 'po1');
            const sDisc = findElement(layout, 's_disc');

            expect(sDisc.y).toBeGreaterThan(po1.y + po1.height);
        });

        it('places disconnected POs below connected elements', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.processOperators.push(makePO('po1'));
                m.processOperators.push(makePO('po_disc'));
                m.flows.push(makeFlow('s1', 'po1'));
                // po_disc has no flows
            });

            const layout = computeLayout(model);
            const po1 = findElement(layout, 'po1');
            const poDisc = findElement(layout, 'po_disc');

            expect(poDisc.y).toBeGreaterThan(po1.y + po1.height);
        });
    });

    // -----------------------------------------------------------------------
    // 9. Multi-system layout
    // -----------------------------------------------------------------------

    describe('multi-system layout', () => {
        it('creates separate system limits for each system', () => {
            const model = buildModel(m => {
                m.systemLimits.push({
                    id: 'sys1',
                    identification: { uniqueIdent: 'sys1' },
                    label: 'System 1',
                });
                m.systemLimits.push({
                    id: 'sys2',
                    identification: { uniqueIdent: 'sys2' },
                    label: 'System 2',
                });
                m.states.push(makeState('s1', 'product', { systemId: 'sys1' }));
                m.processOperators.push(makePO('po1', { systemId: 'sys1' }));
                m.flows.push(makeFlow('s1', 'po1', { systemId: 'sys1' }));

                m.states.push(makeState('s2', 'product', { systemId: 'sys2' }));
                m.processOperators.push(makePO('po2', { systemId: 'sys2' }));
                m.flows.push(makeFlow('s2', 'po2', { systemId: 'sys2' }));
            });

            const layout = computeLayout(model);
            expect(layout.systemLimits).toHaveLength(2);
            expect(layout.systemLimits[0].label).toBe('System 1');
            expect(layout.systemLimits[1].label).toBe('System 2');
        });

        it('does not overlap system limits', () => {
            const model = buildModel(m => {
                m.systemLimits.push({
                    id: 'sys1',
                    identification: { uniqueIdent: 'sys1' },
                    label: 'System 1',
                });
                m.systemLimits.push({
                    id: 'sys2',
                    identification: { uniqueIdent: 'sys2' },
                    label: 'System 2',
                });
                m.states.push(makeState('s1', 'product', { systemId: 'sys1' }));
                m.processOperators.push(makePO('po1', { systemId: 'sys1' }));
                m.flows.push(makeFlow('s1', 'po1', { systemId: 'sys1' }));

                m.states.push(makeState('s2', 'product', { systemId: 'sys2' }));
                m.processOperators.push(makePO('po2', { systemId: 'sys2' }));
                m.flows.push(makeFlow('s2', 'po2', { systemId: 'sys2' }));
            });

            const layout = computeLayout(model);
            const [sl1, sl2] = layout.systemLimits;

            // They should not overlap
            const noOverlap =
                sl1.x + sl1.width <= sl2.x ||
                sl2.x + sl2.width <= sl1.x ||
                sl1.y + sl1.height <= sl2.y ||
                sl2.y + sl2.height <= sl1.y;
            expect(noOverlap).toBe(true);
        });

        it('marks cross-system flows correctly', () => {
            const model = buildModel(m => {
                m.systemLimits.push({
                    id: 'sys1',
                    identification: { uniqueIdent: 'sys1' },
                    label: 'System 1',
                });
                m.systemLimits.push({
                    id: 'sys2',
                    identification: { uniqueIdent: 'sys2' },
                    label: 'System 2',
                });
                m.states.push(makeState('s1', 'product', { systemId: 'sys1' }));
                m.processOperators.push(makePO('po1', { systemId: 'sys1' }));
                m.flows.push(makeFlow('s1', 'po1', { systemId: 'sys1' }));

                m.states.push(makeState('s2', 'product', { systemId: 'sys2' }));
                m.processOperators.push(makePO('po2', { systemId: 'sys2' }));
                m.flows.push(makeFlow('s2', 'po2', { systemId: 'sys2' }));

                // Cross-system flow (no systemId)
                m.states.push(makeState('s_out', 'product', { systemId: 'sys1' }));
                m.flows.push(makeFlow('po1', 's_out', { systemId: 'sys1' }));
                m.flows.push(makeFlow('s_out', 's2'));  // cross-system
            });

            const layout = computeLayout(model);
            const crossConn = layout.connections.find(
                c => c.sourceId === 's_out' && c.targetId === 's2',
            );
            expect(crossConn).toBeDefined();
            expect(crossConn!.isCrossSystem).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // 10. Custom layout config
    // -----------------------------------------------------------------------

    describe('custom layout config', () => {
        it('uses custom padding', () => {
            const model = buildModel(m => {
                m.processOperators.push(makePO('po1'));
            });

            const smallPad = computeLayout(model, { ...createLayoutConfig(), padding: 10 });
            const largePad = computeLayout(model, { ...createLayoutConfig(), padding: 200 });

            const poSmall = findElement(smallPad, 'po1');
            const poLarge = findElement(largePad, 'po1');

            // Larger padding should push the PO further from origin
            expect(poLarge.x).toBeGreaterThan(poSmall.x);
            expect(poLarge.y).toBeGreaterThan(poSmall.y);
        });

        it('uses custom vGap to increase vertical spacing between PO rows', () => {
            // Two independent POs, each with its own input/output.
            // No shared intermediate states, so no INTERNAL_V_GAP override.
            // PO ordering is forced by the topological sort seeing po1 < po2
            // alphabetically when both have in-degree 0.
            function makeTwoPOModel(): ProcessModel {
                return buildModel(m => {
                    m.states.push(makeState('a_in'));
                    m.states.push(makeState('a_out'));
                    m.states.push(makeState('b_in'));
                    m.states.push(makeState('b_out'));
                    m.processOperators.push(makePO('po_a'));
                    m.processOperators.push(makePO('po_b'));
                    m.flows.push(makeFlow('a_in', 'po_a'));
                    m.flows.push(makeFlow('po_a', 'a_out'));
                    m.flows.push(makeFlow('b_in', 'po_b'));
                    m.flows.push(makeFlow('po_b', 'b_out'));
                });
            }

            const tight = computeLayout(makeTwoPOModel(), { ...createLayoutConfig(), vGap: 20 });
            const loose = computeLayout(makeTwoPOModel(), { ...createLayoutConfig(), vGap: 300 });

            const poATight = findElement(tight, 'po_a');
            const poBTight = findElement(tight, 'po_b');
            const poALoose = findElement(loose, 'po_a');
            const poBLoose = findElement(loose, 'po_b');

            const spacingTight = poBTight.y - poATight.y;
            const spacingLoose = poBLoose.y - poALoose.y;

            expect(spacingLoose).toBeGreaterThan(spacingTight);
        });
    });

    // -----------------------------------------------------------------------
    // 11. Element dimensions and types
    // -----------------------------------------------------------------------

    describe('element dimensions', () => {
        it('assigns correct dimensions to process operators', () => {
            const model = buildModel(m => {
                m.processOperators.push(makePO('po1'));
            });
            const layout = computeLayout(model);
            const po = findElement(layout, 'po1');
            expect(po.width).toBe(150);
            expect(po.height).toBe(80);
        });

        it('assigns correct dimensions to states', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s1', 'po1'));
            });
            const layout = computeLayout(model);
            const s = findElement(layout, 's1');
            expect(s.width).toBe(55);
            expect(s.height).toBe(50);
        });

        it('assigns correct dimensions to technical resources', () => {
            const model = buildModel(m => {
                m.processOperators.push(makePO('po1'));
                m.technicalResources.push(makeTR('tr1'));
                m.usages.push(makeUsage('po1', 'tr1'));
            });
            const layout = computeLayout(model);
            const tr = findElement(layout, 'tr1');
            expect(tr.width).toBe(150);
            expect(tr.height).toBe(80);
        });
    });

    // -----------------------------------------------------------------------
    // 12. Connection routing hints
    // -----------------------------------------------------------------------

    describe('connection routing hints', () => {
        it('sets sourceSide=bottom for boundary-top source states', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s_top', 'product'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s_top', 'po1'));
            });

            const layout = computeLayout(model);
            const conn = findConnection(layout, 's_top', 'po1');
            expect(conn.sourceSide).toBe('bottom');
        });

        it('sets targetSide=top for boundary-bottom target states', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s_bot', 'product'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('po1', 's_bot'));
            });

            const layout = computeLayout(model);
            const conn = findConnection(layout, 'po1', 's_bot');
            expect(conn.targetSide).toBe('top');
        });
    });

    // -----------------------------------------------------------------------
    // 13. Alternative and parallel flows
    // -----------------------------------------------------------------------

    describe('alternative and parallel flows', () => {
        it('preserves flowType on connections', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.states.push(makeState('s2'));
                m.states.push(makeState('s3'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s1', 'po1'));
                m.flows.push(makeFlow('po1', 's2', { flowType: 'alternativeFlow' }));
                m.flows.push(makeFlow('po1', 's3', { flowType: 'parallelFlow' }));
            });

            const layout = computeLayout(model);
            const altConn = findConnection(layout, 'po1', 's2');
            const parConn = findConnection(layout, 'po1', 's3');

            expect(altConn.flowType).toBe('alternativeFlow');
            expect(parConn.flowType).toBe('parallelFlow');
        });
    });

    // -----------------------------------------------------------------------
    // 14. Line number preservation
    // -----------------------------------------------------------------------

    describe('line number preservation', () => {
        it('preserves lineNumber on elements', () => {
            const model = buildModel(m => {
                m.processOperators.push(makePO('po1', { lineNumber: 5 }));
                m.states.push(makeState('s1', 'product', { lineNumber: 3 }));
                m.flows.push(makeFlow('s1', 'po1'));
            });

            const layout = computeLayout(model);
            expect(findElement(layout, 'po1').lineNumber).toBe(5);
            expect(findElement(layout, 's1').lineNumber).toBe(3);
        });

        it('preserves lineNumber on connections', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s1', 'po1', { lineNumber: 10 }));
            });

            const layout = computeLayout(model);
            const conn = findConnection(layout, 's1', 'po1');
            expect(conn.lineNumber).toBe(10);
        });
    });

    // -----------------------------------------------------------------------
    // 15. No duplicate elements
    // -----------------------------------------------------------------------

    describe('deduplication', () => {
        it('does not produce duplicate element IDs', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.states.push(makeState('s2'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s1', 'po1'));
                m.flows.push(makeFlow('po1', 's2'));
            });

            const layout = computeLayout(model);
            const ids = layout.elements.map(e => e.id);
            const uniqueIds = new Set(ids);
            expect(ids.length).toBe(uniqueIds.size);
        });
    });

    // -----------------------------------------------------------------------
    // 16. Complex real-world scenario
    // -----------------------------------------------------------------------

    describe('complex scenario', () => {
        it('handles a realistic FPD with multiple POs, states, TRs, and a system', () => {
            const model = buildModel(m => {
                m.systemLimits.push({
                    id: 'sys1',
                    identification: { uniqueIdent: 'sys1' },
                    label: 'Manufacturing',
                });

                // States
                m.states.push(makeState('raw', 'product', { systemId: 'sys1' }));
                m.states.push(makeState('semi', 'product', { systemId: 'sys1' }));
                m.states.push(makeState('finished', 'product', { systemId: 'sys1' }));
                m.states.push(makeState('energy_in', 'energy', { systemId: 'sys1' }));
                m.states.push(makeState('waste', 'product', { systemId: 'sys1' }));

                // Process Operators
                m.processOperators.push(makePO('cut', { systemId: 'sys1' }));
                m.processOperators.push(makePO('assemble', { systemId: 'sys1' }));

                // Technical Resources
                m.technicalResources.push(makeTR('laser', { systemId: 'sys1' }));
                m.technicalResources.push(makeTR('robot', { systemId: 'sys1' }));

                // Flows
                m.flows.push(makeFlow('raw', 'cut', { systemId: 'sys1' }));
                m.flows.push(makeFlow('cut', 'semi', { systemId: 'sys1' }));
                m.flows.push(makeFlow('semi', 'assemble', { systemId: 'sys1' }));
                m.flows.push(makeFlow('assemble', 'finished', { systemId: 'sys1' }));
                m.flows.push(makeFlow('energy_in', 'cut', { systemId: 'sys1' }));
                m.flows.push(makeFlow('cut', 'waste', { systemId: 'sys1', flowType: 'alternativeFlow' }));

                // Usages
                m.usages.push(makeUsage('cut', 'laser', { systemId: 'sys1' }));
                m.usages.push(makeUsage('assemble', 'robot', { systemId: 'sys1' }));
            });

            const layout = computeLayout(model);

            // All elements present
            expect(layout.elements).toHaveLength(9); // 5 states + 2 POs + 2 TRs

            // All connections present: 6 flows + 2 usages
            expect(layout.connections).toHaveLength(8);

            // System limit exists
            expect(layout.systemLimits).toHaveLength(1);
            expect(layout.systemLimits[0].label).toBe('Manufacturing');

            // Structural checks
            const cut = findElement(layout, 'cut');
            const assemble = findElement(layout, 'assemble');
            expect(cut.y).toBeLessThan(assemble.y); // cut before assemble

            const laser = findElement(layout, 'laser');
            expect(laser.x).toBeGreaterThan(cut.x + cut.width); // TR right of PO

            // No overlapping elements (basic check on POs and TRs)
            for (let i = 0; i < layout.elements.length; i++) {
                for (let j = i + 1; j < layout.elements.length; j++) {
                    const a = layout.elements[i];
                    const b = layout.elements[j];
                    const overlap =
                        a.x < b.x + b.width &&
                        a.x + a.width > b.x &&
                        a.y < b.y + b.height &&
                        a.y + a.height > b.y;
                    if (overlap) {
                        // Boundary states can overlap with system limit edge, so only
                        // check same-type element pairs
                        if (a.type === b.type) {
                            expect(overlap).toBe(false);
                        }
                    }
                }
            }
        });
    });

    // -----------------------------------------------------------------------
    // 17. _distributeCentered helper (tested indirectly)
    // -----------------------------------------------------------------------

    describe('centered distribution', () => {
        it('centers multiple boundary-top states around the PO center', () => {
            const model = buildModel(m => {
                m.states.push(makeState('p1', 'product'));
                m.states.push(makeState('p2', 'product'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('p1', 'po1'));
                m.flows.push(makeFlow('p2', 'po1'));
            });

            const layout = computeLayout(model);
            const p1 = findElement(layout, 'p1');
            const p2 = findElement(layout, 'p2');

            // Both should be at the same Y (both boundary-top)
            expect(p1.y).toBe(p2.y);
            // They should be side by side, not overlapping
            const noOverlap = p1.x + p1.width <= p2.x || p2.x + p2.width <= p1.x;
            expect(noOverlap).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // 18. All coordinates are finite numbers
    // -----------------------------------------------------------------------

    describe('coordinate validity', () => {
        it('all element coordinates are finite numbers', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.states.push(makeState('s2'));
                m.processOperators.push(makePO('po1'));
                m.technicalResources.push(makeTR('tr1'));
                m.flows.push(makeFlow('s1', 'po1'));
                m.flows.push(makeFlow('po1', 's2'));
                m.usages.push(makeUsage('po1', 'tr1'));
            });

            const layout = computeLayout(model);
            for (const el of layout.elements) {
                expect(Number.isFinite(el.x)).toBe(true);
                expect(Number.isFinite(el.y)).toBe(true);
                expect(Number.isFinite(el.width)).toBe(true);
                expect(Number.isFinite(el.height)).toBe(true);
                expect(el.width).toBeGreaterThan(0);
                expect(el.height).toBeGreaterThan(0);
            }
        });

        it('system limit dimensions are finite and positive', () => {
            const model = buildModel(m => {
                m.states.push(makeState('s1'));
                m.processOperators.push(makePO('po1'));
                m.flows.push(makeFlow('s1', 'po1'));
            });

            const layout = computeLayout(model);
            for (const sl of layout.systemLimits) {
                expect(Number.isFinite(sl.x)).toBe(true);
                expect(Number.isFinite(sl.y)).toBe(true);
                expect(Number.isFinite(sl.width)).toBe(true);
                expect(Number.isFinite(sl.height)).toBe(true);
                expect(sl.width).toBeGreaterThan(0);
                expect(sl.height).toBeGreaterThan(0);
            }
        });
    });
});
