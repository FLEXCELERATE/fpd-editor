import { describe, it, expect, vi, afterEach } from 'vitest';
import { PDFPage } from 'pdf-lib';
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

/** End points of every segment in an absolute M/L/A/Z path, in path coordinates. */
function pathPoints(path: string): [number, number][] {
    const points: [number, number][] = [];
    for (const [, cmd, args] of path.matchAll(/([MLAZ])([^MLAZ]*)/g)) {
        const nums = args.trim().split(/\s+/).filter(Boolean).map(Number);
        if (cmd === 'A') {
            for (let i = 0; i + 6 < nums.length; i += 7) points.push([nums[i + 5], nums[i + 6]]);
        } else {
            for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
        }
    }
    return points;
}

describe('exportPdf drawSvgPath shapes', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // drawSvgPath maps a path point (px, py) to (x + px, y - py) on the page.
    it('draws arrowheads, diamonds, hexagons and resources on the page', async () => {
        const spy = vi.spyOn(PDFPage.prototype, 'drawSvgPath');
        const layout = buildLayout((m) => {
            m.states.push(makeState('p1', 'product'));
            m.states.push(makeState('e1', 'energy'));
            m.states.push(makeState('i1', 'information'));
            m.states.push(makeState('p2', 'product'));
            m.processOperators.push(makePO('po1'));
            m.technicalResources.push(makeTR('tr1'));
            m.flows.push(makeFlow('p1', 'po1'));
            m.flows.push(makeFlow('e1', 'po1'));
            m.flows.push(makeFlow('i1', 'po1'));
            m.flows.push(makeFlow('po1', 'p2'));
            m.usages.push(makeUsage('po1', 'tr1'));
        });

        await exportPdf(layout);

        // 4 flow arrowheads + 2 usage arrowheads + diamond + hexagon + resource
        expect(spy.mock.calls.length).toBe(9);
        spy.mock.calls.forEach(([path, options], i) => {
            const page = spy.mock.contexts[i] as PDFPage;
            const { width, height } = page.getSize();
            for (const [px, py] of pathPoints(path)) {
                const x = (options?.x ?? 0) + px;
                const y = (options?.y ?? 0) - py;
                expect(x).toBeGreaterThanOrEqual(0);
                expect(x).toBeLessThanOrEqual(width);
                expect(y).toBeGreaterThanOrEqual(0);
                expect(y).toBeLessThanOrEqual(height);
            }
        });
    });
});
