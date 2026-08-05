import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyRulePolicyV3UIFix } from '../js/RulePolicyV3UIFix.js';

class FakeClassList {
    constructor(values = []) {
        this.values = new Set(values);
    }

    add(...values) {
        values.forEach((value) => this.values.add(value));
    }

    remove(...values) {
        values.forEach((value) => this.values.delete(value));
    }

    has(value) {
        return this.values.has(value);
    }
}

class FakeUIManager {
    _renderAnalysisResult() {
        this._latestAnalysis = {
            issues: [
                { severity: 'info', category: '装飾', autoFix: true },
                { severity: 'error', category: '法務', autoFix: false }
            ]
        };
    }
}

applyRulePolicyV3UIFix({ UIManager: FakeUIManager });

test('既存の誤った重大度クラスを除去して最終メタデータへ揃える', () => {
    const spans = [0, 1].map(() => ({
        classList: new FakeClassList(['highlight--warning']),
        dataset: {},
        title: '指摘理由',
        textContent: '対象',
        attributes: {},
        setAttribute(name, value) {
            this.attributes[name] = value;
        }
    }));
    const ui = new FakeUIManager();
    ui.resultOutput = { querySelectorAll: () => spans };
    ui.matchCountStatus = { textContent: '' };
    ui.matchCountBadge = { style: {} };

    ui._renderAnalysisResult('対象', []);

    assert.equal(spans[0].classList.has('highlight--info'), true);
    assert.equal(spans[0].classList.has('highlight--warning'), false);
    assert.equal(spans[1].classList.has('highlight--error'), true);
    assert.equal(spans[1].classList.has('highlight--manual'), true);
    assert.equal(spans[1].dataset.autoFix, 'false');
    assert.match(ui.matchCountStatus.textContent, /要判断 1/);
});

test('UI整合アダプターを通常画面とPWAキャッシュへ組み込む', () => {
    const projectRoot = path.resolve(import.meta.dirname, '..');
    const app = fs.readFileSync(path.join(projectRoot, 'js', 'app.js'), 'utf-8');
    const serviceWorker = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf-8');

    assert.match(app, /applyRulePolicyV3UIFix/);
    assert.match(serviceWorker, /RulePolicyV3UIFix\.js/);
});
