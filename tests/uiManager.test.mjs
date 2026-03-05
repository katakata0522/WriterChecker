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

    it('入力が空になると解析トラッキング状態を初期化する', () => {
        const manager = Object.create(UIManager.prototype);
        manager.sourceText = { value: '' };
        manager.resultOutput = { innerHTML: '', appendChild: () => {} };
        manager._updateStatusBar = () => {};
        manager.matchCountBadge = { textContent: '' };
        manager.matchCountStatus = { textContent: '' };
        manager._updateBadgeStyle = () => {};
        manager._updateWritingScoreStatus = () => {};
        manager._updateComprehensiveStatus = () => {};
        manager._latestAnalysis = { dummy: true };
        manager._hasTrackedInputStart = true;
        manager._lastTrackedAnalysisKey = 'old';

        manager.analyzeText();

        assert.strictEqual(manager._latestAnalysis, null);
        assert.strictEqual(manager._hasTrackedInputStart, false);
        assert.strictEqual(manager._lastTrackedAnalysisKey, '');
    });

    it('ルールメモがある場合は理由文にメモを優先利用する', () => {
        const manager = Object.create(UIManager.prototype);
        const reason = manager._buildRuleReason(
            { target: '全て', replacement: 'すべて', memo: '常用ひらがな表記に統一' },
            { content: '全て', replacement: 'すべて' }
        );

        assert.match(reason, /常用ひらがな表記に統一/);
    });

    it('誤検知フィードバック登録で件数加算とイベント送信が行われる', () => {
        const manager = Object.create(UIManager.prototype);
        manager._falsePositiveFeedback = {};
        const stored = [];
        const tracked = [];
        manager.storageManager = {
            saveFalsePositiveFeedback: (payload) => stored.push(payload)
        };
        manager._track = (eventName, params) => tracked.push({ eventName, params });

        const issue = {
            key: 'rule:0:全て->すべて',
            target: '全て',
            replacement: 'すべて',
            reason: '常用ひらがな表記に統一'
        };
        const first = manager._recordFalsePositiveFeedback(issue);
        const second = manager._recordFalsePositiveFeedback(issue);

        assert.strictEqual(first.count, 1);
        assert.strictEqual(second.count, 2);
        assert.strictEqual(stored.length, 2);
        assert.strictEqual(tracked.length, 2);
        assert.strictEqual(tracked[0].eventName, 'false_positive_reported');
    });

    it('長文かつWorker利用可能ならWorker解析を選択する', async () => {
        const manager = Object.create(UIManager.prototype);
        manager.WORKER_THRESHOLD = 10;
        manager.ruleEngine = { tokenize: () => [{ type: 'text', content: 'sync' }] };
        manager._shouldUseWorkerForText = () => true;
        manager._analyzeTokensInWorker = async () => [{ type: 'text', content: 'worker' }];

        const tokens = await manager._tokenizeForAnalysis('あいうえおかきくけこさ');

        assert.deepStrictEqual(tokens, [{ type: 'text', content: 'worker' }]);
    });

    it('短文はWorkerを使わず同期解析を選択する', async () => {
        const manager = Object.create(UIManager.prototype);
        manager.WORKER_THRESHOLD = 9999;
        manager.ruleEngine = { tokenize: (text) => [{ type: 'text', content: text }] };
        manager._shouldUseWorkerForText = UIManager.prototype._shouldUseWorkerForText;

        const tokens = await manager._tokenizeForAnalysis('短文');

        assert.deepStrictEqual(tokens, [{ type: 'text', content: '短文' }]);
    });
});

describe('UIManager: スコアリングと全部盛り判定', () => {
    it('二重敬語を検出できる', () => {
        const manager = Object.create(UIManager.prototype);
        const issues = manager._findDoubleHonorificIssues('ご連絡させていただきます。お伺いさせていただきます。');

        assert.strictEqual(issues.length, 2);
        assert.strictEqual(issues[0].phrase, 'ご連絡させていただきます');
        assert.strictEqual(issues[1].phrase, 'お伺いさせていただきます');
    });

    it('違反が増えるほど文章スコアが下がる', () => {
        const manager = Object.create(UIManager.prototype);

        const good = manager._calculateWritingScore({
            text: 'このたびはご連絡ありがとうございます。内容を確認し、明日までに返答します。',
            matchCount: 0,
            doubleHonorificIssues: [],
            metrics: {
                noSpaceChars: 40,
                averageSentenceLength: 20,
                kanjiPercent: 28
            }
        });

        const poor = manager._calculateWritingScore({
            text: 'ご連絡させていただきます。何卒よろしくお願い致します。',
            matchCount: 8,
            doubleHonorificIssues: [{ phrase: 'ご連絡させていただきます' }],
            metrics: {
                noSpaceChars: 32,
                averageSentenceLength: 38,
                kanjiPercent: 48
            }
        });

        assert.ok(good.score > poor.score);
        assert.strictEqual(typeof good.grade, 'string');
        assert.strictEqual(typeof poor.grade, 'string');
    });

    it('重大な違反があると全部盛り判定は要修正になる', () => {
        const manager = Object.create(UIManager.prototype);

        const summary = manager._buildComprehensiveChecks({
            matchCount: 6,
            doubleHonorificIssues: [{ phrase: 'ご連絡させていただきます' }],
            writingScore: { score: 54, grade: 'E' },
            metrics: {
                noSpaceChars: 120,
                averageSentenceLength: 72,
                kanjiPercent: 49
            }
        });

        assert.strictEqual(summary.status, '要修正');
        assert.ok(summary.items.some((item) => item.id === 'rule_violations' && item.level === 'fail'));
        assert.ok(summary.items.some((item) => item.id === 'double_honorific' && item.level === 'fail'));
    });

    it('同じ違反密度なら短文と長文でスコア差が開きすぎない', () => {
        const manager = Object.create(UIManager.prototype);

        const short = manager._calculateWritingScore({
            text: 'あ'.repeat(50),
            matchCount: 2,
            doubleHonorificIssues: [],
            metrics: {
                noSpaceChars: 50,
                averageSentenceLength: 25,
                kanjiPercent: 25
            }
        });

        const long = manager._calculateWritingScore({
            text: 'あ'.repeat(200),
            matchCount: 8,
            doubleHonorificIssues: [],
            metrics: {
                noSpaceChars: 200,
                averageSentenceLength: 25,
                kanjiPercent: 25
            }
        });

        assert.ok(Math.abs(short.score - long.score) <= 6);
    });

    it('十分な文字数がある文章はスコア信頼度がhighになる', () => {
        const manager = Object.create(UIManager.prototype);

        const short = manager._calculateWritingScore({
            text: '短文です。',
            matchCount: 0,
            doubleHonorificIssues: [],
            metrics: {
                noSpaceChars: 8,
                averageSentenceLength: 8,
                kanjiPercent: 20
            }
        });

        const long = manager._calculateWritingScore({
            text: '本日はご連絡ありがとうございます。内容を確認のうえ、明日までに回答いたします。'.repeat(3),
            matchCount: 0,
            doubleHonorificIssues: [],
            metrics: {
                noSpaceChars: 120,
                averageSentenceLength: 40,
                kanjiPercent: 28
            }
        });

        assert.strictEqual(short.confidence, 'low');
        assert.strictEqual(long.confidence, 'high');
    });
});
