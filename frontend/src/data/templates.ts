/** Template data structure for FPB text examples. */

export interface FpbTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

/** Curated library of FPB text templates for common VDI 3682 process patterns. */
export const templates: FpbTemplate[] = [
  {
    id: 'minimal',
    name: 'Minimal Process',
    description: 'Single process operator - the simplest valid FPB diagram',
    content: `@startfpb
title "Minimal Process"

// Minimal example: one process operator
// A process operator represents a transformation or operation
process_operator PO1 "Basic Operation"

@endfpb
`,
  },
  {
    id: 'basic-flow',
    name: 'Basic Flow',
    description: 'Linear chain of product transformations through process operators',
    content: `@startfpb
title "Basic Linear Flow"

// Declare products (materials, goods, or workpieces)
product P1 "Raw Material"
product P2 "Intermediate Product"
product P3 "Final Product"

// Declare process operators (transformations)
process_operator PO1 "Preparation"
process_operator PO2 "Assembly"

// Basic flow connections using --> operator
// Products flow into and out of process operators
P1 --> PO1
PO1 --> P2
P2 --> PO2
PO2 --> P3

@endfpb
`,
  },
  {
    id: 'parallel-flows',
    name: 'Parallel Flows',
    description: 'Process with parallel execution paths using the parallel flow operator',
    content: `@startfpb
title "Parallel Processing"

// Input products
product P1 "Input Material"
product P1A "Branch A Input"
product P1B "Branch B Input"
product P2 "Parallel Output A"
product P3 "Parallel Output B"
product P4 "Merged Result"

// Process operators
process_operator PO1 "Split Operation"
process_operator PO2 "Process Branch A"
process_operator PO3 "Process Branch B"
process_operator PO4 "Merge Operation"

// Parallel flows using ==> operator
// The split operator sends outputs to parallel branches
P1 --> PO1
PO1 ==> P1A
PO1 ==> P1B
P1A --> PO2
P1B --> PO3
PO2 --> P2
PO3 --> P3

// Branches merge back together
P2 --> PO4
P3 --> PO4
PO4 --> P4

@endfpb
`,
  },
  {
    id: 'alternative-flows',
    name: 'Alternative Flows',
    description: 'Process with conditional paths using the alternative flow operator',
    content: `@startfpb
title "Alternative Process Paths"

// Input and output products
product P1 "Input Material"
product P1A "Processed Material"
product P2 "Quality Pass Output"
product P2A "Quality Fail Material"
product P3 "Rework Output"

// Process operators
process_operator PO1 "Processing"
process_operator PO2 "Quality Check"
process_operator PO3 "Rework"

// Basic flow through processing
P1 --> PO1
PO1 --> P1A
P1A --> PO2

// Alternative flows using -.-> operator
// Represents decision points or conditional routing
PO2 -.-> P2           // Quality pass path (alternative)
PO2 -.-> P2A          // Quality fail path (alternative)
P2A --> PO3           // Send to rework
PO3 --> P3            // Rework output

@endfpb
`,
  },
  {
    id: 'multi-process',
    name: 'Multi-Process System',
    description: 'Multiple process operators with energy and technical resources',
    content: `@startfpb
title "Multi-Process Manufacturing"

// Products at each stage
product P1 "Raw Components"
product P2 "Machined Parts"
product P3 "Assembled Unit"
product P4 "Tested Product"

// Energy inputs for operations
energy E1 "Electrical Power"
energy E2 "Compressed Air"

// Process operators for each stage
process_operator PO1 "Machining"
process_operator PO2 "Assembly"
process_operator PO3 "Testing"

// Technical resources (machines/equipment)
technical_resource TR1 "CNC Machine"
technical_resource TR2 "Assembly Station"
technical_resource TR3 "Test Equipment"

// Process flow with products
P1 --> PO1
PO1 --> P2
P2 --> PO2
PO2 --> P3
P3 --> PO3
PO3 --> P4

// Energy connections
E1 --> PO1
E1 --> PO2
E2 --> PO3

// Technical resource usage with <..> operator
// Links process operators to their required equipment
PO1 <..> TR1
PO2 <..> TR2
PO3 <..> TR3

@endfpb
`,
  },
  {
    id: 'full-example',
    name: 'Complete VDI 3682 Example',
    description: 'Comprehensive example demonstrating all VDI 3682 element types and connection operators',
    content: `@startfpb
title "Complete VDI 3682 Process Model"

// === Products (materials, goods, workpieces) ===
product P1 "Raw Material Input"
product P1A "Raw Material for Fabrication"
product P2 "Preprocessed Material"
product P3 "Main Component"
product P4 "Auxiliary Component"
product P5 "Assembled Product"
product P6 "Quality Approved Output"
product P6A "Quality Failed Material"
product P7 "Rejected Items"

// === Energy (power, heat, cooling, etc.) ===
energy E1 "Electrical Power"
energy E2 "Hydraulic Pressure"
energy E3 "Cooling Water"

// === Information (data, signals, control commands) ===
information I1 "Process Parameters"
information I2 "Quality Data"

// === Process Operators (transformations, operations) ===
process_operator PO1 "Preprocessing"
process_operator PO2 "Main Processing"
process_operator PO3 "Component Fabrication"
process_operator PO4 "Assembly"
process_operator PO5 "Quality Inspection"
process_operator PO6 "Rework"

// === Technical Resources (machines, tools, equipment) ===
technical_resource TR1 "Preprocessing Unit"
technical_resource TR2 "Main Manufacturing Cell"
technical_resource TR3 "Fabrication Station"
technical_resource TR4 "Assembly Robot"
technical_resource TR5 "Inspection System"

// === Basic Flows (-->) ===
// Main process flow with parallel fabrication
P1 --> PO1
PO1 ==> P2
PO1 ==> P1A
P2 --> PO2
PO2 --> P3

// Parallel component fabrication branch
P1A --> PO3
PO3 --> P4

// Assembly of components
P3 --> PO4
P4 --> PO4
PO4 --> P5

// Quality inspection
P5 --> PO5

// === Alternative Flows (-.->)  ===
// Quality pass/fail routing
PO5 -.-> P6           // Pass: to output (alternative)
PO5 -.-> P6A          // Fail: to rework (alternative)
P6A --> PO6           // Send to rework
PO6 --> P7            // Rework reject output

// === Energy Flows ===
E1 --> PO1
E1 --> PO2
E2 --> PO3
E1 --> PO4
E3 --> PO5

// === Information Flows ===
I1 --> PO2
I2 --> PO5

// === Technical Resource Usage (<..>) ===
// Links operators to equipment they require
PO1 <..> TR1
PO2 <..> TR2
PO3 <..> TR3
PO4 <..> TR4
PO5 <..> TR5

@endfpb
`,
  },
];

/** Get a template by its ID. */
export function getTemplateById(id: string): FpbTemplate | undefined {
  return templates.find((t) => t.id === id);
}

/** Get all template IDs. */
export function getTemplateIds(): string[] {
  return templates.map((t) => t.id);
}
