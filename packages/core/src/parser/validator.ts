/** VDI 3682 connection rule validation for Formalized Process Descriptions. */

import { ProcessModel } from '../models/processModel';

type ElementCategory = 'state' | 'process_operator' | 'technical_resource';

function classifyElement(elementId: string, model: ProcessModel): ElementCategory | null {
    for (const s of model.states) {
        if (s.id === elementId) { return 'state'; }
    }
    for (const po of model.processOperators) {
        if (po.id === elementId) { return 'process_operator'; }
    }
    for (const tr of model.technicalResources) {
        if (tr.id === elementId) { return 'technical_resource'; }
    }
    return null;
}

function getSystemId(elementId: string, model: ProcessModel): string | undefined {
    for (const s of model.states) {
        if (s.id === elementId) { return s.systemId; }
    }
    for (const po of model.processOperators) {
        if (po.id === elementId) { return po.systemId; }
    }
    for (const tr of model.technicalResources) {
        if (tr.id === elementId) { return tr.systemId; }
    }
    return undefined;
}

export function validateConnections(model: ProcessModel): string[] {
    const errors: string[] = [];

    // Track seen flow connections for duplicate detection
    const seenFlows = new Set<string>();

    for (const flow of model.flows) {
        const sourceType = classifyElement(flow.sourceRef, model);
        const targetType = classifyElement(flow.targetRef, model);

        // Check references exist
        if (sourceType === null) {
            errors.push(`Flow '${flow.id}': source '${flow.sourceRef}' not found`);
            continue;
        }
        if (targetType === null) {
            errors.push(`Flow '${flow.id}': target '${flow.targetRef}' not found`);
            continue;
        }

        // Check for duplicate flows
        const pair = `${flow.sourceRef}:${flow.targetRef}`;
        if (seenFlows.has(pair)) {
            errors.push(
                `Flow '${flow.id}': duplicate connection from ` +
                `'${flow.sourceRef}' to '${flow.targetRef}'`
            );
        } else {
            seenFlows.add(pair);
        }

        // Validate source-target pairs for flows
        let valid = false;
        if (sourceType === 'state' && targetType === 'state') {
            // State -> State: only allowed as cross-system connection
            const sourceSys = getSystemId(flow.sourceRef, model);
            const targetSys = getSystemId(flow.targetRef, model);
            if (flow.systemId === undefined && sourceSys !== targetSys && sourceSys !== undefined && targetSys !== undefined) {
                valid = true;
            } else {
                errors.push(
                    `Flow '${flow.id}': State -> State connection from ` +
                    `'${flow.sourceRef}' to '${flow.targetRef}' is only allowed ` +
                    `as a cross-system connection (outside system blocks, ` +
                    `between states in different systems)`
                );
                continue;
            }
        } else if (sourceType === 'state' && targetType === 'process_operator') {
            valid = true;
        } else if (sourceType === 'process_operator' && targetType === 'state') {
            valid = true;
        }

        if (!valid) {
            errors.push(
                `Flow '${flow.id}': invalid connection from ` +
                `${sourceType} '${flow.sourceRef}' to ` +
                `${targetType} '${flow.targetRef}'. ` +
                `Flows must connect State <-> ProcessOperator`
            );
            continue;
        }

        // Check for cross-system State <-> ProcessOperator flows
        if (model.systemLimits.length > 0 && (
            (sourceType === 'state' && targetType === 'process_operator') ||
            (sourceType === 'process_operator' && targetType === 'state')
        )) {
            const sourceSys = getSystemId(flow.sourceRef, model);
            const targetSys = getSystemId(flow.targetRef, model);
            if (sourceSys !== undefined && targetSys !== undefined && sourceSys !== targetSys) {
                errors.push(
                    `Flow '${flow.id}': cross-system reference from ` +
                    `'${flow.sourceRef}' (system '${sourceSys}') to ` +
                    `'${flow.targetRef}' (system '${targetSys}'). ` +
                    `Use State -> State connections for cross-system linking`
                );
            }
        }
    }

    // Validate usages
    const seenUsages = new Set<string>();

    for (const usage of model.usages) {
        const poType = classifyElement(usage.processOperatorRef, model);
        const trType = classifyElement(usage.technicalResourceRef, model);

        if (poType === null) {
            errors.push(
                `Usage '${usage.id}': process operator ` +
                `'${usage.processOperatorRef}' not found`
            );
            continue;
        }
        if (trType === null) {
            errors.push(
                `Usage '${usage.id}': technical resource ` +
                `'${usage.technicalResourceRef}' not found`
            );
            continue;
        }

        if (poType !== 'process_operator') {
            errors.push(
                `Usage '${usage.id}': '${usage.processOperatorRef}' ` +
                `is not a ProcessOperator`
            );
        }
        if (trType !== 'technical_resource') {
            errors.push(
                `Usage '${usage.id}': '${usage.technicalResourceRef}' ` +
                `is not a TechnicalResource`
            );
        }

        // Check for cross-system usages
        if (model.systemLimits.length > 0) {
            const poSys = getSystemId(usage.processOperatorRef, model);
            const trSys = getSystemId(usage.technicalResourceRef, model);
            if (poSys !== undefined && trSys !== undefined && poSys !== trSys) {
                errors.push(
                    `Usage '${usage.id}': cross-system reference between ` +
                    `'${usage.processOperatorRef}' (system '${poSys}') and ` +
                    `'${usage.technicalResourceRef}' (system '${trSys}'). ` +
                    `TechnicalResources must belong to the same system as ` +
                    `their ProcessOperator`
                );
            }
        }

        // Check for duplicate usages
        const uPair = `${usage.processOperatorRef}:${usage.technicalResourceRef}`;
        if (seenUsages.has(uPair)) {
            errors.push(
                `Usage '${usage.id}': duplicate usage between ` +
                `'${usage.processOperatorRef}' and ` +
                `'${usage.technicalResourceRef}'`
            );
        } else {
            seenUsages.add(uPair);
        }
    }

    return errors;
}
