import { describe, it, expect } from 'vitest';
import { exportXml } from '../xmlExporter';
import { importXml } from '../../import/xmlImporter';
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
    return { id, stateType, identification: { uniqueIdent: id, longName: id }, label: id, ...opts };
}

function makePO(id: string, opts: Partial<ProcessOperator> = {}): ProcessOperator {
    return { id, identification: { uniqueIdent: id, longName: id }, label: id, ...opts };
}

function makeTR(id: string, opts: Partial<TechnicalResource> = {}): TechnicalResource {
    return { id, identification: { uniqueIdent: id, longName: id }, label: id, ...opts };
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

describe('exportXml', () => {
    it('produces valid XML with declaration and namespace', () => {
        const xml = exportXml(createProcessModel());
        expect(xml).toContain("<?xml version='1.0' encoding='UTF-8'?>");
        expect(xml).toContain('xmlns:fpb="http://www.vdivde.de/3682"');
        expect(xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    });

    it('wraps content in fpb:project and fpb:process', () => {
        const xml = exportXml(createProcessModel());
        expect(xml).toContain('<fpb:project');
        expect(xml).toContain('</fpb:project>');
        expect(xml).toContain('<fpb:process id="process_1">');
        expect(xml).toContain('</fpb:process>');
    });

    it('exports system limit with title as name', () => {
        const model = createProcessModel();
        model.title = 'My System';
        const xml = exportXml(model);
        expect(xml).toContain('name="My System"');
    });

    it('exports named system limit from model', () => {
        const model = build((m) => {
            m.systemLimits.push({
                id: 'sl_custom',
                identification: { uniqueIdent: 'sl_custom', longName: 'Custom Boundary' },
                label: 'Custom Boundary',
            });
        });
        const xml = exportXml(model);
        expect(xml).toContain('id="sl_custom"');
        expect(xml).toContain('name="Custom Boundary"');
    });

    it('exports states with correct stateType', () => {
        const model = build((m) => {
            m.states.push(makeState('p1', 'product'));
            m.states.push(makeState('e1', 'energy'));
            m.states.push(makeState('i1', 'information'));
        });
        const xml = exportXml(model);
        expect(xml).toContain('stateType="product"');
        expect(xml).toContain('stateType="energy"');
        expect(xml).toContain('stateType="information"');
    });

    it('exports state identification with uniqueIdent and longName', () => {
        const model = build((m) => {
            m.states.push(
                makeState('p1', 'product', {
                    identification: { uniqueIdent: 'p1', longName: 'Raw Material' },
                    label: 'Raw Material',
                }),
            );
        });
        const xml = exportXml(model);
        expect(xml).toContain('uniqueIdent="p1"');
        expect(xml).toContain('longName="Raw Material"');
    });

    it('exports process operators inside fpb:processOperators', () => {
        const model = build((m) => {
            m.processOperators.push(makePO('po1', { label: 'Cut' }));
        });
        const xml = exportXml(model);
        expect(xml).toContain('<fpb:processOperators>');
        expect(xml).toContain('<fpb:processOperator>');
        expect(xml).toContain('uniqueIdent="po1"');
    });

    it('exports technical resources inside fpb:technicalResources', () => {
        const model = build((m) => {
            m.technicalResources.push(makeTR('tr1', { label: 'Laser' }));
        });
        const xml = exportXml(model);
        expect(xml).toContain('<fpb:technicalResources>');
        expect(xml).toContain('<fpb:technicalResource>');
        expect(xml).toContain('uniqueIdent="tr1"');
    });

    it('exports flows in flowContainer with flowType', () => {
        const model = build((m) => {
            m.states.push(makeState('s1'));
            m.processOperators.push(makePO('po1'));
            m.flows.push(makeFlow('s1', 'po1'));
            m.flows.push(makeFlow('po1', 's1', { id: 'f_alt', flowType: 'alternativeFlow' }));
        });
        const xml = exportXml(model);
        expect(xml).toContain('<fpb:flowContainer>');
        expect(xml).toContain('flowType="flow"');
        expect(xml).toContain('flowType="alternativeFlow"');
    });

    it('exports usages as flowType="usage" in flowContainer', () => {
        const model = build((m) => {
            m.processOperators.push(makePO('po1'));
            m.technicalResources.push(makeTR('tr1'));
            m.usages.push(makeUsage('po1', 'tr1'));
        });
        const xml = exportXml(model);
        expect(xml).toContain('flowType="usage"');
    });

    it('exports per-element flow bindings with exit/entry', () => {
        const model = build((m) => {
            m.states.push(makeState('s1'));
            m.processOperators.push(makePO('po1'));
            m.flows.push(makeFlow('s1', 'po1'));
        });
        const xml = exportXml(model);
        // s1 is source → exit binding
        expect(xml).toContain('<fpb:exit id="s1"/>');
        // po1 is target → entry binding
        expect(xml).toContain('<fpb:entry id="po1"/>');
    });

    it('escapes XML special characters in labels', () => {
        const model = build((m) => {
            m.processOperators.push(
                makePO('po1', {
                    identification: { uniqueIdent: 'po1', longName: 'A & B <C>' },
                    label: 'A & B <C>',
                }),
            );
        });
        const xml = exportXml(model);
        expect(xml).toContain('longName="A &amp; B &lt;C&gt;"');
    });

    it('round-trips elements and flows through import', () => {
        const model = build((m) => {
            m.title = 'Round Trip';
            m.states.push(makeState('p1', 'product', { label: 'Material' }));
            m.states.push(makeState('e1', 'energy', { label: 'Power' }));
            m.processOperators.push(makePO('po1', { label: 'Mill' }));
            m.technicalResources.push(makeTR('tr1', { label: 'CNC' }));
            m.flows.push(makeFlow('p1', 'po1'));
            m.flows.push(makeFlow('e1', 'po1'));
        });

        const xml = exportXml(model);
        const result = importXml(xml);

        expect(result.model.processOperators).toHaveLength(1);
        expect(result.model.states).toHaveLength(2);
        expect(result.model.technicalResources).toHaveLength(1);
        expect(result.model.flows).toHaveLength(2);
        // Note: usages don't round-trip in HSU format (no entry/exit bindings)
    });
});
