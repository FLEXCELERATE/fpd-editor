import * as vscode from 'vscode';
import { exec } from 'child_process';
import {
    compareVersions,
    findInstalledSkill,
    installSkillFiles,
    parseNodeMajor,
    SkillTarget,
    TARGETS,
} from './skillFiles';

const TARGET_ITEMS: Record<SkillTarget, { label: string; detail: string }> = {
    claude: { label: 'Claude Code', detail: '.claude/skills/fpd · also read by GitHub Copilot' },
    agents: {
        label: 'Other AI agents',
        detail: '.agents/skills/fpd · Copilot, Codex, Gemini CLI, Mistral Vibe',
    },
};

interface Install {
    folder: vscode.WorkspaceFolder;
    target: SkillTarget;
}

/** Registers `fpd.skill.install` and offers an update for outdated skills in the workspace. */
export function registerSkillInstaller(
    context: vscode.ExtensionContext,
    log?: vscode.OutputChannel,
): void {
    const sourceDir = vscode.Uri.joinPath(context.extensionUri, 'skill', 'fpd').fsPath;
    const version: string = context.extension.packageJSON.version;

    context.subscriptions.push(
        vscode.commands.registerCommand('fpd.skill.install', async () => {
            try {
                await installCommand(sourceDir, version);
            } catch (error) {
                vscode.window.showErrorMessage(`FPD AI skill: ${errorMessage(error)}`);
            }
        }),
    );

    offerUpdate(sourceDir, version).catch((error) =>
        log?.appendLine(`AI skill update check failed: ${errorMessage(error)}`),
    );
}

async function installCommand(sourceDir: string, version: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
        vscode.window.showErrorMessage('Open a folder to install the FPD AI skill into.');
        return;
    }
    const folder =
        folders.length === 1
            ? folders[0]
            : await vscode.window.showWorkspaceFolderPick({
                  placeHolder: 'Install the FPD AI skill into which folder?',
              });
    if (!folder) {
        return;
    }

    const root = folder.uri.fsPath;
    const items = (Object.keys(TARGETS) as SkillTarget[]).map((target) => ({
        ...TARGET_ITEMS[target],
        target,
        picked: target === 'claude' || findInstalledSkill(root, target) !== undefined,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        title: 'Install the FPD AI skill for …',
    });
    if (!picked || picked.length === 0) {
        return;
    }

    const installs: Install[] = [];
    for (const { target } of picked) {
        const installed = findInstalledSkill(root, target);
        if (installed && compareVersions(installed.version, version) > 0) {
            const choice = await vscode.window.showWarningMessage(
                `Installed FPD AI skill ${installed.version} is newer than this extension (${version}). Replace it?`,
                { modal: true },
                'Replace',
            );
            if (choice !== 'Replace') {
                continue;
            }
        }
        installs.push({ folder, target });
    }

    const done = installAll(sourceDir, version, installs);
    if (done.length === 0) {
        return;
    }
    const major = await nodeMajor();
    if (major === undefined || major < 20) {
        vscode.window.showWarningMessage('The FPD AI skill needs Node.js 20+ on PATH.');
    }
    showInstalled(version, done);
}

/** Once per session (at activation): offer to update installed skills older than the extension. */
async function offerUpdate(sourceDir: string, version: string): Promise<void> {
    const outdated: Array<Install & { from: string }> = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        for (const target of Object.keys(TARGETS) as SkillTarget[]) {
            const installed = findInstalledSkill(folder.uri.fsPath, target);
            if (installed && compareVersions(installed.version, version) < 0) {
                outdated.push({ folder, target, from: installed.version ?? '0.0.0' });
            }
        }
    }
    if (outdated.length === 0) {
        return;
    }

    const from = outdated.map((o) => o.from).sort(compareVersions)[0];
    const choice = await vscode.window.showInformationMessage(
        `FPD AI skill update available (${from} → ${version}).`,
        'Update',
        'Not now',
    );
    if (choice !== 'Update') {
        return;
    }
    const done = installAll(sourceDir, version, outdated);
    if (done.length > 0) {
        showInstalled(version, done);
    }
}

/** Installs into each target; returns the installed folders, reports failures. */
function installAll(sourceDir: string, version: string, installs: Install[]): string[] {
    const done: string[] = [];
    for (const { folder, target } of installs) {
        const where =
            (vscode.workspace.workspaceFolders?.length ?? 0) > 1
                ? `${folder.name}/${TARGETS[target]}`
                : TARGETS[target];
        try {
            installSkillFiles(sourceDir, folder.uri.fsPath, target, version);
            done.push(where);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Installing the FPD AI skill in ${where} failed: ${errorMessage(error)}`,
            );
        }
    }
    return done;
}

function showInstalled(version: string, folders: string[]): void {
    vscode.window.showInformationMessage(
        `FPD AI skill ${version} installed in ${folders.join(' and ')}. Commit the folder so your team gets it too.`,
    );
}

/** Major version of `node` on PATH, `undefined` if it does not run. */
function nodeMajor(): Promise<number | undefined> {
    return new Promise((resolve) => {
        // Through the shell, like the agents run it: on Windows only cmd.exe finds node.cmd shims.
        exec('node --version', { timeout: 5000 }, (error, stdout) =>
            resolve(error ? undefined : parseNodeMajor(stdout)),
        );
    });
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
