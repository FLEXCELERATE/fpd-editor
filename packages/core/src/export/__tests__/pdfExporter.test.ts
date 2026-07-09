import { describe, it, expect } from 'vitest';
import { exportPdf } from '../pdfExporter';
import { computeLayout, DiagramLayout } from '../../services/layout';
import { createProcessModel, ProcessModel } from '../../models/processModel';
import type { State, ProcessOperator, TechnicalResource, Flow, Usage } from '../../models/fpdModel';

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

function buildLayout(setup: (m: ProcessModel) => void): DiagramLayout {
    const m = createProcessModel();
    setup(m);
    return computeLayout(m);
}

function expectValidPdf(bytes: Uint8Array): void {
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportPdf', () => {
    it('exports a simple ASCII-labelled diagram', async () => {
        const layout = buildLayout((m) => {
            m.states.push(makeState('s1', 'product', { label: 'Raw Material' }));
            m.states.push(makeState('s2', 'product', { label: 'Finished' }));
            m.processOperators.push(makePO('po1', { label: 'Cut' }));
            m.flows.push(makeFlow('s1', 'po1'));
            m.flows.push(makeFlow('po1', 's2'));
        });

        const bytes = await exportPdf(layout);
        expectValidPdf(bytes);
    });

    it('exports an empty layout', async () => {
        const layout: DiagramLayout = {
            elements: [],
            connections: [],
            systemLimits: [],
            systemLimit: null,
        };
        const bytes = await exportPdf(layout);
        expectValidPdf(bytes);
    });

    it('does not crash on non-WinAnsi (CJK) labels', async () => {
        const layout = buildLayout((m) => {
            m.states.push(makeState('s1', 'product', { label: '日本語' }));
            m.processOperators.push(makePO('po1', { label: '加工' }));
            m.flows.push(makeFlow('s1', 'po1'));
        });

        const bytes = await exportPdf(layout);
        expectValidPdf(bytes);
    });

    it('does not crash on non-WinAnsi element ids', async () => {
        const layout = buildLayout((m) => {
            m.states.push(makeState('材料'));
            m.processOperators.push(makePO('po1'));
            m.flows.push(makeFlow('材料', 'po1'));
        });

        const bytes = await exportPdf(layout);
        expectValidPdf(bytes);
    });

    it('does not crash on emoji, astral characters, and mixed text', async () => {
        const layout = buildLayout((m) => {
            m.states.push(makeState('s1', 'product', { label: 'Steel 🏭 β-phase 日本' }));
            m.states.push(makeState('s2', 'energy', { label: 'Ström & Wärme' }));
            m.processOperators.push(makePO('po1', { label: 'Präzisionsfräsen' }));
            m.technicalResources.push(makeTR('tr1', { label: 'ロボット' }));
            m.flows.push(makeFlow('s1', 'po1'));
            m.flows.push(makeFlow('s2', 'po1'));
            m.usages.push(makeUsage('po1', 'tr1'));
        });

        const bytes = await exportPdf(layout);
        expectValidPdf(bytes);
    });

    it('does not crash on a non-WinAnsi system limit label', async () => {
        const layout = buildLayout((m) => {
            m.systemLimits.push({
                id: 'sys1',
                identification: { uniqueIdent: 'sys1' },
                label: 'システム',
            });
            m.states.push(makeState('s1', 'product', { systemId: 'sys1' }));
            m.processOperators.push(makePO('po1', { systemId: 'sys1' }));
            m.flows.push(makeFlow('s1', 'po1', { systemId: 'sys1' }));
        });

        const bytes = await exportPdf(layout);
        expectValidPdf(bytes);
    });

    it('does not mutate the layout passed in', async () => {
        const layout = buildLayout((m) => {
            m.states.push(makeState('s1', 'product', { label: '日本語' }));
            m.processOperators.push(makePO('po1'));
            m.flows.push(makeFlow('s1', 'po1'));
        });

        await exportPdf(layout);
        const s1 = layout.elements.find((e) => e.id === 's1');
        expect(s1!.label).toBe('日本語');
    });

    it('sets document metadata from options', async () => {
        const layout = buildLayout((m) => {
            m.processOperators.push(makePO('po1'));
        });

        const bytes = await exportPdf(layout, {
            pageSize: 'Letter',
            orientation: 'portrait',
            title: 'My Process',
            author: 'Tester',
        });
        expectValidPdf(bytes);
    });
});
