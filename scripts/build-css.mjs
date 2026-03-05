#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(projectRoot, 'style.css');
const outPath = path.join(projectRoot, 'style.min.css');

function minifyCss(input) {
    return input
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,>])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();
}

const source = fs.readFileSync(sourcePath, 'utf-8');
const minified = minifyCss(source);
fs.writeFileSync(outPath, `${minified}\n`, 'utf-8');

console.log(`Built ${path.basename(outPath)} (${Buffer.byteLength(minified, 'utf-8')} bytes)`);
