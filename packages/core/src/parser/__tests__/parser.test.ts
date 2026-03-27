import { describe, it, expect } from 'vitest';
import { FpdParser } from '../parser';

function parse(source: string) {
    return new FpdParser(source).parse();
}

describe('FpdParser', () => {
    it('parses minimal valid FPD to an empty model with no errors', () => {
        const model = parse('@startfpd\n@endfpd');
        expect(model.errors).toHaveLength(0);
        expect(model.states).toHaveLength(0);
        expect(model.flows).toHaveLength(0);
    });

    it('parses title', () => {
        const model = parse('@startfpd\ntitle "My Process"\n@endfpd');
        expect(model.title).toBe('My Process');
        expect(model.errors).toHaveLength(0);
    });

    it('parses product element declaration', () => {
        const model = parse('@startfpd\nproduct p1 "Product One"\n@endfpd');
        expect(model.states).toHaveLength(1);
        expect(model.states[0].id).toBe('p1');
        expect(model.states[0].stateType).toBe('product');
        expect(model.states[0].label).toBe('Product One');
        expect(model.errors).toHaveLength(0);
    });

    it('parses energy element declaration', () => {
        const model = parse('@startfpd\nenergy e1 "Energy One"\n@endfpd');
        expect(model.states).toHaveLength(1);
        expect(model.states[0].stateType).toBe('energy');
    });

    it('parses information element declaration', () => {
        const model = parse('@startfpd\ninformation i1\n@endfpd');
        expect(model.states).toHaveLength(1);
        expect(model.states[0].stateType).toBe('information');
    });

    it('parses process_operator element declaration', () => {
        const model = parse('@startfpd\nprocess_operator po1 "Operator"\n@endfpd');
        expect(model.processOperators).toHaveLength(1);
        expect(model.processOperators[0].id).toBe('po1');
        expect(model.processOperators[0].label).toBe('Operator');
    });

    it('parses technical_resource element declaration', () => {
        const model = parse('@startfpd\ntechnical_resource tr1 "Resource"\n@endfpd');
        expect(model.technicalResources).toHaveLength(1);
        expect(model.technicalResources[0].id).toBe('tr1');
        expect(model.technicalResources[0].label).toBe('Resource');
    });

    it('uses string literal as label', () => {
        const model = parse('@startfpd\nproduct p1 "Custom Label"\n@endfpd');
        expect(model.states[0].label).toBe('Custom Label');
    });

    it('defaults label to id when no string given', () => {
        const model = parse('@startfpd\nproduct p1\n@endfpd');
        expect(model.states[0].label).toBe('p1');
    });

    it('reports error on duplicate element ID', () => {
        const model = parse('@startfpd\nproduct p1\nproduct p1\n@endfpd');
        expect(model.errors.length).toBeGreaterThan(0);
        expect(model.errors.some(e => e.includes('Duplicate element ID'))).toBe(true);
    });

    it('parses flow connections (-->) into model.flows', () => {
        const model = parse('@startfpd\nproduct s1\nprocess_operator po1\ns1 --> po1\n@endfpd');
        expect(model.flows).toHaveLength(1);
        expect(model.flows[0].sourceRef).toBe('s1');
        expect(model.flows[0].targetRef).toBe('po1');
        expect(model.flows[0].flowType).toBe('flow');
    });

    it('parses alternative flow connections (-.->) into model.flows', () => {
        const model = parse('@startfpd\nproduct s1\nprocess_operator po1\ns1 -.-> po1\n@endfpd');
        expect(model.flows).toHaveLength(1);
        expect(model.flows[0].flowType).toBe('alternativeFlow');
    });

    it('parses parallel flow connections (==>) into model.flows', () => {
        const model = parse('@startfpd\nproduct s1\nprocess_operator po1\ns1 ==> po1\n@endfpd');
        expect(model.flows).toHaveLength(1);
        expect(model.flows[0].flowType).toBe('parallelFlow');
    });

    it('parses usage connections (<..>) into model.usages', () => {
        const model = parse('@startfpd\nprocess_operator po1\ntechnical_resource tr1\npo1 <..> tr1\n@endfpd');
        expect(model.usages).toHaveLength(1);
        expect(model.usages[0].processOperatorRef).toBe('po1');
        expect(model.usages[0].technicalResourceRef).toBe('tr1');
    });

    it('reports error for undefined element in connection', () => {
        const model = parse('@startfpd\nproduct s1\ns1 --> unknown\n@endfpd');
        expect(model.errors.some(e => e.includes("'unknown' is not defined"))).toBe(true);
    });

    it('parses system blocks into model.systemLimits', () => {
        const model = parse('@startfpd\nsystem "My System" {\n}\n@endfpd');
        expect(model.systemLimits).toHaveLength(1);
        expect(model.systemLimits[0].label).toBe('My System');
    });

    it('assigns systemId to elements inside system blocks', () => {
        const model = parse('@startfpd\nsystem "Sys" {\nproduct p1\nprocess_operator po1\n}\n@endfpd');
        expect(model.states[0].systemId).toBeDefined();
        expect(model.processOperators[0].systemId).toBeDefined();
        expect(model.states[0].systemId).toBe(model.processOperators[0].systemId);
    });

    it('handles elements in system and connections outside', () => {
        const src = [
            '@startfpd',
            'system "Sys" {',
            '  product s1',
            '  process_operator po1',
            '}',
            's1 --> po1',
            '@endfpd',
        ].join('\n');
        const model = parse(src);
        expect(model.states).toHaveLength(1);
        expect(model.processOperators).toHaveLength(1);
        expect(model.flows).toHaveLength(1);
        expect(model.flows[0].systemId).toBeUndefined();
        expect(model.errors).toHaveLength(0);
    });

    it('reports error for missing @startfpd', () => {
        const model = parse('product p1\n@endfpd');
        expect(model.errors.length).toBeGreaterThan(0);
        expect(model.errors.some(e => e.includes('Expected START_FPD'))).toBe(true);
    });

    it('reports error for missing @endfpd but model is still valid', () => {
        const model = parse('@startfpd\nproduct p1');
        expect(model.errors.some(e => e.includes('Missing @endfpd'))).toBe(true);
        // Model still has the parsed element
        expect(model.states).toHaveLength(1);
    });

    it('sets placement annotation on states', () => {
        const model = parse('@startfpd\nproduct p1 @boundary\n@endfpd');
        expect(model.states[0].placement).toBe('boundary');
        expect(model.errors).toHaveLength(0);
    });

    it('warns when placement annotation is used on non-state element', () => {
        const model = parse('@startfpd\nprocess_operator po1 @boundary\n@endfpd');
        expect(model.warnings.length).toBeGreaterThan(0);
        expect(model.warnings.some(w => w.includes('ignored'))).toBe(true);
    });

    it('skips comments', () => {
        const model = parse('@startfpd\n// this is a comment\nproduct p1\n@endfpd');
        expect(model.states).toHaveLength(1);
        expect(model.errors).toHaveLength(0);
    });

    it('reports error for empty source', () => {
        const model = parse('');
        expect(model.errors.length).toBeGreaterThan(0);
    });
});
