import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UIManager } from '../js/UIManager.js';
import { RuleEngine } from '../js/RuleEngine.js';

test('個別修正は正確な範囲を置換する', () => {
    const manager = Object.create(UIManager.prototype);
    manager.sourceText = { value: 'A12 B34' };
    manager._undoStack = [];
    manager.undoBtn = { hidden: true };
    manager._replaceTextareaContent = UIManager.prototype._replaceTextareaContent;
    manager.analyzeText = () => {};
    manager._applyIndividualFix('34', '34円', 0, { start: 5, end: 7 });
    assert.equal(manager.sourceText.value, 'A12 B34円');
});

test('V3形式と旧形式のインポートを受け入れる', () => {
    const manager = Object.create(UIManager.prototype);
    manager.allRuleSets = { 既存: [] };
    manager.activeSetName = '既存';
    manager.rules = [];
    manager.ruleEngine = new RuleEngine();
    manager.storageManager = { saveAllRuleSets() {}, saveActiveSetName() {} };
    manager.populateRuleSetSelector = () => {};
    manager.renderRulesList = () => {};
    manager.analyzeText = () => {};
    manager._showToast = () => {};

    assert.equal(manager._processImportedJSON(JSON.stringify({
        format: 'writer-checker-rules', schemaVersion: 3,
        ruleSets: { A: [{ target: '全て', replacement: 'すべて', severity: 'error' }] }
    })), true);
    assert.equal(manager.allRuleSets.A[0].severity, 'error');

    assert.equal(manager._processImportedJSON(JSON.stringify({ B: [{ target: '下さい', replacement: 'ください' }] })), true);
    assert.equal(manager.allRuleSets.B[0].schemaVersion, 3);
});

test('同名ルールセットのインポートは上書きせず別名保存する', () => {
    const manager = Object.create(UIManager.prototype);
    manager.allRuleSets = { A: [{ target: '既存', replacement: '保持' }] };
    manager.activeSetName = 'A';
    manager.rules = manager.allRuleSets.A;
    manager.ruleEngine = new RuleEngine();
    manager.storageManager = { saveAllRuleSets() {}, saveActiveSetName() {} };
    manager.populateRuleSetSelector = () => {};
    manager.renderRulesList = () => {};
    manager.analyzeText = () => {};
    manager._showToast = () => {};

    assert.equal(manager._processImportedJSON(JSON.stringify({
        A: [{ target: '新規', replacement: '別名' }]
    })), true);
    assert.equal(manager.allRuleSets.A[0].target, '既存');
    assert.equal(manager.allRuleSets['A (インポート)'][0].target, '新規');
});

test('危険なルールセット名を拒否する', () => {
    const manager = Object.create(UIManager.prototype);
    assert.equal(manager._isSafeRuleSetName('__proto__'), false);
    assert.equal(manager._isSafeRuleSetName('安全'), true);
});

test('ruleIndexが古ければtargetでフォールバックする', () => {
    const manager = Object.create(UIManager.prototype);
    manager.rules = [{ target: 'A' }, { target: 'B' }];
    assert.equal(manager._findRuleForHighlight('B', 0, 'B'), manager.rules[1]);
});

test('自動修正レポートからautoFix=falseを除外する', () => {
    const manager = Object.create(UIManager.prototype);
    manager.ruleEngine = new RuleEngine();
    manager.ruleEngine.setRules([
        { target: '危険', replacement: '安全', autoFix: false },
        { target: '出来る', replacement: 'できる' }
    ]);
    assert.deepEqual(manager._generateChangeReport('危険だが出来る').map((item) => item.from), ['出来る']);
});

test('ブックマークレットはアプリURLを保持する', () => {
    const manager = Object.create(UIManager.prototype);
    const href = manager._buildBookmarkletHref('https://katakatalab.com/writer-checker/');
    assert.match(href, /^javascript:/);
    assert.match(href, /katakatalab\.com\/writer-checker/);
    assert.match(href, /w\.name/);
});

test('主画面からスコア・全部盛り・誤検知報告を除去する', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const ui = fs.readFileSync(path.join(root, 'js', 'UIManager.js'), 'utf8');
    assert.ok(!html.includes('文章スコア'));
    assert.ok(!html.includes('全部盛り'));
    assert.ok(!html.includes('Xでスコア共有'));
    assert.ok(!ui.includes('誤検知を報告'));
});

test('重複導線を削減し主要操作を2つに絞る', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.equal((html.match(/id="sampleBtn"/g) || []).length, 1);
    assert.equal((html.match(/id="exportRulesBtn"/g) || []).length, 1);
    assert.equal((html.match(/id="importRulesBtn"/g) || []).length, 1);
    assert.equal((html.match(/id="shareRulesBtn"/g) || []).length, 1);
    assert.match(html, /id="replaceBtn"/);
    assert.match(html, /id="copyBtn"/);
});
