import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { StorageManager } from '../js/StorageManager.js';
import { RuleEngine } from '../js/RuleEngine.js';
import { UIManager } from '../js/UIManager.js';
import { applyRuleSchemaV3 } from '../js/RuleSchemaV3Enhancer.js';
import { applyRulePolicyV3 } from '../js/RulePolicyV3Enhancer.js';
import { applyRulePolicyV3Engine, expandReplacement } from '../js/RulePolicyV3Engine.js';

applyRuleSchemaV3({ StorageManager, RuleEngine, UIManager });
applyRulePolicyV3({ RuleEngine, UIManager });
applyRulePolicyV3Engine({ RuleEngine });

function createEngine(rules) {
    const engine = new RuleEngine();
    engine.setRules(rules);
    engine.setRemoveAsterisks(false);
    return engine;
}

test('保護範囲の後でも^を文頭として誤認しない', () => {
    const engine = createEngine([{
        target: '^出来る',
        replacement: 'できる',
        isRegex: true,
        excludeScopes: ['email']
    }]);
    const text = 'a@b.com出来る';
    assert.equal(engine.tokenize(text).filter((token) => token.type === 'highlight').length, 0);
    assert.equal(engine.getCleanedText(text), text);
});

test('除外しないルールは保護範囲をまたぐ後読みの文脈を維持する', () => {
    const engine = createEngine([{
        target: '(?<=a@b.com)出来る',
        replacement: 'できる',
        isRegex: true,
        excludeScopes: []
    }]);
    const text = 'a@b.com出来る';
    assert.equal(engine.tokenize(text).filter((token) => token.type === 'highlight').length, 1);
    assert.equal(engine.getCleanedText(text), 'a@b.comできる');
});

test('番号・名前付きキャプチャと置換特殊記号を展開する', () => {
    const numbered = createEngine([{
        target: '(\\d{4})-(\\d{2})',
        replacement: '$1/$2',
        isRegex: true,
        excludeScopes: []
    }]);
    assert.equal(numbered.getCleanedText('2026-08'), '2026/08');

    const named = createEngine([{
        target: '(?<year>\\d{4})-(?<month>\\d{2})',
        replacement: '$<year>/$<month>',
        isRegex: true,
        excludeScopes: []
    }]);
    assert.equal(named.getCleanedText('2026-08'), '2026/08');

    assert.equal(expandReplacement('$$-$&', {
        match: 'abc',
        captures: [],
        offset: 0,
        source: 'abc',
        groups: null
    }), '$-abc');
});

test('全文エンジンを通常スレッド・Worker・PWAへ組み込む', () => {
    const projectRoot = path.resolve(import.meta.dirname, '..');
    const app = fs.readFileSync(path.join(projectRoot, 'js', 'app.js'), 'utf-8');
    const worker = fs.readFileSync(path.join(projectRoot, 'js', 'tokenizeWorker.js'), 'utf-8');
    const serviceWorker = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf-8');

    assert.match(app, /applyRulePolicyV3Engine/);
    assert.match(worker, /applyRulePolicyV3Engine/);
    assert.match(serviceWorker, /RulePolicyV3Engine\.js/);
});
