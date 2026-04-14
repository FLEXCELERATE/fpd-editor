import { describe, it, expect } from 'vitest';
import { exportText } from '../textExporter';
import { FpdParser } from '../../parser/parser';
import { createProcessModel } from '../../models/processModel';
import type {
    ProcessModel,
    State,
    ProcessOperator,
    TechnicalResource,
    Flow,
    Usage,
} from '../../models/fpdModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
    id: string,
    stateType: 'product' | 'energy' | 'information' = 'product',
    opts: Partial<State> = {},
): State {
    return { id, stateType, identification: { uniqueIdent: id }, label: id, ...opts };
}

function makePO(id: string, opts: Partial<ProcessOperator> = {}): ProcessOperator {
    return { id, identification: { uniqueIdent: id }, label: id, ...opts };
}

function makeTR(id: string, opts: Partial<TechnicalResource> = {}): TechnicalResource {
    return { id, identification: { uniqueIdent: id }, label: id, ...opts };
}

function makeFlow(src: string, tgt: string, opts: Partial<Flow> = {}): Flow {
    return { id: `flow_${src}_${tgt}`, sourceRef: src, targetRef: tgt, flowType: 'flow', ...opts };
}

function makeUsage(po: string, tr: string, opts: Partial<Usage> = {}): Usage {
    return { id: `usage_${po}_${tr}`, processOperatorRef: po, technicalResourceRef: tr, ...opts };
}

function build(setup: (m: ProcessModel) => void): ProcessModel {
    const m = createProcessModel();
    setup(m);
    return m;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportText', () => {
    it('wraps output in @startfpd / @endfpd', () => {
        const text = exportText(createProcessModel());
        expect(text).toContain('@startfpd');
        expect(text).toContain('@endfpd');
    });

    it('exports title', () => {
        const model = createProcessModel();
        model.title = 'My Process';
        const text = exportText(model);
        expect(text).toContain('title "My Process"');
    });

    it('escapes double quotes in title', () => {
        const model = createProcessModel();
        model.title = 'Process "Alpha"';
        const text = exportText(model);
        expect(text).toContain('title "Process \\"Alpha\\""');
    });

    it('escapes backslashes in labels', () => {
        const model = build((m) => {
            m.processOperators.push(makePO('po1', { label: 'Cut \\ Drill' }));
        });
        const text = exportText(model);
        expect(text).toContain('"Cut \\\\ Drill"');
    });

    it('exports all state types with correct keywords', () => {
        const model = build((m) => {
            m.states.push(makeState('p1', 'product', { label: 'Product' }));
            m.states.push(makeState('e1', 'energy', { label: 'Energy' }));
            m.states.push(makeState('i1', 'information', { label: 'Info' }));
        });
        const text = exportText(model);
        expect(text).toContain('product p1 "Product"');
        expect(text).toContain('energy e1 "Energy"');
        expect(text).toContain('information i1 "Info"');
    });

    it('exports process operators and technical resources', () => {
        const model = build((m) => {
            m.processOperators.push(makePO('po1', { label: 'Cut' }));
            m.technicalResources.push(makeTR('tr1', { label: 'Laser' }));
        });
        const text = exportText(model);
        expect(text).toContain('process_operator po1 "Cut"');
        expect(text).toContain('technical_resource tr1 "Laser"');
    });

    it('exports flow connections with correct operators', () => {
        const model = build((m) => {
            m.states.push(makeState('s1'));
            m.processOperators.push(makePO('po1'));
            m.flows.push(makeFlow('s1', 'po1'));
            m.flows.push(makeFlow('po1', 's1', { id: 'f2', flowType: 'alternativeFlow' }));
            m.flows.push(makeFlow('s1', 'po1', { id: 'f3', flowType: 'parallelFlow' }));
        });
        const text = exportText(model);
        expect(text).toContain('s1 --> po1');
        expect(text).toContain('po1 -.-> s1');
        expect(text).toContain('s1 ==> po1');
    });

    it('exports usage connections', () => {
        const model = build((m) => {
            m.processOperators.push(makePO('po1'));
            m.technicalResources.push(makeTR('tr1'));
            m.usages.push(makeUsage('po1', 'tr1'));
        });
        const text = exportText(model);
        expect(text).toContain('po1 <..> tr1');
    });

    it('exports placement annotations on states', () => {
        const model = build((m) => {
            m.states.push(makeState('s1', 'product', { label: 'P1', placement: 'boundary' }));
            m.states.push(makeState('s2', 'energy', { label: 'E1', placement: 'internal' }));
        });
        const text = exportText(model);
        expect(text).toContain('product s1 "P1" @boundary');
        expect(text).toContain('energy s2 "E1" @internal');
    });

    it('wraps elements in system blocks when systemLimits exist', () => {
        const model = build((m) => {
            m.systemLimits.push({
                id: 'sys1',
                identification: { uniqueIdent: 'sys1' },
                label: 'Manufacturing',
            });
            m.processOperators.push(makePO('po1', { label: 'Cut', systemId: 'sys1' }));
            m.states.push(makeState('s1', 'product', { label: 'Raw', systemId: 'sys1' }));
            m.flows.push(makeFlow('s1', 'po1', { systemId: 'sys1' }));
        });
        const text = exportText(model);
        expect(text).toContain('system "Manufacturing" {');
        expect(text).toContain('}');
        // Elements inside the system should be indented
        expect(text).toMatch(/\s{2}product s1/);
        expect(text).toMatch(/\s{2}process_operator po1/);
    });

    it('places cross-system flows outside system blocks', () => {
        const model = build((m) => {
            m.systemLimits.push({
                id: 'sys1',
                identification: { uniqueIdent: 'sys1' },
                label: 'Sys1',
            });
            m.systemLimits.push({
                id: 'sys2',
                identification: { uniqueIdent: 'sys2' },
                label: 'Sys2',
            });
            m.states.push(makeState('s1', 'product', { systemId: 'sys1' }));
            m.states.push(makeState('s2', 'product', { systemId: 'sys2' }));
            // Cross-system flow has no systemId
            m.flows.push(makeFlow('s1', 's2'));
        });
        const text = exportText(model);
        // The cross-system flow should appear outside any system block
        const lines = text.split('\n');
        const flowLine = lines.find((l) => l.includes('s1 --> s2'));
        expect(flowLine).toBeDefined();
        // Should not be indented (i.e., not inside a system block)
        expect(flowLine!.startsWith('s1')).toBe(true);
    });

    it('produces parseable output (round-trip)', () => {
        const model = build((m) => {
            m.title = 'Round Trip';
            m.states.push(makeState('p1', 'product', { label: 'Material' }));
            m.processOperators.push(makePO('po1', { label: 'Mill' }));
            m.technicalResources.push(makeTR('tr1', { label: 'CNC' }));
            m.flows.push(makeFlow('p1', 'po1'));
            m.usages.push(makeUsage('po1', 'tr1'));
        });
        const text = exportText(model);

        // Re-parse the exported text
        const reparsed = new FpdParser(text).parse();
        expect(reparsed.errors).toHaveLength(0);
        expect(reparsed.title).toBe('Round Trip');
        expect(reparsed.processOperators).toHaveLength(1);
    });
});
