import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageManager } from '../js/StorageManager.js';
import { RuleEngine } from '../js/RuleEngine.js';
import { UIManager } from '../js/UIManager.js';
import {
    applyRuleSchemaV3,
    normalizeRuleV3,
    collectProtectedRanges,
    RULE_SCHEMA_VERSION
} from '../js/RuleSchemaV3Enhancer.js';

applyRuleSchemaV3({ StorageManager, RuleEngine, UIManager });

function installLocalStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    globalThis.localStorage = {
        getItem(key) { return store.has(key) ? store.get(key) : null; },
        setItem(key, value) { store.set(key, String(value)); },
        removeItem(key) { store.delete(key); },
        clear() { store.clear(); }
    };
    return store;
}

test('V2形式のルールをV3へ自動正規化する', () => {
    installLocalStorage({
        writerCheckerRulesV2: JSON.stringify({
            '旧ルール': [
                { target: '出来る', replacement: 'できる' },
                { target: '禁止語', replacement: '', enabled: false, memo: '使用しない' }
            ]
        })
    });

    const storage = new StorageManager();
    const loaded = storage.loadAllRuleSets();
    const [first, second] = loaded['旧ルール'];

    assert.equal(first.schemaVersion, RULE_SCHEMA_VERSION);
    assert.match(first.id, /^rule-/);
    assert.equal(first.severity, 'warning');
    assert.equal(first.category, '表記統一');
    assert.deepEqual(first.excludeScopes, ['url', 'email', 'code']);
    assert.equal(first.autoFix, true);
    assert.equal(second.enabled, false);
    assert.equal(second.reason, '使用しない');
});

test('V3固有フィールドを保存時に保持し危険な値を正規化する', () => {
    installLocalStorage();
    const storage = new StorageManager();
    storage.saveAllRuleSets({
        '企業ルール': [{
            id: 'brand-001',
            target: '製品Ａ',
            replacement: '製品A',
            severity: 'error',
            category: '固有名詞',
            reason: '正式名称へ統一するため',
            badExample: '製品Ａを使う',
            goodExample: '製品Aを使う',
            excludeScopes: ['url', 'email', 'unknown'],
            autoFix: false
        }]
    });

    const [rule] = storage.loadAllRuleSets()['企業ルール'];
    assert.equal(rule.id, 'brand-001');
    assert.equal(rule.severity, 'error');
    assert.equal(rule.category, '固有名詞');
    assert.equal(rule.reason, '正式名称へ統一するため');
    assert.deepEqual(rule.excludeScopes, ['url', 'email']);
    assert.equal(rule.autoFix, false);
});

test('URL・メール・コード内は検査せず通常本文だけを検出する', () => {
    const engine = new RuleEngine();
    engine.setRemoveAsterisks(false);
    engine.setRules([normalizeRuleV3({
        target: '出来る',
        replacement: 'できる',
        severity: 'error',
        category: '表記統一',
        reason: 'ひらがなへ統一'
    })]);

    const text = [
        '本文では出来る。',
        'https://example.com/出来る',
        'user@example.com',
        '`出来る`',
        '```js',
        'const 出来る = true;',
        '```'
    ].join('\n');

    const tokens = engine.tokenize(text);
    const highlights = tokens.filter((token) => token.type === 'highlight');
    assert.equal(highlights.length, 1);
    assert.equal(highlights[0].content, '出来る');
    assert.equal(highlights[0].ruleMeta.severity, 'error');
    assert.equal(highlights[0].ruleMeta.category, '表記統一');
    assert.equal(engine.getCleanedText(text).split('できる').length - 1, 1);
    assert.match(engine.getCleanedText(text), /https:\/\/example\.com\/出来る/);
    assert.match(engine.getCleanedText(text), /`出来る`/);
    assert.match(engine.getCleanedText(text), /user@example\.com/);
});

test('保護範囲は重複しても安全に統合される', () => {
    const text = '参照 https://example.com/a@example.com と `code@example.com`';
    const ranges = collectProtectedRanges(text);
    assert.ok(ranges.length >= 2);
    for (let i = 1; i < ranges.length; i++) {
        assert.ok(ranges[i - 1].end <= ranges[i].start);
    }
});

test('不正な重大度はwarningへフォールバックする', () => {
    const rule = normalizeRuleV3({
        target: '対象',
        replacement: '置換',
        severity: 'critical'
    });
    assert.equal(rule.severity, 'warning');
    assert.equal(rule.schemaVersion, 3);
});