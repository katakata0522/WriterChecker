import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RuleEngine } from '../js/RuleEngine.js';
import { collectScopedRanges, isMatchExcluded } from '../js/RuleSchema.js';
import { UIManager } from '../js/UIManager.js';

function engineWith(rules) {
    const engine = new RuleEngine();
    engine.setRules(rules);
    return engine;
}

test('連鎖置換を発生させずプレビューと修正結果を一致させる', () => {
    const engine = engineWith([
        { target: 'Ａ', replacement: 'A' },
        { target: 'A', replacement: 'B' }
    ]);
    const token = engine.tokenize('Ａ').find((item) => item.type === 'highlight');
    assert.equal(token.replacement, 'A');
    assert.equal(engine.getCleanedText('Ａ'), 'A');
});

test('修正計画で自動修正と要判断を分離する', () => {
    const engine = engineWith([
        { target: '出来る', replacement: 'できる' },
        { target: '了解しました', replacement: '承知しました', autoFix: false }
    ]);
    const plan = engine.createFixPlan('出来る。了解しました。');
    assert.equal(plan.cleanedText, 'できる。了解しました。');
    assert.equal(plan.autoFixCount, 1);
    assert.equal(plan.manualCount, 1);
});

test('保護範囲の重なりを正しく判定する', () => {
    const text = 'https://example.com/a@b.com と `https://example.com/x`';
    const ranges = collectScopedRanges(text);
    const urlStart = text.indexOf('https://example.com/a@b.com');
    const codeStart = text.indexOf('`https');
    assert.equal(isMatchExcluded(ranges, urlStart, urlStart + 5, ['url']), true);
    assert.equal(isMatchExcluded(ranges, codeStart + 1, codeStart + 6, ['code']), true);
});

test('空の状態もUndo履歴として保持する', () => {
    const manager = Object.create(UIManager.prototype);
    manager.sourceText = { value: '', focus() {} };
    manager.undoBtn = { hidden: true };
    manager._undoStack = [];
    manager._updateActionAvailability = () => {};
    manager.analyzeText = () => {};
    manager._showToast = () => {};
    manager._replaceTextareaContent('サンプル');
    manager._undo();
    assert.equal(manager.sourceText.value, '');
});

test('ルール編集の破棄は作業用ドラフトだけを捨てる', () => {
    const manager = Object.create(UIManager.prototype);
    manager.rules = [{ target: '出来る', replacement: 'できる' }];
    manager._ruleDraft = [{ target: '追加', replacement: '削除予定' }];
    manager._hasUnsavedEdits = true;
    manager.saveStateStatus = { textContent: '' };
    manager.renderRulesList = () => {};
    manager._discardRuleDraft();
    assert.equal(manager._ruleDraft, null);
    assert.equal(manager.rules[0].target, '出来る');
});

test('ルールセットを深いコピーで複製する', () => {
    const manager = Object.create(UIManager.prototype);
    manager.activeSetName = 'A社用';
    manager.rules = [{ target: '出来る', replacement: 'できる', excludeScopes: ['url'] }];
    manager.allRuleSets = { 'A社用': manager.rules };
    manager.ruleEngine = new RuleEngine();
    manager.storageManager = { saveAllRuleSets() {}, saveActiveSetName() {} };
    manager.populateRuleSetSelector = () => {};
    manager.renderRulesList = () => {};
    manager.analyzeText = () => {};
    manager._closeSidePanel = () => {};
    manager._showToast = () => {};
    const name = manager._duplicateActiveRuleSet();
    assert.equal(name, 'A社用 のコピー');
    assert.notEqual(manager.allRuleSets[name], manager.allRuleSets['A社用']);
    assert.notEqual(manager.allRuleSets[name][0].excludeScopes, manager.allRuleSets['A社用'][0].excludeScopes);
});

test('モバイルの重複主要操作をCSSで隠す', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const css = fs.readFileSync(path.join(root, 'style-v3.css'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(css, /\.result-actions > #copyBtn, \.result-actions > #replaceBtn\s*\{\s*display:\s*none/);
    assert.match(html, /id="duplicateRuleSetBtn"/);
    assert.match(html, /id="ruleSearchStatus"/);
    assert.match(html, /id="resultOutput"[^>]*aria-busy="false"/);
});
