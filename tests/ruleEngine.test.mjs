/**
 * Writer Checker — RuleEngine ユニットテスト
 * Node.js 組み込みテストランナー使用
 *
 * 実行: node --test tests/ruleEngine.test.mjs
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RuleEngine } from '../js/RuleEngine.js';

describe('RuleEngine: tokenize', () => {
    let engine;

    beforeEach(() => {
        engine = new RuleEngine();
    });

    it('空文字列は空配列を返す', () => {
        assert.deepStrictEqual(engine.tokenize(''), []);
        assert.deepStrictEqual(engine.tokenize(null), []);
    });

    it('ルールなしの場合はテキストトークンのみ', () => {
        engine.setRemoveAsterisks(false);
        const tokens = engine.tokenize('テスト文字列');
        assert.strictEqual(tokens.length, 1);
        assert.strictEqual(tokens[0].type, 'text');
        assert.strictEqual(tokens[0].content, 'テスト文字列');
    });

    it('アスタリスク除去がデフォルトで有効', () => {
        const tokens = engine.tokenize('これは**太字**です');
        const highlights = tokens.filter(t => t.type === 'highlight');
        assert.strictEqual(highlights.length, 2); // ** x2
        assert.strictEqual(highlights[0].content, '**');
    });

    it('アスタリスク除去を無効にできる', () => {
        engine.setRemoveAsterisks(false);
        const tokens = engine.tokenize('これは**太字**です');
        assert.strictEqual(tokens.length, 1);
        assert.strictEqual(tokens[0].type, 'text');
    });

    it('置換ルールが正しくトークン化される', () => {
        engine.setRemoveAsterisks(false);
        engine.setRules([
            { target: '出来る', replacement: 'できる' }
        ]);
        const tokens = engine.tokenize('それが出来るのは嬉しい');
        assert.strictEqual(tokens.length, 3);
        assert.strictEqual(tokens[0].type, 'text');
        assert.strictEqual(tokens[0].content, 'それが');
        assert.strictEqual(tokens[1].type, 'highlight');
        assert.strictEqual(tokens[1].content, '出来る');
        assert.strictEqual(tokens[1].replacement, 'できる');
        assert.strictEqual(tokens[2].type, 'text');
        assert.strictEqual(tokens[2].content, 'のは嬉しい');
    });

    it('複数のルールが順に適用される', () => {
        engine.setRemoveAsterisks(false);
        engine.setRules([
            { target: '出来る', replacement: 'できる' },
            { target: '下さい', replacement: 'ください' }
        ]);
        const tokens = engine.tokenize('出来ることを教えて下さい');
        const highlights = tokens.filter(t => t.type === 'highlight');
        assert.strictEqual(highlights.length, 2);
        assert.strictEqual(highlights[0].content, '出来る');
        assert.strictEqual(highlights[1].content, '下さい');
    });

    it('同じターゲットが複数回出現するケース', () => {
        engine.setRemoveAsterisks(false);
        engine.setRules([
            { target: '出来る', replacement: 'できる' }
        ]);
        const tokens = engine.tokenize('出来ることが出来る');
        const highlights = tokens.filter(t => t.type === 'highlight');
        assert.strictEqual(highlights.length, 2);
    });

    it('正規表現の特殊文字がエスケープされる', () => {
        engine.setRemoveAsterisks(false);
        engine.setRules([
            { target: '(笑)', replacement: 'w' }
        ]);
        const tokens = engine.tokenize('面白い(笑)');
        const highlights = tokens.filter(t => t.type === 'highlight');
        assert.strictEqual(highlights.length, 1);
        assert.strictEqual(highlights[0].content, '(笑)');
    });

    it('空のtargetは無視される', () => {
        engine.setRemoveAsterisks(false);
        engine.setRules([
            { target: '', replacement: 'something' }
        ]);
        const tokens = engine.tokenize('テスト');
        assert.strictEqual(tokens.length, 1);
        assert.strictEqual(tokens[0].type, 'text');
    });
});

describe('RuleEngine: 正規表現ルール', () => {
    let engine;

    beforeEach(() => {
        engine = new RuleEngine();
        engine.setRemoveAsterisks(false);
    });

    it('isRegex: trueで正規表現マッチが動作する', () => {
        engine.setRules([
            { target: '[０-９]+', replacement: '', isRegex: true }
        ]);
        const tokens = engine.tokenize('電話番号は０９０です');
        const highlights = tokens.filter(t => t.type === 'highlight');
        assert.strictEqual(highlights.length, 1);
        assert.strictEqual(highlights[0].content, '０９０');
    });

    it('isRegex: falseでは正規表現として解釈されない', () => {
        engine.setRules([
            { target: '[テスト]+', replacement: 'X' }
        ]);
        // "[テスト]+" はリテラル文字列として扱われる
        const tokens = engine.tokenize('入力[テスト]+結果');
        const highlights = tokens.filter(t => t.type === 'highlight');
        assert.strictEqual(highlights.length, 1);
        assert.strictEqual(highlights[0].content, '[テスト]+');
    });

    it('不正な正規表現パターンはスキップされる', () => {
        engine.setRules([
            { target: '[invalid', replacement: 'X', isRegex: true }
        ]);
        // 不正パターンはクラッシュせずスキップ
        const tokens = engine.tokenize('テスト文字列');
        assert.strictEqual(tokens.length, 1);
        assert.strictEqual(tokens[0].type, 'text');
    });

    it('正規表現でgetCleanedTextも動作する', () => {
        engine.setRules([
            { target: '[Ａ-Ｚ]+', replacement: '', isRegex: true }
        ]);
        const result = engine.getCleanedText('ＡＢＣテスト');
        assert.strictEqual(result, 'テスト');
    });

    it('正規表現+通常ルールの混在が動作する', () => {
        engine.setRules([
            { target: '出来る', replacement: 'できる' },
            { target: '\\d+', replacement: 'N', isRegex: true }
        ]);
        const result = engine.getCleanedText('出来ることを3回確認');
        assert.strictEqual(result, 'できることをN回確認');
    });
});

describe('RuleEngine: getCleanedText', () => {
    let engine;

    beforeEach(() => {
        engine = new RuleEngine();
    });

    it('空文字列はそのまま返す', () => {
        assert.strictEqual(engine.getCleanedText(''), '');
        assert.strictEqual(engine.getCleanedText(null), null);
    });

    it('アスタリスクを除去する', () => {
        const result = engine.getCleanedText('これは**太字**で*斜体*です');
        assert.strictEqual(result, 'これは太字で斜体です');
    });

    it('ルールに基づいて置換する', () => {
        engine.setRemoveAsterisks(false);
        engine.setRules([
            { target: '出来る', replacement: 'できる' },
            { target: 'ＷＥＢ', replacement: 'Web' }
        ]);
        const result = engine.getCleanedText('ＷＥＢ上で出来る');
        assert.strictEqual(result, 'Web上でできる');
    });

    it('アスタリスク除去とルールが両方適用される', () => {
        engine.setRules([
            { target: '出来る', replacement: 'できる' }
        ]);
        const result = engine.getCleanedText('**出来る**ことです');
        assert.strictEqual(result, 'できることです');
    });

    it('マッチなしの場合はテキストを変更しない', () => {
        engine.setRemoveAsterisks(false);
        engine.setRules([
            { target: '存在しない', replacement: 'replacement' }
        ]);
        assert.strictEqual(engine.getCleanedText('テスト文'), 'テスト文');
    });
});

describe('RuleEngine: escapeRegExp', () => {
    let engine;

    beforeEach(() => {
        engine = new RuleEngine();
    });

    it('正規表現の特殊文字をエスケープする', () => {
        assert.strictEqual(engine.escapeRegExp('(test)'), '\\(test\\)');
        assert.strictEqual(engine.escapeRegExp('[abc]'), '\\[abc\\]');
        assert.strictEqual(engine.escapeRegExp('a.b'), 'a\\.b');
        assert.strictEqual(engine.escapeRegExp('a+b'), 'a\\+b');
        assert.strictEqual(engine.escapeRegExp('a*b'), 'a\\*b');
        assert.strictEqual(engine.escapeRegExp('a?b'), 'a\\?b');
    });

    it('特殊文字がない場合はそのまま', () => {
        assert.strictEqual(engine.escapeRegExp('テスト'), 'テスト');
    });
});

describe('RuleEngine: _buildRegex', () => {
    let engine;

    beforeEach(() => {
        engine = new RuleEngine();
    });

    it('空のtargetはnullを返す', () => {
        assert.strictEqual(engine._buildRegex({ target: '', replacement: 'x' }), null);
    });

    it('通常ルールはエスケープされたRegExpを返す', () => {
        const regex = engine._buildRegex({ target: '(笑)', replacement: 'w' });
        assert.ok(regex instanceof RegExp);
        assert.ok(regex.test('(笑)'));
        assert.ok(!regex.test('笑'));
    });

    it('正規表現ルールはそのままRegExpを返す', () => {
        const regex = engine._buildRegex({ target: '\\d+', replacement: 'N', isRegex: true });
        assert.ok(regex instanceof RegExp);
        assert.ok(regex.test('123'));
    });

    it('不正なパターンはnullを返す', () => {
        const regex = engine._buildRegex({ target: '[', replacement: 'x', isRegex: true });
        assert.strictEqual(regex, null);
    });
});
