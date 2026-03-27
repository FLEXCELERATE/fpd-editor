import { describe, it, expect } from 'vitest';
import { validateConnections } from '../validator';
import { createProcessModel } from '../../models/processModel';
import type { State, ProcessOperator, TechnicalResource, Flow, Usage, SystemLimit } from '../../models/fpdModel';

function makeState(id: string, systemId?: string): State {
    return {
        id,
        stateType: 'product',
        identification: { uniqueIdent: id, longName: id },
        label: id,
        systemId,
    };
}

function makePO(id: string, systemId?: string): ProcessOperator {
    return {
        id,
        identification: { uniqueIdent: id, longName: id },
        label: id,
        systemId,
    };
}

function makeTR(id: string, systemId?: string): TechnicalResource {
    return {
        id,
        identification: { uniqueIdent: id, longName: id },
        label: id,
        systemId,
    };
}

function makeFlow(id: string, sourceRef: string, targetRef: string, systemId?: string): Flow {
    return { id, sourceRef, targetRef, flowType: 'flow', systemId };
}

function makeUsage(id: string, poRef: string, trRef: string, systemId?: string): Usage {
    return { id, processOperatorRef: poRef, technicalResourceRef: trRef, systemId };
}

function makeSystem(id: string, label: string): SystemLimit {
    return { id, identification: { uniqueIdent: id, longName: label }, label };
}

describe('validateConnections', () => {
    it('returns no errors for an empty model', () => {
        const model = createProcessModel();
        const errors = validateConnections(model);
        expect(errors).toHaveLength(0);
    });

    it('accepts State -> ProcessOperator flow', () => {
        const model = createProcessModel();
        model.states.push(makeState('s1'));
        model.processOperators.push(makePO('po1'));
        model.flows.push(makeFlow('f1', 's1', 'po1'));
        const errors = validateConnections(model);
        expect(errors).toHaveLength(0);
    });

    it('accepts ProcessOperator -> State flow', () => {
        const model = createProcessModel();
        model.processOperators.push(makePO('po1'));
        model.states.push(makeState('s1'));
        model.flows.push(makeFlow('f1', 'po1', 's1'));
        const errors = validateConnections(model);
        expect(errors).toHaveLength(0);
    });

    it('rejects State -> State within same system', () => {
        const model = createProcessModel();
        model.systemLimits.push(makeSystem('sys1', 'System 1'));
        model.states.push(makeState('s1', 'sys1'));
        model.states.push(makeState('s2', 'sys1'));
        model.flows.push(makeFlow('f1', 's1', 's2', 'sys1'));
        const errors = validateConnections(model);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.includes('State -> State'))).toBe(true);
    });

    it('accepts State -> State cross-system (outside system block)', () => {
        const model = createProcessModel();
        model.systemLimits.push(makeSystem('sys1', 'System 1'));
        model.systemLimits.push(makeSystem('sys2', 'System 2'));
        model.states.push(makeState('s1', 'sys1'));
        model.states.push(makeState('s2', 'sys2'));
        // systemId undefined means the flow is declared outside a system block
        model.flows.push(makeFlow('f1', 's1', 's2', undefined));
        const errors = validateConnections(model);
        expect(errors).toHaveLength(0);
    });

    it('rejects ProcessOperator -> TechnicalResource flow', () => {
        const model = createProcessModel();
        model.processOperators.push(makePO('po1'));
        model.technicalResources.push(makeTR('tr1'));
        model.flows.push(makeFlow('f1', 'po1', 'tr1'));
        const errors = validateConnections(model);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.includes('invalid connection'))).toBe(true);
    });

    it('reports duplicate flow', () => {
        const model = createProcessModel();
        model.states.push(makeState('s1'));
        model.processOperators.push(makePO('po1'));
        model.flows.push(makeFlow('f1', 's1', 'po1'));
        model.flows.push(makeFlow('f2', 's1', 'po1'));
        const errors = validateConnections(model);
        expect(errors.some(e => e.includes('duplicate connection'))).toBe(true);
    });

    it('accepts usage between ProcessOperator and TechnicalResource', () => {
        const model = createProcessModel();
        model.processOperators.push(makePO('po1'));
        model.technicalResources.push(makeTR('tr1'));
        model.usages.push(makeUsage('u1', 'po1', 'tr1'));
        const errors = validateConnections(model);
        expect(errors).toHaveLength(0);
    });

    it('rejects usage with wrong types', () => {
        const model = createProcessModel();
        model.states.push(makeState('s1'));
        model.technicalResources.push(makeTR('tr1'));
        model.usages.push(makeUsage('u1', 's1', 'tr1'));
        const errors = validateConnections(model);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.includes('is not a ProcessOperator'))).toBe(true);
    });

    it('rejects cross-system usage', () => {
        const model = createProcessModel();
        model.systemLimits.push(makeSystem('sys1', 'System 1'));
        model.systemLimits.push(makeSystem('sys2', 'System 2'));
        model.processOperators.push(makePO('po1', 'sys1'));
        model.technicalResources.push(makeTR('tr1', 'sys2'));
        model.usages.push(makeUsage('u1', 'po1', 'tr1'));
        const errors = validateConnections(model);
        expect(errors.some(e => e.includes('cross-system reference'))).toBe(true);
    });

    it('reports duplicate usage', () => {
        const model = createProcessModel();
        model.processOperators.push(makePO('po1'));
        model.technicalResources.push(makeTR('tr1'));
        model.usages.push(makeUsage('u1', 'po1', 'tr1'));
        model.usages.push(makeUsage('u2', 'po1', 'tr1'));
        const errors = validateConnections(model);
        expect(errors.some(e => e.includes('duplicate usage'))).toBe(true);
    });
});
