import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { StorageManager } from '../js/StorageManager.js';
import { RuleEngine } from '../js/RuleEngine.js';
import { UIManager } from '../js/UIManager.js';
import { applyRuleSchemaV3 } from '../js/RuleSchemaV3Enhancer.js';
import {
    applyRulePolicyV3,
    collectScopedRanges,
    splitTextByScopes
} from '../js/RulePolicyV3Enhancer.js';

applyRuleSchemaV3({ StorageManager, RuleEngine, UIManager });
applyRulePolicyV3({ RuleEngine, UIManager });

function createEngine(rules, removeAsterisks = false) {
    const engine = new RuleEngine();
    engine.setRules(rules);
    engine.setRemoveAsterisks(removeAsterisks);
    return engine;
}

test('ルールごとの除外設定を検出と一括修正の両方で尊重する', () => {
    const engine = createEngine([
        {
            target: '出来る',
            replacement: 'できる',
            severity: 'error',
            excludeScopes: ['url']
        },
        {
            target: '禁止語',
            replacement: '許可語',
            severity: 'warning',
            excludeScopes: []
        }
    ]);
    const text = '本文は出来る。 https://example.com/出来る/禁止語';
    const highlights = engine.tokenize(text).filter((token) => token.type === 'highlight');

    assert.deepEqual(highlights.map((token) => token.content), ['出来る', '禁止語']);
    assert.equal(engine.getCleanedText(text), '本文はできる。 https://example.com/出来る/許可語');
});

test('autoFix=falseは検出するが一括修正と修正レポートから除外する', () => {
    const engine = createEngine([
        {
            target: '危険',
            replacement: '安全',
            severity: 'error',
            autoFix: false
        },
        {
            target: '出来る',
            replacement: 'できる',
            severity: 'warning',
            autoFix: true
        }
    ]);
    const text = '危険だが出来る';
    const highlights = engine.tokenize(text).filter((token) => token.type === 'highlight');

    assert.equal(highlights.length, 2);
    assert.equal(highlights[0].ruleMeta.autoFix, false);
    assert.equal(engine.getCleanedText(text), '危険だができる');

    const ui = Object.create(UIManager.prototype);
    ui.ruleEngine = engine;
    const changes = ui._generateChangeReport(text);
    assert.deepEqual(changes.map((change) => change.from), ['出来る']);
});

test('autoFix=falseの個別修正を二重に防止する', () => {
    const ui = Object.create(UIManager.prototype);
    ui.rules = [{ target: '危険', replacement: '安全', autoFix: false }];
    let toastMessage = '';
    ui._showToast = (message) => { toastMessage = message; };

    ui._applyIndividualFix('危険', '安全', 0, { ruleIndex: 0, matchedText: '危険' });
    assert.match(toastMessage, /自動修正しません/);
});

test('正規表現のキャプチャ置換を維持する', () => {
    const engine = createEngine([{
        target: '(\\d{4})-(\\d{2})',
        replacement: '$1/$2',
        isRegex: true,
        excludeScopes: []
    }]);
    assert.equal(engine.getCleanedText('2026-08'), '2026/08');
});

test('V3項目をJSON・共有リンクのインポート処理で保持する', () => {
    const ui = Object.create(UIManager.prototype);
    const [rule] = ui._sanitizeImportedRuleArray([{
        id: 'brand-001',
        target: '製品Ａ',
        replacement: '製品A',
        severity: 'error',
        category: '固有名詞',
        reason: '正式名称へ統一するため',
        badExample: '製品Ａを使用',
        goodExample: '製品Aを使用',
        excludeScopes: ['url'],
        autoFix: false
    }]);

    assert.equal(rule.id, 'brand-001');
    assert.equal(rule.severity, 'error');
    assert.equal(rule.category, '固有名詞');
    assert.equal(rule.reason, '正式名称へ統一するため');
    assert.equal(rule.badExample, '製品Ａを使用');
    assert.equal(rule.goodExample, '製品Aを使用');
    assert.deepEqual(rule.excludeScopes, ['url']);
    assert.equal(rule.autoFix, false);
});

test('コード・URL・メールが重なっても範囲とスコープを正確に分割する', () => {
    const text = '参照 `mail@example.com` と https://example.com/mail@example.com。本文';
    const ranges = collectScopedRanges(text);
    assert.ok(ranges.some((range) => range.scopes.has('code') && range.scopes.has('email')));
    assert.ok(ranges.some((range) => range.scopes.has('url') && range.scopes.has('email')));
    for (let index = 1; index < ranges.length; index++) {
        assert.ok(ranges[index - 1].end <= ranges[index].start);
    }
    assert.equal(splitTextByScopes(text).map((segment) => segment.content).join(''), text);
});

test('通常スレッド・Worker・PWAが同じポリシーモジュールを読み込む', () => {
    const projectRoot = path.resolve(import.meta.dirname, '..');
    const app = fs.readFileSync(path.join(projectRoot, 'js', 'app.js'), 'utf-8');
    const worker = fs.readFileSync(path.join(projectRoot, 'js', 'tokenizeWorker.js'), 'utf-8');
    const serviceWorker = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf-8');

    assert.match(app, /applyRulePolicyV3/);
    assert.match(worker, /applyRulePolicyV3/);
    assert.match(serviceWorker, /RuleSchemaV3Enhancer\.js/);
    assert.match(serviceWorker, /RulePolicyV3Enhancer\.js/);
    assert.match(serviceWorker, /tokenizeWorker\.js/);
});
