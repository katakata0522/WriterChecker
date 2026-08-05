import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { StorageManager } from '../js/StorageManager.js';

class LocalStorageMock {
    constructor() { this.store = new Map(); }
    getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
    setItem(key, value) { this.store.set(key, String(value)); }
    removeItem(key) { this.store.delete(key); }
}

beforeEach(() => { global.localStorage = new LocalStorageMock(); });

test('保存済みV2ルールをV3へ移行し危険キーを除外する', () => {
    const storage = new StorageManager();
    localStorage.setItem(storage.STORAGE_KEY_RULES, JSON.stringify({
        __proto__: [{ target: 'X', replacement: 'Y' }],
        安全セット: [{ target: '全て', replacement: 'すべて', enabled: false, memo: '理由', isRegex: true }]
    }));
    const loaded = storage.loadAllRuleSets();
    assert.ok(!Object.hasOwn(loaded, '__proto__'));
    assert.equal(loaded.安全セット[0].schemaVersion, 3);
    assert.equal(loaded.安全セット[0].reason, '理由');
    assert.equal(loaded.安全セット[0].enabled, false);
});

test('V3の詳細項目を保存して読み戻す', () => {
    const storage = new StorageManager();
    storage.saveAllRuleSets({ A: [{
        id: 'brand', target: '製品Ａ', replacement: '製品A', severity: 'error', category: '固有名詞',
        reason: '正式名称', badExample: '製品Ａ', goodExample: '製品A', autoFix: false, excludeScopes: ['url']
    }] });
    const [rule] = storage.loadAllRuleSets().A;
    assert.equal(rule.id, 'brand');
    assert.equal(rule.severity, 'error');
    assert.equal(rule.autoFix, false);
    assert.deepEqual(rule.excludeScopes, ['url']);
});

test('グローバルなアスタリスク設定は旧値に関係なく無効', () => {
    const storage = new StorageManager();
    localStorage.setItem(storage.STORAGE_KEY_ASTERISKS, 'true');
    assert.equal(storage.loadAsteriskSetting(), false);
    storage.saveAsteriskSetting(true);
    assert.equal(localStorage.getItem(storage.STORAGE_KEY_ASTERISKS), 'false');
});

test('AI出力クリーンはアスタリスクを通常ルールとして持つ', () => {
    const storage = new StorageManager();
    const rules = storage.defaultRules['AI出力クリーン'];
    assert.ok(rules.some((rule) => rule.target === '**'));
    assert.ok(rules.some((rule) => rule.target === '*'));
});

test('廃止した誤検知報告APIを保持しない', () => {
    const sm = new StorageManager();
    assert.equal(typeof sm.incrementFalsePositiveFeedback, 'undefined');
});
