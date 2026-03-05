import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const indexPath = path.join(projectRoot, 'index.html');
const stylePath = path.join(projectRoot, 'style.css');

describe('Lighthouse fixes guard', () => {
    it('ルールセットセレクトにaria-labelが付与されている', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        assert.match(html, /<select id="ruleSetSelector"[^>]*aria-label="ルールセット"/);
    });

    it('FontAwesomeのスタイルシートを読み込んでいる', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        assert.match(html, /<link rel="stylesheet" href="vendor\/fontawesome\/css\/all\.min\.css">/);
    });

    it('FREEバッジが高コントラストになる色指定を持つ', () => {
        const css = fs.readFileSync(stylePath, 'utf-8');
        assert.match(css, /\.badge-free\s*\{[^}]*color:\s*#052e16;/);
    });

    it('OGP画像とTwitter画像メタが設定されている', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        assert.match(html, /property="og:image"/);
        assert.match(html, /name="twitter:image"/);
    });

    it('FAQの構造化データが含まれている', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        assert.match(html, /"@type":\s*"FAQPage"/);
    });
});
