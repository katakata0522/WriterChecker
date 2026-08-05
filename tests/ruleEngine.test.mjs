import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleEngine, expandReplacement } from '../js/RuleEngine.js';

function engineWith(rules) {
    const engine = new RuleEngine();
    engine.setRules(rules);
    return engine;
}

test('グローバルなアスタリスク削除は廃止されている', () => {
    const engine = new RuleEngine();
    engine.setRemoveAsterisks(true);
    assert.deepEqual(engine.tokenize('**太字**'), [{ type: 'text', content: '**太字**' }]);
    assert.equal(engine.getCleanedText('**太字**'), '**太字**');
});

test('AI装飾は通常ルールとして明示的に処理できる', () => {
    const engine = engineWith([
        { target: '**', replacement: '', severity: 'info' },
        { target: '*', replacement: '', severity: 'info' }
    ]);
    assert.equal(engine.getCleanedText('**太字**と*斜体*'), '太字と斜体');
});

test('URL除外をルールごとに尊重する', () => {
    const engine = engineWith([
        { target: '出来る', replacement: 'できる', excludeScopes: ['url'] },
        { target: '禁止語', replacement: '許可語', excludeScopes: [] }
    ]);
    const text = '本文は出来る。https://example.com/出来る/禁止語';
    assert.deepEqual(
        engine.tokenize(text).filter((token) => token.type === 'highlight').map((token) => token.content),
        ['出来る', '禁止語']
    );
    assert.equal(engine.getCleanedText(text), '本文はできる。https://example.com/出来る/許可語');
});

test('autoFix=falseは検出するが自動修正しない', () => {
    const engine = engineWith([
        { target: '危険', replacement: '安全', autoFix: false, severity: 'error' },
        { target: '出来る', replacement: 'できる' }
    ]);
    const tokens = engine.tokenize('危険だが出来る').filter((token) => token.type === 'highlight');
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0].ruleMeta.autoFix, false);
    assert.equal(engine.getCleanedText('危険だが出来る'), '危険だができる');
});

test('正規表現は全文上の文脈とキャプチャ置換を維持する', () => {
    const anchored = engineWith([{ target: '^出来る', replacement: 'できる', isRegex: true, excludeScopes: ['email'] }]);
    assert.equal(anchored.tokenize('a@b.com出来る').filter((token) => token.type === 'highlight').length, 0);

    const lookbehind = engineWith([{ target: '(?<=a@b.com)出来る', replacement: 'できる', isRegex: true, excludeScopes: [] }]);
    assert.equal(lookbehind.getCleanedText('a@b.com出来る'), 'a@b.comできる');

    const capture = engineWith([{ target: '(?<year>\\d{4})-(?<month>\\d{2})', replacement: '$<year>/$<month>', isRegex: true, excludeScopes: [] }]);
    const token = capture.tokenize('2026-08').find((item) => item.type === 'highlight');
    assert.equal(token.replacement, '2026/08');
    assert.equal(capture.getCleanedText('2026-08'), '2026/08');
});

test('先に定義したルールが重複範囲で優先される', () => {
    const engine = engineWith([
        { target: '**', replacement: '' },
        { target: '*', replacement: '' }
    ]);
    const highlights = engine.tokenize('**x**').filter((token) => token.type === 'highlight');
    assert.equal(highlights.length, 2);
    assert.ok(highlights.every((token) => token.content === '**'));
});

test('置換特殊記号を展開する', () => {
    assert.equal(expandReplacement('$$-$&', {
        match: 'abc', captures: [], offset: 0, source: 'abc', groups: null
    }), '$-abc');
});
