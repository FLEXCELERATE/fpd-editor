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

function exportElementsForSystem(
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

    if (lines.length > 0) {
        lines.push('');
    }

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

export function exportText(model: ProcessModel): string {
    const lines: string[] = [];
    lines.push('@startfpd');

    if (model.title) {
        lines.push(`title "${escapeLabel(model.title)}"`);
    }

    lines.push('');

    if (model.systemLimits.length > 0) {
        // Multi-system export: wrap elements in system blocks
        for (const sl of model.systemLimits) {
            lines.push(`system "${escapeLabel(sl.label)}" {`);
            const systemLines = exportElementsForSystem(model, sl.id, '  ');
            lines.push(...systemLines);
            lines.push('}');
            lines.push('');
        }

        // Cross-system connections (flows with systemId undefined)
        const crossFlows = model.flows.filter((f) => f.systemId === undefined);
        if (crossFlows.length > 0) {
            for (const flow of crossFlows) {
                const flowType = flow.flowType || 'flow';
                const operator = FLOW_TYPE_OPERATORS[flowType] || '-->';
                lines.push(`${flow.sourceRef} ${operator} ${flow.targetRef}`);
            }
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
