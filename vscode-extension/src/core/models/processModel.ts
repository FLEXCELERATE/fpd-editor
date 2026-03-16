/** Container model for a complete VDI 3682 process description. */

import {
    Flow,
    ProcessOperator,
    State,
    SystemLimit,
    TechnicalResource,
    Usage,
} from './fpdModel';

export interface ProcessModel {
    title: string;
    systemLimits: SystemLimit[];
    states: State[];
    processOperators: ProcessOperator[];
    technicalResources: TechnicalResource[];
    flows: Flow[];
    usages: Usage[];
    errors: string[];
    warnings: string[];
}

export function createProcessModel(): ProcessModel {
    return {
        title: 'Untitled Process',
        systemLimits: [],
        states: [],
        processOperators: [],
        technicalResources: [],
        flows: [],
        usages: [],
        errors: [],
        warnings: [],
    };
}
