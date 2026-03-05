import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(projectRoot, 'manifest.json');
const indexPath = path.join(projectRoot, 'index.html');

describe('PWA manifest and head links', () => {
    it('manifestに192px/512pxアイコンが定義されている', () => {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
        const srcSet = new Set(icons.map((icon) => icon.src));

        assert.ok(srcSet.has('icons/pwa-192.png'));
        assert.ok(srcSet.has('icons/pwa-512.png'));
    });

    it('index.htmlにapple-touch-iconリンクがある', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        assert.match(html, /rel="apple-touch-icon"/);
    });
});
