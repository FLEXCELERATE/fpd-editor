import { describe, it, expect } from 'vitest';
import { detectFormat, importXml } from '../xmlImporter';
import { exportXml } from '../../export/xmlExporter';
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

/** Generate HSU-format XML from a model via the exporter. */
function modelToXml(setup: (m: ProcessModel) => void): string {
    return exportXml(build(setup));
}

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------

describe('detectFormat', () => {
    it('detects .xml extension', () => {
        expect(detectFormat('file.xml', '')).toBe('xml');
    });

    it('detects .XML extension (case-insensitive)', () => {
        expect(detectFormat('FILE.XML', '')).toBe('xml');
    });

    it('detects .fpd extension', () => {
        expect(detectFormat('file.fpd', '')).toBe('text');
    });

    it('detects .fpb extension', () => {
        expect(detectFormat('file.fpb', '')).toBe('text');
    });

    it('detects .txt extension', () => {
        expect(detectFormat('file.txt', '')).toBe('text');
    });

    it('falls back to content detection for <?xml', () => {
        expect(detectFormat('file.dat', '<?xml version="1.0"?><root/>')).toBe('xml');
    });

    it('falls back to content detection for < (XML-like)', () => {
        expect(detectFormat('file.dat', '<project></project>')).toBe('xml');
    });

    it('falls back to content detection for @startfpd', () => {
        expect(detectFormat('file.dat', '  @startfpd\n@endfpd')).toBe('text');
    });

    it('throws on undetectable format', () => {
        expect(() => detectFormat('file.csv', 'random data')).toThrow(
            /Unable to detect file format/,
        );
    });
});

// ---------------------------------------------------------------------------
// importXml — HSU format (via exportXml round-trip)
// ---------------------------------------------------------------------------

describe('importXml (HSU format)', () => {
    it('imports a minimal XML with one PO and one state', () => {
        const xml = modelToXml((m) => {
            m.title = 'Simple';
            m.states.push(makeState('s1', 'product', { label: 'Material' }));
            m.processOperators.push(makePO('po1', { label: 'Cut' }));
            m.flows.push(makeFlow('s1', 'po1'));
        });

        const result = importXml(xml);
        expect(result.model.states).toHaveLength(1);
        expect(result.model.processOperators).toHaveLength(1);
        expect(result.model.flows).toHaveLength(1);
        expect(result.model.flows[0].sourceRef).toBe('s1');
        expect(result.model.flows[0].targetRef).toBe('po1');
    });

    it('imports all three state types correctly', () => {
        const xml = modelToXml((m) => {
            m.states.push(makeState('p1', 'product'));
            m.states.push(makeState('e1', 'energy'));
            m.states.push(makeState('i1', 'information'));
            m.processOperators.push(makePO('po1'));
            m.flows.push(makeFlow('p1', 'po1'));
            m.flows.push(makeFlow('e1', 'po1'));
            m.flows.push(makeFlow('i1', 'po1'));
        });

        const result = importXml(xml);
        const types = result.model.states.map((s) => s.stateType).sort();
        expect(types).toEqual(['energy', 'information', 'product']);
    });

    it('imports technical resources (usages lost in HSU round-trip)', () => {
        // HSU format stores usage bindings in per-element <usages> (not <flows>),
        // but the importer reconstructs src/tgt only from <flows> exit/entry.
        // So usages are lost in the round-trip — but TRs themselves are preserved.
        const xml = modelToXml((m) => {
            m.states.push(makeState('s1'));
            m.processOperators.push(makePO('po1'));
            m.technicalResources.push(makeTR('tr1', { label: 'Laser' }));
            m.flows.push(makeFlow('s1', 'po1'));
            m.usages.push(makeUsage('po1', 'tr1'));
        });

        const result = importXml(xml);
        expect(result.model.technicalResources).toHaveLength(1);
        expect(result.model.flows).toHaveLength(1);
        // Known limitation: usages don't survive the HSU round-trip
        expect(result.model.usages).toHaveLength(0);
    });

    it('preserves system limit title', () => {
        const xml = modelToXml((m) => {
            m.title = 'Manufacturing Line';
            m.processOperators.push(makePO('po1'));
        });

        const result = importXml(xml);
        expect(result.model.title).toBe('Manufacturing Line');
    });

    it('generates valid FPD source text', () => {
        const xml = modelToXml((m) => {
            m.title = 'Gen Test';
            m.states.push(makeState('s1'));
            m.processOperators.push(makePO('po1'));
            m.flows.push(makeFlow('s1', 'po1'));
        });

        const result = importXml(xml);
        expect(result.source).toContain('@startfpd');
        expect(result.source).toContain('@endfpd');
        expect(result.source).toContain('po1');
    });

    it('handles complex model with multiple POs, states, TRs, and flows', () => {
        const xml = modelToXml((m) => {
            m.title = 'Complex';
            m.states.push(makeState('raw', 'product'));
            m.states.push(makeState('semi', 'product'));
            m.states.push(makeState('done', 'product'));
            m.states.push(makeState('power', 'energy'));
            m.processOperators.push(makePO('cut'));
            m.processOperators.push(makePO('assemble'));
            m.technicalResources.push(makeTR('laser'));
            m.technicalResources.push(makeTR('robot'));
            m.flows.push(makeFlow('raw', 'cut'));
            m.flows.push(makeFlow('cut', 'semi'));
            m.flows.push(makeFlow('semi', 'assemble'));
            m.flows.push(makeFlow('assemble', 'done'));
            m.flows.push(makeFlow('power', 'cut'));
            m.usages.push(makeUsage('cut', 'laser'));
            m.usages.push(makeUsage('assemble', 'robot'));
        });

        const result = importXml(xml);
        expect(result.model.states).toHaveLength(4);
        expect(result.model.processOperators).toHaveLength(2);
        expect(result.model.technicalResources).toHaveLength(2);
        expect(result.model.flows).toHaveLength(5);
        // Usages don't survive HSU round-trip (no entry/exit in <usages>)
        // but all other elements and connections are preserved
    });

    it('usage-only model (no flows) loses usages in HSU round-trip', () => {
        // This documents a known limitation: HSU format stores usage
        // bindings only in per-element <usages> (not <flows>), but the
        // importer reconstructs sources/targets from <flows> exit/entry.
        const xml = modelToXml((m) => {
            m.processOperators.push(makePO('po1'));
            m.technicalResources.push(makeTR('tr1'));
            m.usages.push(makeUsage('po1', 'tr1'));
        });

        const result = importXml(xml);
        expect(result.model.processOperators).toHaveLength(1);
        expect(result.model.technicalResources).toHaveLength(1);
        // Known limitation: usages without flows on the same PO are lost
        expect(result.model.usages).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// XML entity decoding
// ---------------------------------------------------------------------------

describe('importXml entity decoding', () => {
    function hsuStateXml(longName: string): string {
        return (
            '<?xml version="1.0"?><project><states>' +
            '<state stateType="product">' +
            `<identification uniqueIdent="s1" longName="${longName}"/>` +
            '</state></states></project>'
        );
    }

    it('decodes named entities in attributes', () => {
        const result = importXml(hsuStateXml('A &amp; B &lt;ok&gt; &quot;q&quot; &apos;a&apos;'));
        expect(result.model.states[0].label).toBe('A & B <ok> "q" \'a\'');
    });

    it('does not double-decode &amp;lt; (decodes to the literal &lt;)', () => {
        const result = importXml(hsuStateXml('&amp;lt;kept&amp;gt;'));
        expect(result.model.states[0].label).toBe('&lt;kept&gt;');
    });

    it('decodes decimal numeric character references', () => {
        const result = importXml(hsuStateXml('Line1&#10;Line2'));
        expect(result.model.states[0].label).toBe('Line1\nLine2');
    });

    it('decodes hexadecimal numeric character references', () => {
        const result = importXml(hsuStateXml('Dots&#x2026;'));
        expect(result.model.states[0].label).toBe('Dots…');
    });

    it('leaves invalid numeric references untouched', () => {
        const result = importXml(hsuStateXml('Bad&#1114112;Ref'));
        expect(result.model.states[0].label).toBe('Bad&#1114112;Ref');
    });

    it('decodes entities in legacy text content so refs match decoded ids', () => {
        const xml = [
            '<?xml version="1.0"?>',
            '<project>',
            '<systemLimit><identification uniqueIdent="sl1" longName="Legacy"/></systemLimit>',
            '<states>',
            '<state stateType="product">',
            '<identification uniqueIdent="a&amp;b" longName="A &amp; B"/>',
            '</state>',
            '</states>',
            '<processOperators>',
            '<processOperator><identification uniqueIdent="po1" longName="PO"/></processOperator>',
            '</processOperators>',
            '<flowContainer>',
            '<flow id="f1" flowType="flow">',
            '<sourceRef>a&amp;b</sourceRef><targetRef>po1</targetRef>',
            '</flow>',
            '</flowContainer>',
            '</project>',
        ].join('\n');

        const result = importXml(xml);
        expect(result.model.states[0].id).toBe('a&b');
        expect(result.model.flows).toHaveLength(1);
        // The decoded text content matches the decoded attribute-derived id
        expect(result.model.flows[0].sourceRef).toBe('a&b');
        expect(result.model.flows[0].targetRef).toBe('po1');
    });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('importXml error handling', () => {
    it('throws on empty XML', () => {
        expect(() => importXml('')).toThrow(/Invalid XML/);
    });

    it('throws on XML with no root element', () => {
        expect(() => importXml('<?xml version="1.0"?>')).toThrow(/Invalid XML/);
    });

    it('does not throw on well-formed but minimal XML (no elements)', () => {
        const xml =
            "<?xml version='1.0'?><fpb:project xmlns:fpb='http://www.vdivde.de/3682'></fpb:project>";
        const result = importXml(xml);
        expect(result.model.states).toHaveLength(0);
        expect(result.model.processOperators).toHaveLength(0);
    });

    it('rejects pathologically deep nesting quickly instead of hanging', () => {
        // Without the depth guard this ~12 KB payload pins the event loop for
        // seconds (the recursive parser is super-linear in nesting depth).
        const depth = 3000;
        const payload = '<a>'.repeat(depth) + 'x' + '</a>'.repeat(depth);
        const start = performance.now();
        expect(() => importXml(payload)).toThrow(/nesting too deep/);
        expect(performance.now() - start).toBeLessThan(1000);
    });

    it('accepts documents nested within the depth limit', () => {
        const depth = 30; // well under MAX_XML_DEPTH, deeper than any real FPD
        const xml =
            "<?xml version='1.0'?>" +
            '<fpb:project xmlns:fpb="http://www.vdivde.de/3682">' +
            '<a>'.repeat(depth) +
            '</a>'.repeat(depth) +
            '</fpb:project>';
        expect(() => importXml(xml)).not.toThrow();
    });
});
