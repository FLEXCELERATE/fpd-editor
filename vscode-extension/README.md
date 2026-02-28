# FPB Language Support for VS Code

> Professional language support for FPB (Flow-based Process Diagrams) - a text-first approach to process engineering diagrams.

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-green.svg)]()

## Features

### 🎨 Syntax Highlighting
Rich syntax highlighting for FPB files with TextMate grammar support:
- **Keywords**: `product`, `energy`, `information`, `process_operator`, `technical_resource`
- **Operators**: `-->` (material), `-.->`  (energy), `==>` (information), `<..>` (technical)
- **Block delimiters**: `@startfpb`, `@endfpb`
- **Comments**: `//` line comments
- **Strings**: Double-quoted labels

### 💡 IntelliSense & Autocompletion
Smart autocompletion as you type:
- Element type keywords with snippets
- Connection operators after identifiers
- Automatic snippet expansion with placeholders
- Context-aware suggestions

### 🔍 Real-time Diagnostics
Instant error detection with red squiggly underlines:
- Syntax validation
- Connection type rules (e.g., products cannot connect directly to products)
- Missing or duplicate declarations
- Invalid operator usage

### 📊 Live Diagram Preview
Side-by-side diagram preview that updates as you type:
- Real-time SVG rendering
- Auto-update on document changes (configurable debounce)
- Visual representation of all element types
- Support for material, energy, information, and technical connections
- Theme-aware styling

### 📤 Export Commands
Export your diagrams in multiple formats via Command Palette:
- **Export as XML**: Structured data format
- **Export as Text**: Plain text representation

### 📥 Import Support
Import existing files for editing:
- Open `.fpb` files directly
- Import `.xml` files and convert to FPB syntax

### ⚙️ Automatic Backend Integration
Seamless connection to the FPB backend:
- Auto-start local backend server (Python FastAPI)
- Connect to existing backend instances
- Configurable backend URL
- Health monitoring

## Installation

### From VSIX File (Development/Manual Installation)

1. Download the latest `.vsix` file from the releases page
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Type "Install from VSIX" and select the command
5. Navigate to the downloaded `.vsix` file and select it
6. Reload VS Code when prompted

### Prerequisites

The extension requires a Python backend to provide parsing and rendering services:

- **Python 3.9+** (if using auto-start feature)
- **FastAPI backend** (automatically started or manually configured)

The backend is automatically started when you open a `.fpb` file if `fpb.backend.autoStart` is enabled (default).

## Getting Started

### 1. Create Your First FPB File

Create a new file with `.fpb` extension:

```fpb
@startfpb
// Simple process flow example

product P1 "Raw Material"
process_operator PO1 "Chemical Reactor"
product P2 "Final Product"
energy E1 "Heat"

P1 --> PO1 "feed"
E1 -.-> PO1 "heating"
PO1 --> P2 "output"

@endfpb
```

### 2. View the Diagram

Click the preview icon in the editor toolbar or press `Ctrl+Shift+P` and run:
```
FPB: Show Preview
```

The diagram preview will open in a side panel and update automatically as you type.

### 3. Export Your Diagram

Press `Ctrl+Shift+P` and run one of:
- `FPB: Export as XML` - For data exchange
- `FPB: Export as Text` - For plain text format

## FPB Language Syntax

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
| `-->` | Material | Product/material flow | `P1 --> PO1 "input"` |
| `-.->` | Energy | Energy flow | `E1 -.-> PO1 "power"` |
| `==>` | Information | Information flow | `I1 ==> PO1 "setpoint"` |
| `<..>` | Technical | Equipment connection | `TR1 <..> PO1 "uses"` |

### Block Structure

Every FPB file must be wrapped in block delimiters:

```fpb
@startfpb
// Your process definition here
@endfpb
```

### Comments

Use `//` for single-line comments:

```fpb
// This is a comment
product P1 "Water"  // Inline comment
```

## Extension Settings

Configure the extension in VS Code settings (`Ctrl+,` or `Cmd+,`):

### `fpb.backend.url`
- **Type**: `string`
- **Default**: `"http://localhost:8082"`
- **Description**: URL of the FPB backend API server

### `fpb.backend.autoStart`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically start the FPB backend server if not running

### `fpb.preview.autoUpdate`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically update the preview panel when editing

### `fpb.preview.updateDelay`
- **Type**: `number`
- **Default**: `500`
- **Description**: Delay in milliseconds before updating the preview after typing (debounce)

## Commands

Access these commands via Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `FPB: Show Preview` | Open live diagram preview panel |
| `FPB: Export as XML` | Export current diagram as XML file |
| `FPB: Export as Text` | Export current diagram as text file |
| `FPB: Import File` | Import .fpb or .xml file for editing |

## Troubleshooting

### Backend Connection Issues

If you see "Backend not connected" errors:

1. **Check backend status**: The backend should auto-start by default
2. **Manual start**: Navigate to the backend directory and run:
   ```bash
   python -m uvicorn main:app --port 8082
   ```
3. **Configure URL**: Update `fpb.backend.url` in settings if using a different port/host
4. **Disable auto-start**: Set `fpb.backend.autoStart` to `false` if managing the backend manually

### Preview Not Updating

If the preview panel doesn't update:

1. **Check auto-update**: Ensure `fpb.preview.autoUpdate` is enabled
2. **Adjust delay**: Increase `fpb.preview.updateDelay` if updates are too frequent
3. **Reload window**: Press `Ctrl+Shift+P` > "Developer: Reload Window"

### Syntax Highlighting Not Working

If syntax highlighting doesn't appear:

1. **Check file extension**: Ensure file has `.fpb` extension
2. **Verify language mode**: Check the language indicator in the bottom-right corner shows "FPB"
3. **Change language**: Click the language indicator and select "FPB" from the list

## Examples

### Simple Process Flow

```fpb
@startfpb
product RawMaterial "Raw Material Input"
process_operator Reactor "Chemical Reactor"
product FinalProduct "Final Product"

RawMaterial --> Reactor "feed"
Reactor --> FinalProduct "output"
@endfpb
```

### Complex Process with Energy and Information

```fpb
@startfpb
// Multi-stage process with energy and information flows

product P1 "Feedstock"
energy E1 "Steam"
information I1 "Process Control"
process_operator PO1 "Heater"
process_operator PO2 "Separator"
product P2 "Product A"
product P3 "Product B"
technical_resource TR1 "Storage Tank"

P1 --> PO1 "input"
E1 -.-> PO1 "heating"
I1 ==> PO1 "setpoint"
PO1 --> PO2 "heated stream"
PO2 --> P2 "top product"
PO2 --> P3 "bottom product"
TR1 <..> P2 "stores"
@endfpb
```

## Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/FLEXCELERATE/fpd-editor).

## License

See the main project repository for license information.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

---

**Enjoy using FPB Language Support!** 🎉

For more information about the FPB language and the broader text-based process diagram ecosystem, visit the project documentation.
