import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UIManager } from '../js/UIManager.js';

describe('UIManager: _applyIndividualFix', () => {
    it('空置換の個別修正で「削除」という文字列を挿入しない', () => {
        const manager = Object.create(UIManager.prototype);
        manager.sourceText = { value: 'A*B' };
        manager._replaceTextareaContent = (next) => {
            manager.sourceText.value = next;
        };
        manager.analyzeText = () => {};

        manager._applyIndividualFix('*', '', 0);

        assert.strictEqual(manager.sourceText.value, 'AB');
    });

    it('正規表現ルールの個別修正でキャプチャ置換が展開される', () => {
        const manager = Object.create(UIManager.prototype);
        manager.rules = [{ target: '(\\d+)', replacement: '$1円', isRegex: true }];
        manager.sourceText = { value: 'A12 B34' };
        manager._replaceTextareaContent = (next) => {
            manager.sourceText.value = next;
        };
        manager.analyzeText = () => {};

        manager._applyIndividualFix('34', '$1円', 0, { ruleIndex: 0, matchedText: '34' });

        assert.strictEqual(manager.sourceText.value, 'A12 B34円');
    });
});

describe('UIManager: _processImportedJSON', () => {
    it('危険キーをスキップしつつ安全なルールセットを取り込む', () => {
        const manager = Object.create(UIManager.prototype);
        manager.allRuleSets = {
            既存: [{ target: '出来る', replacement: 'できる' }]
        };
        manager.activeSetName = '既存';
        manager.rules = manager.allRuleSets.既存;
        manager.ruleEngine = { setRules: () => {} };
        manager.storageManager = {
            saveAllRuleSets: () => {},
            saveActiveSetName: () => {}
        };
        manager.populateRuleSetSelector = () => {};
        manager.renderRulesList = () => {};
        manager.analyzeText = () => {};
        manager._showToast = () => {};

        const payload = JSON.stringify({
            __proto__: [{ target: 'X', replacement: 'Y' }],
            安全セット: [{ target: '全て', replacement: 'すべて', enabled: false, memo: 'memo', isRegex: true }]
        });

        manager._processImportedJSON(payload);

        assert.ok(Object.hasOwn(manager.allRuleSets, '安全セット'));
        assert.ok(!Object.hasOwn(manager.allRuleSets, '__proto__'));
        assert.deepStrictEqual(manager.allRuleSets.安全セット[0], {
            target: '全て',
            replacement: 'すべて',
            isRegex: true,
            enabled: false,
            memo: 'memo'
        });
    });
});

describe('UIManager: 追加の堅牢性', () => {
    it('危険なルールセット名は新規作成で拒否する', () => {
        const manager = Object.create(UIManager.prototype);
        manager.allRuleSets = { 既存: [] };
        manager.activeSetName = '既存';
        manager.rules = [];
        manager.ruleEngine = { setRules: () => {} };
        manager.storageManager = {
            saveAllRuleSets: () => {},
            saveActiveSetName: () => {}
        };
        manager.populateRuleSetSelector = () => {};
        manager.analyzeText = () => {};
        manager._showToast = () => {};

        const ok = manager._createRuleSet('__proto__');

        assert.strictEqual(ok, false);
        assert.ok(!Object.hasOwn(manager.allRuleSets, '__proto__'));
    });

    it('右クリック無効化対象はruleIndex優先で特定できる', () => {
        const manager = Object.create(UIManager.prototype);
        manager.rules = [
            { target: '\\d+', replacement: '', isRegex: true },
            { target: '出来る', replacement: 'できる' }
        ];

        const resolved = manager._findRuleForHighlight('123', 0, '\\d+');

        assert.strictEqual(resolved, manager.rules[0]);
    });

    it('ruleIndexが古い場合はtarget一致でフォールバックする', () => {
        const manager = Object.create(UIManager.prototype);
        manager.rules = [
            { target: 'A', replacement: 'a' },
            { target: 'B', replacement: 'b' }
        ];

        const resolved = manager._findRuleForHighlight('B', 0, 'B');

        assert.strictEqual(resolved, manager.rules[1]);
    });

    it('ブックマークレットは生成時のアプリURLを保持する', () => {
        const manager = Object.create(UIManager.prototype);
        const href = manager._buildBookmarkletHref('https://katakatalab.com/writer-checker/');

        assert.match(href, /^javascript:/);
        assert.match(href, /katakatalab\.com\/writer-checker/);
        assert.match(href, /w\.name/);
    });

    it('アクティブセット名が危険値なら最初のセットへ同期する', () => {
        const manager = Object.create(UIManager.prototype);
        manager.allRuleSets = {
            安全1: [{ target: '出来る', replacement: 'できる' }],
            安全2: []
        };
        manager.activeSetName = '__proto__';
        manager.storageManager = {
            saveActiveSetName: () => {}
        };
        manager.ruleEngine = {
            setRules: () => {}
        };

        manager._syncActiveRules();

        assert.strictEqual(manager.activeSetName, '安全1');
        assert.deepStrictEqual(manager.rules, manager.allRuleSets.安全1);
    });
});
