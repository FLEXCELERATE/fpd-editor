# Backend Manager Verification Guide

This document explains how to verify that the Backend Manager implementation works correctly.

## Automated Verification (Subtask 4-1)

The backend manager should automatically start the FPB backend server when the VS Code extension activates.

### Prerequisites

1. Python 3.x installed and available in PATH
2. Backend dependencies installed:
   ```bash
   cd /c/Development/textbasedfpd/backend
   pip install -r requirements.txt
   ```

### Verification Steps

1. **Install the extension in VS Code** (for development testing)
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   code --extensionDevelopmentHost=. .
   ```

2. **Open a .fpb file** to activate the extension

3. **Check the FPB Backend output channel** in VS Code:
   - View > Output
   - Select "FPB Backend" from the dropdown
   - You should see logs showing the backend initialization

4. **Verify backend health endpoint**:
   ```bash
   curl http://localhost:8082/api/health
   ```

   **Expected output:**
   ```json
   {"status":"ok"}
   ```

## Manual Backend Start (for testing without extension)

If you want to test the backend independently:

```bash
cd /c/Development/textbasedfpd/backend
python -m uvicorn main:app --host localhost --port 8082 --reload
```

Then test the health endpoint:
```bash
curl http://localhost:8082/api/health
```

## Configuration Options

The backend manager respects these VS Code settings:

- `fpb.backend.url` (default: `http://localhost:8082`)
  - URL where the backend server runs

- `fpb.backend.autoStart` (default: `true`)
  - Whether to automatically start the backend if not running

To disable auto-start:
1. Open VS Code Settings (Ctrl+,)
2. Search for "fpb"
3. Uncheck "Fpb > Backend: Auto Start"

## Troubleshooting

### Backend fails to start

Check the "FPB Backend" output channel for error messages. Common issues:

1. **Python not found**: Ensure Python is in your PATH
2. **Port already in use**: Another process may be using port 8082
3. **Missing dependencies**: Run `pip install -r requirements.txt` in the backend directory
4. **Backend path not found**: The extension tries multiple paths to find the backend. Check the output channel for the path it's using.

### Backend starts but health check fails

1. Wait a few seconds - the backend may still be initializing
2. Check if the backend is running: `curl http://localhost:8082/api/health`
3. Check the backend logs in the output channel

## Implementation Details

The `BackendManager` class:

1. **Health Check**: Polls the `/api/health` endpoint to check if backend is running
2. **Auto-Start**: If backend is not running and `autoStart` is enabled, spawns a Python process running uvicorn
3. **Process Management**: Manages the backend process lifecycle, including stdout/stderr logging
4. **Path Resolution**: Attempts to find the backend directory in several common locations
5. **Health Monitoring**: Periodically checks backend health and notifies user if connection is lost
6. **Cleanup**: Properly terminates the backend process when the extension deactivates
