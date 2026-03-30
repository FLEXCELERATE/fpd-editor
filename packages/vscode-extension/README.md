# FPD Language Support for VS Code

> Language support for FPD (Formalized Process Description, VDI 3682) — a text-first approach to process engineering diagrams.

[![Version](https://img.shields.io/visual-studio-marketplace/v/FLEXCELERATE.fpd-vscode-extension)](https://marketplace.visualstudio.com/items?itemName=FLEXCELERATE.fpd-vscode-extension)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-green.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

## Features

### Syntax Highlighting
Rich syntax highlighting for `.fpd` files with TextMate grammar support:
- **Keywords**: `product`, `energy`, `information`, `process_operator`, `technical_resource`, `system`, `title`
- **Operators**: `-->` (flow), `-.->` (alternative flow), `==>` (parallel flow), `<..>` (usage)
- **Annotations**: `@boundary`, `@internal`
- **Block delimiters**: `@startfpd`, `@endfpd`
- **Comments**: `//` line comments
- **Strings**: Double-quoted labels

### IntelliSense & Autocompletion
Smart autocompletion as you type:
- Element type keywords with snippets
- Connection operators after identifiers
- Automatic snippet expansion with placeholders
- Context-aware suggestions

### Real-time Diagnostics
Instant error detection with red squiggly underlines:
- Syntax validation
- Connection type rules (e.g., products cannot connect directly to products)
- Missing or duplicate declarations
- Invalid operator usage

### Live Diagram Preview
Side-by-side diagram preview that updates as you type:
- Real-time SVG rendering
- Auto-update on document changes (configurable debounce)
- Visual representation of all element types
- Support for flow, energy, information, and technical connections
- **Hover tooltips** showing element type and ID
- **Double-click to navigate** to the corresponding source line
- Theme-aware styling

### Export Commands
Export your diagrams in multiple formats via Command Palette (`Ctrl+Shift+P`):
- **FPD: Export SVG** — Scalable vector graphics
- **FPD: Export VDI 3682 XML** — Structured VDI 3682 XML format
- **FPD: Export FPD Text** — Plain `.fpd` text file

## Installation

### From VS Code Marketplace (recommended)

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **"FPD"** by FLEXCELERATE
4. Click **Install**

### From VSIX File

1. Download the latest `.vsix` file from the [releases page](https://github.com/FLEXCELERATE/fpd-editor/releases)
2. Open VS Code
3. Press `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
4. Select the downloaded `.vsix` file

### Prerequisites

No external dependencies required. The extension runs entirely in TypeScript within VS Code.

## Getting Started

### 1. Create Your First FPD File

Create a new file with `.fpd` extension:

```fpd
@startfpd
title "My First Process"

product P1 "Raw Material"
process_operator OP1 "Processing"
product P2 "Final Product"
energy E1 "Heat"
information I1 "Recipe"
technical_resource T1 "Equipment"

P1 --> OP1
OP1 --> P2
E1 ==> OP1
I1 -.-> OP1
T1 <..> OP1

@endfpd
```

### 2. View the Diagram

Click the preview icon in the editor toolbar or press `Ctrl+Shift+P` and run:
```
FPD: Show Preview
```

The diagram preview will open in a side panel and update automatically as you type.

### 3. Export Your Diagram

Press `Ctrl+Shift+P` and run one of the export commands (SVG, XML, or Text).

## FPD Language Syntax

### Element Types

| Keyword | Description | Example |
|---------|-------------|---------|
| `product` | Material or immaterial goods | `product P1 "Water"` |
| `energy` | Energy flow | `energy E1 "Electricity"` |
| `information` | Information flow | `information I1 "Recipe"` |
| `process_operator` | Active transformation process | `process_operator PO1 "Mixer"` |
| `technical_resource` | Equipment/infrastructure | `technical_resource TR1 "Storage Tank"` |

### Connection Operators

| Operator | Type | Description | Example |
|----------|------|-------------|---------|
| `-->` | Flow | Product/material flow | `P1 --> PO1` |
| `-.->` | Alternative flow | Alternative connection | `P9 -.-> O2` |
| `==>` | Parallel flow | Parallel connection | `E1 ==> PO1` |
| `<..>` | Usage | Equipment connection | `TR1 <..> PO1` |

### System Blocks

Group related elements into named systems:

```fpd
@startfpd
title "My System"

system "SystemName" {
  product P1 "Input"
  process_operator O1 "Processing"
  product P2 "Output"

  P1 --> O1
  O1 --> P2
}

@endfpd
```

### Annotations

| Annotation | Description |
|------------|-------------|
| `@boundary` | Marks system boundary elements |
| `@internal` | Marks internal elements |

### Comments

Use `//` for single-line comments:

```fpd
// This is a comment
product P1 "Water"  // Inline comment
```

## Extension Settings

Configure the extension in VS Code settings (`Ctrl+,`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fpd.preview.autoUpdate` | `boolean` | `true` | Automatically update the preview panel when editing |
| `fpd.preview.updateDelay` | `number` | `500` | Debounce delay in ms before updating the preview |

## Commands

Access these commands via Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `FPD: Show Preview` | Open live diagram preview panel |
| `FPD: Export SVG` | Export diagram as SVG image |
| `FPD: Export VDI 3682 XML` | Export diagram as VDI 3682 XML |
| `FPD: Export FPD Text` | Export diagram as FPD text file |

## Troubleshooting

### Preview Not Updating

1. **Check auto-update**: Ensure `fpd.preview.autoUpdate` is enabled
2. **Adjust delay**: Increase `fpd.preview.updateDelay` if updates are too frequent
3. **Reload window**: Press `Ctrl+Shift+P` > "Developer: Reload Window"

### Syntax Highlighting Not Working

1. **Check file extension**: Ensure file has `.fpd` extension
2. **Verify language mode**: Check the language indicator in the bottom-right corner shows "FPD"
3. **Change language**: Click the language indicator and select "FPD" from the list

## Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/FLEXCELERATE/fpd-editor).

## License

MIT License - see [LICENSE](LICENSE) for details.

Copyright (c) 2026 FLEXCELERATE Solutions GmbH
