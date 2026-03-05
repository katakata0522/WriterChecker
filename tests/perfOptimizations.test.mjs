import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const htaccessPath = path.join(projectRoot, '.htaccess');
const indexPath = path.join(projectRoot, 'index.html');
const cssPath = path.join(projectRoot, 'style.css');
const minCssPath = path.join(projectRoot, 'style.min.css');

describe('Performance optimization guards', () => {
    it('.htaccessでキャッシュ制御が定義されている', () => {
        const text = fs.readFileSync(htaccessPath, 'utf-8');
        assert.match(text, /Cache-Control "public, max-age=31536000, immutable"/);
        assert.match(text, /FilesMatch "\\\.\(html\|json\|xml\|txt\)\$"/);
        assert.match(text, /FilesMatch "\^\(sw\\\.js\|manifest\\\.json\)\$"/);
    });

    it('本番HTMLはminified CSSを参照している', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        assert.match(html, /href="style\.min\.css\?v=/);
    });

    it('minified CSSが存在し元ファイルより小さい', () => {
        const sourceStat = fs.statSync(cssPath);
        const minStat = fs.statSync(minCssPath);
        assert.ok(minStat.size > 0);
        assert.ok(minStat.size < sourceStat.size);
    });

    it('外部Google Fonts依存がない', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        assert.ok(!html.includes('fonts.googleapis.com'));
        assert.ok(!html.includes('fonts.gstatic.com'));
    });
});
