import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// No vscode mock: skillFiles must stay free of vscode imports.
import {
    compareVersions,
    findInstalledSkill,
    installSkillFiles,
    parseNodeMajor,
    readSkillVersion,
    stampSkill,
    TARGETS,
} from './skillFiles';

const SOURCE = `---
name: fpd
description: Test skill
---

# FPD

CLI: \`node "<skill-dir>/bin/fpd.mjs"\`, see below.

More text.
`;

const CLAUDE_CLI =
    'CLI: `node "${CLAUDE_SKILL_DIR}/bin/fpd.mjs"`; the skill folder is `.claude/skills/fpd` in the project root (Node 20+).';
const AGENTS_CLI =
    'CLI: `node .agents/skills/fpd/bin/fpd.mjs`, run from the project root (Node 20+).';

/** Bytes that a text round trip would change (NUL, 0xff, CRLF). */
const CLI_BYTES = Buffer.from([0x23, 0x21, 0x00, 0xff, 0x0d, 0x0a, 0xe2, 0x86, 0x92]);

const REAL_SKILL = path.resolve(__dirname, '..', 'skill', 'fpd', 'SKILL.md');

describe('stampSkill', () => {
    it('adds metadata.version to the frontmatter', () => {
        const stamped = stampSkill(SOURCE, '1.2.3', 'claude');
        expect(stamped).toContain('description: Test skill\nmetadata:\n  version: "1.2.3"\n---\n');
        expect(readSkillVersion(stamped)).toBe('1.2.3');
    });

    it('replaces an existing version instead of adding a second one', () => {
        const stamped = stampSkill(stampSkill(SOURCE, '1.0.0', 'claude'), '2.0.0', 'claude');
        expect(stamped.match(/version:/g)).toHaveLength(1);
        expect(stamped.match(/metadata:/g)).toHaveLength(1);
        expect(readSkillVersion(stamped)).toBe('2.0.0');
    });

    it('adds the version to a metadata block without one', () => {
        const source = SOURCE.replace('---\n\n', 'metadata:\n  author: someone\n---\n\n');
        const stamped = stampSkill(source, '1.0.0', 'claude');
        expect(stamped).toContain('metadata:\n  version: "1.0.0"\n  author: someone\n---');
        expect(readSkillVersion(stamped)).toBe('1.0.0');
    });

    it('writes the CLI line for Claude Code', () => {
        const stamped = stampSkill(SOURCE, '1.0.0', 'claude');
        expect(stamped.split('\n').filter((line) => line.startsWith('CLI: '))).toEqual([
            CLAUDE_CLI,
        ]);
        expect(stamped).toContain('# FPD\n\n' + CLAUDE_CLI + '\n\nMore text.\n');
    });

    it('writes the CLI line for other agents', () => {
        const stamped = stampSkill(SOURCE, '1.0.0', 'agents');
        expect(stamped.split('\n').filter((line) => line.startsWith('CLI: '))).toEqual([
            AGENTS_CLI,
        ]);
    });

    it('keeps CRLF line endings', () => {
        const stamped = stampSkill(SOURCE.replace(/\n/g, '\r\n'), '1.0.0', 'agents');
        expect(stamped).not.toMatch(/[^\r]\n/);
        expect(stamped).toContain('metadata:\r\n  version: "1.0.0"\r\n---');
        expect(readSkillVersion(stamped)).toBe('1.0.0');
    });

    it('throws without a CLI line', () => {
        expect(() => stampSkill(SOURCE.replace('CLI: ', 'Cli: '), '1.0.0', 'claude')).toThrow(
            /CLI/,
        );
    });

    it('throws without frontmatter', () => {
        expect(() => stampSkill(SOURCE.replace(/^---\n/, ''), '1.0.0', 'claude')).toThrow(
            /frontmatter/,
        );
    });
});

describe('shipped SKILL.md', () => {
    const skillMd = fs.readFileSync(REAL_SKILL, 'utf-8');
    const lines = skillMd.split(/\r?\n/);

    it('has exactly one CLI line', () => {
        expect(lines.filter((line) => line.startsWith('CLI: '))).toHaveLength(1);
    });

    it('has frontmatter with name: fpd', () => {
        const end = lines.indexOf('---', 1);
        expect(lines[0]).toBe('---');
        expect(end).toBeGreaterThan(0);
        expect(lines.slice(1, end)).toContain('name: fpd');
    });

    it('can be stamped for both targets', () => {
        for (const target of ['claude', 'agents'] as const) {
            expect(readSkillVersion(stampSkill(skillMd, '9.9.9', target))).toBe('9.9.9');
        }
    });
});

describe('readSkillVersion', () => {
    it('reads metadata.version', () => {
        expect(readSkillVersion('---\nname: x\nmetadata:\n  version: "0.6.0"\n---\n')).toBe(
            '0.6.0',
        );
        expect(readSkillVersion("---\nmetadata:\n  version: '0.6.0'\n---\n")).toBe('0.6.0');
        expect(readSkillVersion('---\nmetadata:\n    version: 0.6.0\n---\n')).toBe('0.6.0');
    });

    it('returns undefined without a version', () => {
        expect(readSkillVersion(SOURCE)).toBeUndefined();
        expect(readSkillVersion('---\nmetadata:\n  author: x\n---\n')).toBeUndefined();
        expect(readSkillVersion('---\nversion: "1.0.0"\n---\n')).toBeUndefined();
        expect(readSkillVersion('# no frontmatter\n')).toBeUndefined();
    });

    it('returns undefined for broken frontmatter', () => {
        expect(readSkillVersion('---\nmetadata:\n  version: "1.0.0"\n')).toBeUndefined();
        expect(readSkillVersion('---\nmetadata:\n  version:\n---\n')).toBeUndefined();
        expect(readSkillVersion('')).toBeUndefined();
    });
});

describe('compareVersions', () => {
    it('compares x.y.z numerically', () => {
        expect(compareVersions('0.5.0', '0.6.0')).toBeLessThan(0);
        expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
        expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
        expect(compareVersions('0.6.0', '0.6.0')).toBe(0);
    });

    it('treats a missing version as 0.0.0', () => {
        expect(compareVersions(undefined, '0.0.1')).toBeLessThan(0);
        expect(compareVersions(undefined, '0.0.0')).toBe(0);
        expect(compareVersions('0.1.0', undefined)).toBeGreaterThan(0);
    });
});

describe('parseNodeMajor', () => {
    it('reads the major version', () => {
        expect(parseNodeMajor('v22.3.0\n')).toBe(22);
        expect(parseNodeMajor('v20.0.0')).toBe(20);
        expect(parseNodeMajor('v18.19.1\r\n')).toBe(18);
    });

    it('returns undefined for anything else', () => {
        expect(parseNodeMajor('')).toBeUndefined();
        expect(parseNodeMajor("'node' is not recognized")).toBeUndefined();
    });
});

describe('installSkillFiles', () => {
    let tmp: string;
    let source: string;
    let workspace: string;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fpd-skill-'));
        source = path.join(tmp, 'source');
        workspace = path.join(tmp, 'workspace');
        fs.mkdirSync(path.join(source, 'bin'), { recursive: true });
        fs.mkdirSync(workspace);
        fs.writeFileSync(path.join(source, 'SKILL.md'), SOURCE);
        fs.writeFileSync(path.join(source, 'bin', 'fpd.mjs'), CLI_BYTES);
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    const installed = (target: keyof typeof TARGETS, file: string) =>
        path.join(workspace, TARGETS[target], file);

    it('creates the folders and writes both files', () => {
        installSkillFiles(source, workspace, 'claude', '1.0.0');

        const skillMd = fs.readFileSync(installed('claude', 'SKILL.md'), 'utf-8');
        expect(readSkillVersion(skillMd)).toBe('1.0.0');
        expect(skillMd).toContain(CLAUDE_CLI);
        expect(fs.readFileSync(installed('claude', 'bin/fpd.mjs')).equals(CLI_BYTES)).toBe(true);
    });

    it('writes the agents copy with its own CLI line', () => {
        installSkillFiles(source, workspace, 'agents', '1.0.0');

        const skillMd = fs.readFileSync(installed('agents', 'SKILL.md'), 'utf-8');
        expect(readSkillVersion(skillMd)).toBe('1.0.0');
        expect(skillMd).toContain(AGENTS_CLI);
        expect(fs.existsSync(path.join(workspace, '.claude'))).toBe(false);
    });

    it('leaves other files alone', () => {
        fs.mkdirSync(path.join(workspace, TARGETS.claude), { recursive: true });
        fs.writeFileSync(path.join(workspace, '.claude', 'settings.json'), '{}');
        fs.writeFileSync(installed('claude', 'notes.txt'), 'keep me');

        installSkillFiles(source, workspace, 'claude', '1.0.0');

        expect(fs.readFileSync(path.join(workspace, '.claude', 'settings.json'), 'utf-8')).toBe(
            '{}',
        );
        expect(fs.readFileSync(installed('claude', 'notes.txt'), 'utf-8')).toBe('keep me');
    });

    it('overwrites an older install', () => {
        installSkillFiles(source, workspace, 'claude', '1.0.0');
        fs.writeFileSync(installed('claude', 'bin/fpd.mjs'), 'stale');

        installSkillFiles(source, workspace, 'claude', '1.1.0');

        const skillMd = fs.readFileSync(installed('claude', 'SKILL.md'), 'utf-8');
        expect(readSkillVersion(skillMd)).toBe('1.1.0');
        expect(skillMd.match(/version:/g)).toHaveLength(1);
        expect(fs.readFileSync(installed('claude', 'bin/fpd.mjs')).equals(CLI_BYTES)).toBe(true);
    });

    it('writes nothing when the source has no CLI line', () => {
        fs.writeFileSync(path.join(source, 'SKILL.md'), SOURCE.replace('CLI: ', 'Cli: '));

        expect(() => installSkillFiles(source, workspace, 'claude', '1.0.0')).toThrow();
        expect(fs.existsSync(path.join(workspace, '.claude'))).toBe(false);
    });

    it('is found by findInstalledSkill', () => {
        expect(findInstalledSkill(workspace, 'claude')).toBeUndefined();

        installSkillFiles(source, workspace, 'claude', '1.0.0');
        expect(findInstalledSkill(workspace, 'claude')).toEqual({ version: '1.0.0' });

        fs.writeFileSync(installed('claude', 'SKILL.md'), SOURCE);
        expect(findInstalledSkill(workspace, 'claude')).toEqual({ version: undefined });
    });
});
