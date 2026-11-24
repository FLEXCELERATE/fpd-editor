import * as fs from 'fs';
import * as path from 'path';

/** Skill folders per target, relative to the workspace root. */
export const TARGETS = {
    claude: '.claude/skills/fpd',
    agents: '.agents/skills/fpd',
} as const;

export type SkillTarget = keyof typeof TARGETS;

/** Replaces the `CLI: ` line of the shipped SKILL.md. */
const CLI_LINES: Record<SkillTarget, string> = {
    claude: 'CLI: `node "${CLAUDE_SKILL_DIR}/bin/fpd.mjs"`; the skill folder is `.claude/skills/fpd` in the project root (Node 20+).',
    agents: 'CLI: `node .agents/skills/fpd/bin/fpd.mjs`, run from the project root (Node 20+).',
};

const VERSION_LINE = /^(\s+)version:\s*(.*?)\s*$/;

/** Line positions of the frontmatter and its `metadata:` block (-1 = missing). */
interface Frontmatter {
    end: number;
    metadata: number;
    metadataEnd: number;
    version: number;
}

function parseFrontmatter(lines: string[]): Frontmatter | undefined {
    if (lines[0]?.trimEnd() !== '---') {
        return undefined;
    }
    const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
    if (end < 0) {
        return undefined;
    }
    const metadata = lines.findIndex((line, i) => i < end && /^metadata:\s*$/.test(line));
    let metadataEnd = metadata + 1;
    let version = -1;
    if (metadata >= 0) {
        for (; metadataEnd < end && /^\s/.test(lines[metadataEnd]); metadataEnd++) {
            if (version < 0 && VERSION_LINE.test(lines[metadataEnd])) {
                version = metadataEnd;
            }
        }
    }
    return { end, metadata, metadataEnd, version };
}

/** `metadata.version` from the SKILL.md frontmatter. */
export function readSkillVersion(skillMd: string): string | undefined {
    const lines = skillMd.split(/\r?\n/);
    const frontmatter = parseFrontmatter(lines);
    if (!frontmatter || frontmatter.version < 0) {
        return undefined;
    }
    const value = VERSION_LINE.exec(lines[frontmatter.version])?.[2] ?? '';
    return value.replace(/^(['"])(.*)\1$/, '$2') || undefined;
}

/** Sets `metadata.version` and the target's `CLI: ` line; throws if the source has drifted. */
export function stampSkill(skillMd: string, version: string, target: SkillTarget): string {
    const eol = skillMd.includes('\r\n') ? '\r\n' : '\n';
    const lines = skillMd.split(/\r?\n/);
    const frontmatter = parseFrontmatter(lines);
    if (!frontmatter) {
        throw new Error('SKILL.md has no frontmatter');
    }

    const cli = lines.flatMap((line, i) =>
        i > frontmatter.end && line.startsWith('CLI: ') ? [i] : [],
    );
    if (cli.length !== 1) {
        throw new Error(`SKILL.md needs exactly one "CLI: " line, found ${cli.length}`);
    }
    lines[cli[0]] = CLI_LINES[target];

    const entry = `version: "${version}"`;
    const { end, metadata } = frontmatter;
    if (frontmatter.version >= 0) {
        lines[frontmatter.version] = lines[frontmatter.version].replace(/version:.*/, entry);
    } else if (metadata >= 0) {
        const indent = /^\s+/.exec(lines[metadata + 1])?.[0] ?? '  ';
        lines.splice(metadata + 1, 0, indent + entry);
    } else {
        lines.splice(end, 0, 'metadata:', `  ${entry}`);
    }
    return lines.join(eol);
}

/** Numeric x.y.z comparison; a missing version counts as 0.0.0. */
export function compareVersions(a: string | undefined, b: string | undefined): number {
    const parse = (v: string | undefined) => {
        const parts = (v ?? '').split('.');
        return [0, 1, 2].map((i) => parseInt(parts[i] ?? '', 10) || 0);
    };
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) {
            return Math.sign(pa[i] - pb[i]);
        }
    }
    return 0;
}

/**
 * Writes SKILL.md (stamped) and bin/fpd.mjs (byte copy) into the target folder.
 * Other files are left alone. Returns the target folder.
 */
export function installSkillFiles(
    sourceDir: string,
    workspaceRoot: string,
    target: SkillTarget,
    version: string,
): string {
    const skillMd = stampSkill(
        fs.readFileSync(path.join(sourceDir, 'SKILL.md'), 'utf-8'),
        version,
        target,
    );
    const cli = fs.readFileSync(path.join(sourceDir, 'bin', 'fpd.mjs'));

    const dir = path.join(workspaceRoot, TARGETS[target]);
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd, 'utf-8');
    fs.writeFileSync(path.join(dir, 'bin', 'fpd.mjs'), cli);
    return dir;
}

/** The skill installed in a workspace folder, or `undefined` if there is none. */
export function findInstalledSkill(
    workspaceRoot: string,
    target: SkillTarget,
): { version: string | undefined } | undefined {
    const file = path.join(workspaceRoot, TARGETS[target], 'SKILL.md');
    if (!fs.existsSync(file)) {
        return undefined;
    }
    return { version: readSkillVersion(fs.readFileSync(file, 'utf-8')) };
}

/** Major version from `node --version` output (`v22.3.0` → 22). */
export function parseNodeMajor(stdout: string): number | undefined {
    const match = /^v?(\d+)\./.exec(stdout.trim());
    return match ? Number(match[1]) : undefined;
}
