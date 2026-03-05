import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StorageManager } from '../js/StorageManager.js';

class LocalStorageMock {
    constructor() {
        this.store = new Map();
    }

    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }

    setItem(key, value) {
        this.store.set(key, String(value));
    }

    removeItem(key) {
        this.store.delete(key);
    }
}

describe('StorageManager', () => {
    beforeEach(() => {
        global.localStorage = new LocalStorageMock();
    });

    it('保存済みルールセット読み込み時に危険キーを除外する', () => {
        const sm = new StorageManager();
        localStorage.setItem(
            sm.STORAGE_KEY_RULES,
            JSON.stringify({
                __proto__: [{ target: 'X', replacement: 'Y' }],
                安全セット: [{ target: '全て', replacement: 'すべて', enabled: false, memo: 'm', isRegex: true }]
            })
        );

        const loaded = sm.loadAllRuleSets();

        assert.ok(Object.hasOwn(loaded, '安全セット'));
        assert.ok(!Object.hasOwn(loaded, '__proto__'));
        assert.deepStrictEqual(loaded.安全セット[0], {
            target: '全て',
            replacement: 'すべて',
            isRegex: true,
            enabled: false,
            memo: 'm'
        });
    });

    it('不正な保存データの場合はデフォルトルールへフォールバックする', () => {
        const sm = new StorageManager();
        localStorage.setItem(sm.STORAGE_KEY_RULES, '{"invalid":123}');

        const loaded = sm.loadAllRuleSets();

        assert.ok(Object.keys(loaded).length > 0);
        assert.ok(Object.hasOwn(loaded, 'デフォルト (汎用)'));
    });

    it('危険なアクティブセット名は保存・読込で拒否する', () => {
        const sm = new StorageManager();
        sm.saveActiveSetName('__proto__');
        assert.strictEqual(localStorage.getItem(sm.STORAGE_KEY_ACTIVE_SET), null);

        localStorage.setItem(sm.STORAGE_KEY_ACTIVE_SET, '__proto__');
        const loaded = sm.loadActiveSetName();
        assert.strictEqual(loaded, 'デフォルト (汎用)');
    });
});
