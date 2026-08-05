/** Writer Checker — StorageManager */
import { normalizeRuleArray, normalizeRuleV3, RULE_SCHEMA_VERSION } from './RuleSchema.js';

function rule(target, replacement, overrides = {}) { return normalizeRuleV3({ target, replacement, ...overrides }); }
function rulesFromPairs(pairs, overrides = {}) { return pairs.map(([target, replacement]) => rule(target, replacement, overrides)); }

export class StorageManager {
    constructor() {
        this.STORAGE_KEY_RULES = 'writerCheckerRulesV2';
        this.STORAGE_KEY_LEGACY = 'writerCheckerRules';
        this.STORAGE_KEY_ACTIVE_SET = 'writerCheckerActiveSet';
        this.STORAGE_KEY_ASTERISKS = 'writerCheckerRemoveAsterisks';
        this.STORAGE_KEY_ANALYTICS_ENABLED = 'writerCheckerAnalyticsEnabled';
        this.UNSAFE_RULE_SET_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
        this.RULE_SCHEMA_VERSION = RULE_SCHEMA_VERSION;
        this.defaultRules = {
            'デフォルト (汎用)': rulesFromPairs([
                ['出来る', 'できる'], ['下さい', 'ください'], ['頂く', 'いただく'], ['致します', 'いたします'], ['有り難う', 'ありがとう'], ['宜しく', 'よろしく'], ['色々', 'いろいろ'], ['沢山', 'たくさん'], ['殆ど', 'ほとんど'], ['何故', 'なぜ'], ['但し', 'ただし'], ['尚', 'なお'], ['即ち', 'すなわち'], ['及び', 'および'], ['ＷＥＢ', 'Web'], ['Ｅメール', 'Eメール'], ['コンピューター', 'コンピュータ'], ['サーバー', 'サーバ'], ['ユーザー', 'ユーザ'], ['ブラウザー', 'ブラウザ']
            ]),
            'ブログ・ライター用': rulesFromPairs([
                ['出来る', 'できる'], ['出来ない', 'できない'], ['出来れば', 'できれば'], ['下さい', 'ください'], ['頂く', 'いただく'], ['頂ける', 'いただける'], ['頂きます', 'いただきます'], ['致します', 'いたします'], ['御座います', 'ございます'], ['仰る', 'おっしゃる'], ['有り難う', 'ありがとう'], ['宜しく', 'よろしく'], ['全て', 'すべて'], ['更に', 'さらに'], ['殆ど', 'ほとんど'], ['予め', 'あらかじめ'], ['敢えて', 'あえて'], ['是非', 'ぜひ'], ['沢山', 'たくさん'], ['何故', 'なぜ'], ['但し', 'ただし'], ['尚', 'なお'], ['筈', 'はず'], ['迄', 'まで'], ['色々', 'いろいろ']
            ], { category: '表記統一' }),
            'ビジネスメール用': rulesFromPairs([
                ['すいません', 'すみません'], ['ご確認して', 'ご確認いただき'], ['させて頂き', 'させていただき'], ['とんでもございません', 'とんでもないことです'], ['ご苦労様', 'お疲れ様'], ['了解しました', '承知いたしました'], ['なるほど', 'おっしゃるとおり'], ['大丈夫です', '問題ございません'], ['やっぱり', 'やはり'], ['ちょっと', '少々']
            ], { category: '敬語・表現', severity: 'warning', autoFix: false }),
            'AI出力クリーン': [
                rule('**', '', { severity: 'info', category: 'Markdown装飾', reason: 'Markdownの太字記号を削除します。' }),
                rule('*', '', { severity: 'info', category: 'Markdown装飾', reason: 'Markdownの強調記号を削除します。' }),
                rule('^#{1,3}\\s+', '', { isRegex: true, flags: 'gm', severity: 'info', category: 'Markdown装飾', reason: '行頭のMarkdown見出し記号を削除します。' }),
                rule('^[-]\\s+', '', { isRegex: true, flags: 'gm', severity: 'info', category: 'Markdown装飾', reason: '行頭のMarkdown箇条書き記号を削除します。' }),
                rule('^>\\s+', '', { isRegex: true, flags: 'gm', severity: 'info', category: 'Markdown装飾', reason: '行頭のMarkdown引用記号を削除します。' }),
                rule('^\\s*---+\\s*$', '', { isRegex: true, flags: 'gm', severity: 'info', category: 'Markdown装飾', reason: 'Markdownの区切り線を削除します。' }),
                rule('```', '', { severity: 'info', category: 'Markdown装飾', reason: 'コードフェンス記号を削除します。', excludeScopes: ['url', 'email'] }),
                rule('`', '', { severity: 'info', category: 'Markdown装飾', reason: 'インラインコード記号を削除します。', excludeScopes: ['url', 'email'] })
            ]
        };
        this.presetDescriptions = {
            'デフォルト (汎用)': '一般的な表記ゆれを確認する基本ルール',
            'ブログ・ライター用': '記事で使われやすい表記ゆれを確認するルール',
            'ビジネスメール用': '敬語や口語表現を確認するルール',
            'AI出力クリーン': 'Markdown装飾を明示的なルールとして整理するセット'
        };
        this.presetAsteriskDefaults = Object.fromEntries(Object.keys(this.defaultRules).map((name) => [name, false]));
    }

    loadAllRuleSets() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY_RULES);
            if (saved) {
                const sanitized = this._sanitizeRuleSetsObject(JSON.parse(saved));
                if (Object.keys(sanitized).length > 0) return sanitized;
            } else return this._migrateLegacy();
        } catch (error) { console.error('ルールセットの読み込みに失敗:', error); }
        return this._cloneDefaultRules();
    }

    saveAllRuleSets(ruleSetsObj) {
        try { localStorage.setItem(this.STORAGE_KEY_RULES, JSON.stringify(this._sanitizeRuleSetsObject(ruleSetsObj))); }
        catch (error) { console.error('ルールセットの保存に失敗:', error); }
    }

    loadActiveSetName() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY_ACTIVE_SET);
            if (this._isSafeRuleSetName(saved)) return saved;
        } catch (error) { console.error('アクティブセット名の読み込みに失敗:', error); }
        return Object.keys(this.defaultRules)[0];
    }

    saveActiveSetName(name) {
        try { if (this._isSafeRuleSetName(name)) localStorage.setItem(this.STORAGE_KEY_ACTIVE_SET, name); }
        catch (error) { console.error('アクティブセット名の保存に失敗:', error); }
    }

    loadAsteriskSetting() { return false; }
    saveAsteriskSetting() {
        try { localStorage.setItem(this.STORAGE_KEY_ASTERISKS, 'false'); }
        catch (error) { console.error('旧アスタリスク設定の無効化に失敗:', error); }
    }

    loadAnalyticsEnabled() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY_ANALYTICS_ENABLED);
            return saved !== null ? saved === 'true' : true;
        } catch (error) { console.error('計測設定の読み込みに失敗:', error); return true; }
    }

    saveAnalyticsEnabled(value) {
        try { localStorage.setItem(this.STORAGE_KEY_ANALYTICS_ENABLED, String(value === true)); }
        catch (error) { console.error('計測設定の保存に失敗:', error); }
    }

    _cloneDefaultRules() {
        return Object.fromEntries(Object.entries(this.defaultRules).map(([name, rules]) => [name, rules.map((item) => ({ ...item, excludeScopes: [...item.excludeScopes] }))]));
    }
    _isSafeRuleSetName(name) { return typeof name === 'string' && name.trim().length > 0 && name.length <= 120 && !this.UNSAFE_RULE_SET_NAMES.has(name); }
    _sanitizeRule(ruleValue) { return normalizeRuleV3(ruleValue); }
    _sanitizeRuleArray(ruleArray) { return normalizeRuleArray(ruleArray); }
    _sanitizeRuleSetsObject(obj) {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
        const result = {};
        for (const [setName, rules] of Object.entries(obj)) {
            if (!this._isSafeRuleSetName(setName)) continue;
            const normalized = this._sanitizeRuleArray(rules);
            if (normalized !== null) result[setName] = normalized;
        }
        return result;
    }
    _migrateLegacy() {
        try {
            const legacy = localStorage.getItem(this.STORAGE_KEY_LEGACY);
            if (legacy) {
                const normalized = this._sanitizeRuleArray(JSON.parse(legacy));
                if (normalized?.length) {
                    const migrated = { 'デフォルト (移行済み)': normalized };
                    this.saveAllRuleSets(migrated);
                    return migrated;
                }
            }
        } catch (error) { console.error('V1マイグレーションに失敗:', error); }
        return this._cloneDefaultRules();
    }
}
