/** Text exporter that converts ProcessModel back to FPD text syntax. */

import { StateType } from '../models/fpdModel';
import { ProcessModel } from '../models/processModel';

const FLOW_TYPE_OPERATORS: Record<string, string> = {
    flow: '-->',
    alternativeFlow: '-.->',
    parallelFlow: '==>',
};

const STATE_TYPE_KEYWORDS: Record<string, string> = {
    product: 'product',
    energy: 'energy',
    information: 'information',
};

function escapeLabel(label: string): string {
    return label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function exportStateLine(
    state: { id: string; label: string; placement?: string },
    keyword: string,
): string {
    const label = state.label || state.id;
    let line = `${keyword} ${state.id} "${escapeLabel(label)}"`;
    if (state.placement !== undefined) {
        line += ` @${state.placement}`;
    }
    return line;
}

/** Element declarations belonging to one system (or to none, for `undefined`). */
function exportDeclarations(
    model: ProcessModel,
    systemId: string | undefined,
    indent: string,
): string[] {
    const lines: string[] = [];

    // States grouped by type
    const stateTypes: StateType[] = ['product', 'energy', 'information'];
    for (const stateType of stateTypes) {
        const keyword = STATE_TYPE_KEYWORDS[stateType];
        for (const state of model.states) {
            if (state.stateType === stateType && state.systemId === systemId) {
                lines.push(indent + exportStateLine(state, keyword));
            }
        }
    }

    // Process operators
    for (const po of model.processOperators) {
        if (po.systemId === systemId) {
            const label = po.label || po.id;
            lines.push(`${indent}process_operator ${po.id} "${escapeLabel(label)}"`);
        }
    }

    // Technical resources
    for (const tr of model.technicalResources) {
        if (tr.systemId === systemId) {
            const label = tr.label || tr.id;
            lines.push(`${indent}technical_resource ${tr.id} "${escapeLabel(label)}"`);
        }
    }

    return lines;
}

/** Flows and usages belonging to one system (or to none, for `undefined`). */
function exportConnections(
    model: ProcessModel,
    systemId: string | undefined,
    indent: string,
): string[] {
    const lines: string[] = [];

    // Flows
    for (const flow of model.flows) {
        if (flow.systemId === systemId) {
            const flowType = flow.flowType || 'flow';
            const operator = FLOW_TYPE_OPERATORS[flowType] || '-->';
            lines.push(`${indent}${flow.sourceRef} ${operator} ${flow.targetRef}`);
        }
    }

    // Usages
    for (const usage of model.usages) {
        if (usage.systemId === systemId) {
            lines.push(`${indent}${usage.processOperatorRef} <..> ${usage.technicalResourceRef}`);
        }
    }

    return lines;
}

function exportElementsForSystem(
    model: ProcessModel,
    systemId: string | undefined,
    indent: string,
): string[] {
    const declarations = exportDeclarations(model, systemId, indent);
    const connections = exportConnections(model, systemId, indent);
    if (declarations.length > 0 && connections.length > 0) {
        return [...declarations, '', ...connections];
    }
    return [...declarations, ...connections];
}

export function exportText(model: ProcessModel): string {
    const lines: string[] = [];
    lines.push('@startfpd');

    if (model.title) {
        lines.push(`title "${escapeLabel(model.title)}"`);
    }

    lines.push('');

    if (model.systemLimits.length > 0) {
        // Multi-system export: wrap elements in system blocks.
        //
        // Elements that belong to no system are written at the top level. They
        // used to be dropped here — only cross-system *flows* were emitted — so
        // exporting a document whose states sit outside a system block silently
        // destroyed it: the declarations vanished, and re-reading the file then
        // dropped the flows that referenced them too. Declarations come first so
        // the system blocks below can refer to them.
        const looseDeclarations = exportDeclarations(model, undefined, '');
        if (looseDeclarations.length > 0) {
            lines.push(...looseDeclarations);
            lines.push('');
        }

        for (const sl of model.systemLimits) {
            lines.push(`system "${escapeLabel(sl.label)}" {`);
            const systemLines = exportElementsForSystem(model, sl.id, '  ');
            lines.push(...systemLines);
            lines.push('}');
            lines.push('');
        }

        // Cross-system flows and usages.
        const looseConnections = exportConnections(model, undefined, '');
        if (looseConnections.length > 0) {
            lines.push(...looseConnections);
            lines.push('');
        }
    } else {
        // Flat export (no systems)
        const flatLines = exportElementsForSystem(model, undefined, '');
        lines.push(...flatLines);
        lines.push('');
    }

    lines.push('@endfpd');
    lines.push('');

    return lines.join('\n');
}
