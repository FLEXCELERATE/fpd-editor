/** TypeScript type definitions matching backend VDI 3682 Pydantic models. */

export enum StateType {
  PRODUCT = "product",
  ENERGY = "energy",
  INFORMATION = "information",
}

export enum FlowType {
  FLOW = "flow",
  ALTERNATIVE_FLOW = "alternativeFlow",
  PARALLEL_FLOW = "parallelFlow",
}

export interface Identification {
  unique_ident: string;
  long_name: string | null;
  short_name: string | null;
}

export type StatePlacement =
  | "boundary"
  | "boundary-top"
  | "boundary-bottom"
  | "boundary-left"
  | "boundary-right"
  | "internal";

export interface State {
  id: string;
  state_type: StateType;
  identification: Identification;
  label: string;
  placement?: StatePlacement | null;
  line_number?: number;
  system_id?: string;
}

export interface ProcessOperator {
  id: string;
  identification: Identification;
  label: string;
  line_number?: number;
  system_id?: string;
}

export interface TechnicalResource {
  id: string;
  identification: Identification;
  label: string;
  line_number?: number;
  system_id?: string;
}

export interface Flow {
  id: string;
  source_ref: string;
  target_ref: string;
  flow_type: FlowType;
  line_number?: number;
  system_id?: string;
}

export interface Usage {
  id: string;
  process_operator_ref: string;
  technical_resource_ref: string;
  line_number?: number;
  system_id?: string;
}

export interface SystemLimit {
  id: string;
  identification: Identification;
  label: string;
  line_number?: number;
}

export interface ProcessModel {
  title: string;
  system_limits: SystemLimit[];
  states: State[];
  process_operators: ProcessOperator[];
  technical_resources: TechnicalResource[];
  flows: Flow[];
  usages: Usage[];
  errors: string[];
  warnings: string[];
}
