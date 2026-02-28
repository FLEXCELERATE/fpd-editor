# Changelog

All notable changes to the FPB Language Support extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-22

### Initial Release

First public release of FPB Language Support for VS Code.

### Added

#### Language Support
- **Syntax Highlighting**: Full TextMate grammar for FPB language
  - Element keywords: `product`, `energy`, `information`, `process_operator`, `technical_resource`
  - Connection operators: `-->`, `-.->`, `==>`, `<..>`
  - Block delimiters: `@startfpb`, `@endfpb`
  - Comments: `//` line comments
  - String literals: Double-quoted labels

- **Language Configuration**
  - Auto-closing pairs for double quotes
  - Comment toggling support (`Ctrl+/`)
  - Code folding for `@startfpb...@endfpb` blocks
  - Smart word pattern for identifier selection

- **File Association**: `.fpb` file extension registered with FPB language mode

#### IntelliSense Features
- **Autocompletion Provider**
  - Element type keywords with snippet expansion
  - Connection operators with context-aware suggestions
  - Block delimiters
  - Rich documentation for all completion items

- **Diagnostics Provider**
  - Real-time syntax validation
  - Connection type rule validation
  - Element declaration validation
  - Error highlighting with severity levels
  - Debounced updates for optimal performance

#### Backend Integration
- **Backend Manager**
  - Auto-start capability for local FastAPI backend
  - Health monitoring with automatic reconnection
  - Process lifecycle management
  - Configurable backend URL support

- **API Client**
  - REST API integration for parse, export, and import operations
  - Session management with automatic session ID injection
  - Comprehensive error handling
  - TypeScript interfaces for type-safe API responses

#### Diagram Preview
- **Live Preview Panel**
  - Side-by-side webview panel for diagram visualization
  - Real-time SVG rendering
  - Auto-update on document changes (configurable debounce)
  - Support for all element types with distinct visual styles
  - Support for all connection types with appropriate line styles
  - Theme-aware styling (light/dark mode)
  - Placeholder state when no content available
  - Error state display for backend connectivity issues

#### Commands
- **Export Commands**
  - `FPB: Export as XML` - Export diagram to XML format
  - `FPB: Export as Text` - Export diagram to text format
  - Native file save dialogs with appropriate file filters
  - Error handling and user feedback

- **Import Commands**
  - `FPB: Import File` - Import `.fpb` or `.xml` files
  - File type detection and conversion
  - Opens imported content in new editor tab

- **Preview Commands**
  - `FPB: Show Preview` - Open live diagram preview panel
  - Editor toolbar button for quick access
  - Command palette integration

#### Configuration Settings
- `fpb.backend.url` - Backend API server URL (default: `http://localhost:8082`)
- `fpb.backend.autoStart` - Auto-start backend server (default: `true`)
- `fpb.preview.autoUpdate` - Auto-update preview on edit (default: `true`)
- `fpb.preview.updateDelay` - Preview update debounce delay in ms (default: `500`)

#### Developer Features
- TypeScript configuration with strict mode
- Comprehensive build setup with source maps
- ESLint configuration for code quality
- `.vscodeignore` for optimized extension packaging
- Git integration with `.gitignore`

### Technical Details

#### Architecture
- **Language**: TypeScript 5.3+ with ES2020 target
- **Module System**: CommonJS for VS Code compatibility
- **Dependencies**:
  - `axios` for HTTP requests
  - `@types/vscode` for VS Code API types

#### File Structure
```
vscode-extension/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── completionProvider.ts     # Autocompletion logic
│   ├── diagnosticsProvider.ts    # Error diagnostics
│   ├── backendManager.ts         # Backend lifecycle management
│   ├── apiClient.ts              # API communication
│   ├── previewPanel.ts           # Diagram preview webview
│   └── commands/
│       ├── exportCommands.ts     # Export functionality
│       └── importCommands.ts     # Import functionality
├── syntaxes/
│   └── fpb.tmLanguage.json       # TextMate grammar
├── media/
│   ├── preview.html              # Preview panel HTML
│   └── preview.css               # Preview panel styles
├── language-configuration.json   # Language features config
└── package.json                  # Extension manifest
```

#### Validation Rules
- Products cannot connect directly to other products
- Energy elements must use energy operator (`-.->`)
- Information elements must use information operator (`==>`)
- Technical resources must use technical operator (`<..>`)
- All connections must reference declared elements
- Block delimiters must be properly paired

### Known Limitations

- Backend must be accessible (local or remote) for preview and export features
- Preview panel shows text-based representation; future versions may include graphical rendering
- No offline mode - requires backend connection for parsing and validation
- Limited to single document preview at a time

### Requirements

- **VS Code**: Version 1.85.0 or higher
- **Python**: 3.9+ (if using backend auto-start feature)
- **Backend**: FastAPI backend (included in main project or separately deployed)

### Future Roadmap

See the project repository for planned features including:
- VS Code Marketplace publication
- Enhanced diagram rendering with interactive elements
- Hover information for elements and connections
- Go-to-definition for element references
- Symbol outline and breadcrumbs support
- Multi-file project support
- Workspace-wide validation
- Extension icon and custom file icon for `.fpb` files

---

## Version History

### Legend
- `Added` - New features
- `Changed` - Changes in existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Vulnerability fixes

---

[0.1.0]: https://github.com/fpb-tools/textbasedfpd/releases/tag/vscode-0.1.0
