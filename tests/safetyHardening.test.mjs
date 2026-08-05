import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRuleArray, validateRegexSafety } from '../js/RuleSchema.js';
import { RuleEngine } from '../js/RuleEngine.js';
import { StorageManager } from '../js/StorageManager.js';
import { UIManager } from '../js/UIManager.js';

test('ReDoSにつながりやすい正規表現とバックリファレンスを拒否する', () => {
    assert.equal(validateRegexSafety('(a+)+$').safe, false);
    assert.equal(validateRegexSafety('(a|aa)+$').safe, false);
    assert.equal(validateRegexSafety('(a)\\1').safe, false);
    assert.equal(validateRegexSafety('^#{1,3}\\s+').safe, true);
});

test('重複したルールIDはルールセット内で一意にする', () => {
    const rules = normalizeRuleArray([
        { id: 'same', target: 'A', replacement: 'a' },
        { id: 'same', target: 'B', replacement: 'b' }
    ]);
    assert.equal(new Set(rules.map((rule) => rule.id)).size, 2);
});

test('安全でない正規表現はエンジンで実行しない', () => {
    const engine = new RuleEngine();
    engine.setRules([{ target: '(a+)+$', replacement: 'x', isRegex: true }]);
    assert.equal(engine.tokenize('a'.repeat(100)).filter((token) => token.type === 'highlight').length, 0);
});

test('文脈依存のビジネス表現は検出のみで自動修正しない', () => {
    const storage = new StorageManager();
    assert.ok(storage.defaultRules['ビジネスメール用'].every((rule) => rule.autoFix === false));
});

test('大きすぎるインポートデータを拒否する', () => {
    const manager = Object.create(UIManager.prototype);
    manager._showToast = () => {};
    assert.equal(manager._processImportedJSON('x'.repeat(2_000_001)), false);
});
