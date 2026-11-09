#!/usr/bin/env node
import { run } from './cli';

const io = {
    out: (line: string) => process.stdout.write(`${line}\n`),
    err: (line: string) => process.stderr.write(`${line}\n`),
};

process.exitCode = await run(process.argv.slice(2), io);
