/**
 * Writer Checker — StorageManager
 * localStorage経由でルールセット・設定の永続化を行う。
 * V1→V2マイグレーション対応。
 */
export class StorageManager {
    constructor() {
        this.STORAGE_KEY_RULES = 'writerCheckerRulesV2';
        this.STORAGE_KEY_LEGACY = 'writerCheckerRules';
        this.STORAGE_KEY_ACTIVE_SET = 'writerCheckerActiveSet';
        this.STORAGE_KEY_ASTERISKS = 'writerCheckerRemoveAsterisks';
        this.STORAGE_KEY_ANALYTICS_ENABLED = 'writerCheckerAnalyticsEnabled';
        this.STORAGE_KEY_FALSE_POSITIVE_FEEDBACK = 'writerCheckerFalsePositiveFeedbackV1';
        this.UNSAFE_RULE_SET_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

        /** @type {Object<string, Array<{target: string, replacement: string, isRegex?: boolean}>>} */
        this.defaultRules = {
            'デフォルト (汎用)': [
                { target: '出来る', replacement: 'できる' },
                { target: '下さい', replacement: 'ください' },
                { target: '頂く', replacement: 'いただく' },
                { target: '致します', replacement: 'いたします' },
                { target: '有り難う', replacement: 'ありがとう' },
                { target: '宜しく', replacement: 'よろしく' },
                { target: '色々', replacement: 'いろいろ' },
                { target: '沢山', replacement: 'たくさん' },
                { target: '殆ど', replacement: 'ほとんど' },
                { target: '何故', replacement: 'なぜ' },
                { target: '但し', replacement: 'ただし' },
                { target: '尚', replacement: 'なお' },
                { target: '即ち', replacement: 'すなわち' },
                { target: '及び', replacement: 'および' },
                { target: 'ＷＥＢ', replacement: 'Web' },
                { target: 'Ｅメール', replacement: 'Eメール' },
                { target: 'コンピューター', replacement: 'コンピュータ' },
                { target: 'サーバー', replacement: 'サーバ' },
                { target: 'ユーザー', replacement: 'ユーザ' },
                { target: 'ブラウザー', replacement: 'ブラウザ' },
            ],
            'ブログ・ライター用': [
                { target: '出来る', replacement: 'できる' },
                { target: '出来ない', replacement: 'できない' },
                { target: '出来れば', replacement: 'できれば' },
                { target: '下さい', replacement: 'ください' },
                { target: '頂く', replacement: 'いただく' },
                { target: '頂ける', replacement: 'いただける' },
                { target: '頂きます', replacement: 'いただきます' },
                { target: '致します', replacement: 'いたします' },
                { target: '御座います', replacement: 'ございます' },
                { target: '仰る', replacement: 'おっしゃる' },
                { target: '有り難う', replacement: 'ありがとう' },
                { target: '宜しく', replacement: 'よろしく' },
                { target: '全て', replacement: 'すべて' },
                { target: '更に', replacement: 'さらに' },
                { target: '殆ど', replacement: 'ほとんど' },
                { target: '予め', replacement: 'あらかじめ' },
                { target: '敢えて', replacement: 'あえて' },
                { target: '是非', replacement: 'ぜひ' },
                { target: '沢山', replacement: 'たくさん' },
                { target: '何故', replacement: 'なぜ' },
                { target: '但し', replacement: 'ただし' },
                { target: '尚', replacement: 'なお' },
                { target: '筈', replacement: 'はず' },
                { target: '迄', replacement: 'まで' },
                { target: '色々', replacement: 'いろいろ' },
            ],
            'ビジネスメール用': [
                { target: 'すいません', replacement: 'すみません' },
                { target: 'ご確認して', replacement: 'ご確認いただき' },
                { target: 'させて頂き', replacement: 'させていただき' },
                { target: 'とんでもございません', replacement: 'とんでもないことです' },
                { target: 'ご苦労様', replacement: 'お疲れ様' },
                { target: '了解しました', replacement: '承知いたしました' },
                { target: 'なるほど', replacement: 'おっしゃるとおり' },
                { target: '大丈夫です', replacement: '問題ございません' },
                { target: 'やっぱり', replacement: 'やはり' },
                { target: 'ちょっと', replacement: '少々' },
            ],
            'AI出力クリーン': [
                { target: '### ', replacement: '' },
                { target: '## ', replacement: '' },
                { target: '# ', replacement: '' },
                { target: '- ', replacement: '' },
                { target: '> ', replacement: '' },
                { target: '---', replacement: '' },
                { target: '```', replacement: '' },
                { target: '`', replacement: '' },
            ],
        };

        /** F-02: プリセットの説明文 */
        this.presetDescriptions = {
            'デフォルト (汎用)': '漢字→ひらがな変換やカタカナ長音統一など、どの文章にも使える基本ルール20件',
            'ブログ・ライター用': '副詞・敬語・接続詞の表記ゆれを網羅したライター向けルール25件',
            'ビジネスメール用': '敬語の誤用や口語表現を丁寧表現に置換するルール10件',
            'AI出力クリーン': 'ChatGPT等のMarkdown装飾(###, ```, >等)を一括除去するルール8件',
        };

        /** F-07: プリセットごとのアスタリスク除去推奨 */
        this.presetAsteriskDefaults = {
            'デフォルト (汎用)': true,
            'ブログ・ライター用': false,
            'ビジネスメール用': false,
            'AI出力クリーン': true,
        };
    }

    // =========================================================================
    //  ルールセット
    // =========================================================================

    loadAllRuleSets() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY_RULES);
            if (saved) {
                const parsed = JSON.parse(saved);
                const sanitized = this._sanitizeRuleSetsObject(parsed);
                if (Object.keys(sanitized).length > 0) return sanitized;
            } else {
                return this._migrateLegacy();
            }
        } catch (e) {
            console.error('ルールセットの読み込みに失敗:', e);
        }
        return this._cloneDefaultRules();
    }

    saveAllRuleSets(ruleSetsObj) {
        try {
            const sanitized = this._sanitizeRuleSetsObject(ruleSetsObj);
            localStorage.setItem(this.STORAGE_KEY_RULES, JSON.stringify(sanitized));
        } catch (e) {
            console.error('ルールセットの保存に失敗（容量超過？）:', e);
        }
    }

    // =========================================================================
    //  アクティブセット名
    // =========================================================================

    loadActiveSetName() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY_ACTIVE_SET);
            if (this._isSafeRuleSetName(saved)) return saved;
            return Object.keys(this.defaultRules)[0];
        } catch (e) {
            console.error('アクティブセット名の読み込みに失敗:', e);
            return Object.keys(this.defaultRules)[0];
        }
    }

    saveActiveSetName(name) {
        try {
            if (!this._isSafeRuleSetName(name)) return;
            localStorage.setItem(this.STORAGE_KEY_ACTIVE_SET, name);
        } catch (e) {
            console.error('アクティブセット名の保存に失敗:', e);
        }
    }

    // =========================================================================
    //  アスタリスク除去設定
    // =========================================================================

    loadAsteriskSetting() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY_ASTERISKS);
            return saved !== null ? saved === 'true' : true;
        } catch (e) {
            console.error('アスタリスク設定の読み込みに失敗:', e);
            return true;
        }
    }

    saveAsteriskSetting(value) {
        try {
            localStorage.setItem(this.STORAGE_KEY_ASTERISKS, String(value));
        } catch (e) {
            console.error('アスタリスク設定の保存に失敗:', e);
        }
    }

    // =========================================================================
    //  計測設定
    // =========================================================================

    loadAnalyticsEnabled() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY_ANALYTICS_ENABLED);
            return saved !== null ? saved === 'true' : true;
        } catch (e) {
            console.error('計測設定の読み込みに失敗:', e);
            return true;
        }
    }

    saveAnalyticsEnabled(value) {
        try {
            localStorage.setItem(this.STORAGE_KEY_ANALYTICS_ENABLED, String(value === true));
        } catch (e) {
            console.error('計測設定の保存に失敗:', e);
        }
    }

    // =========================================================================
    //  誤検知フィードバック
    // =========================================================================

    loadFalsePositiveFeedback() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY_FALSE_POSITIVE_FEEDBACK);
            if (!saved) return {};
            const parsed = JSON.parse(saved);
            return this._sanitizeFalsePositiveFeedbackMap(parsed);
        } catch (e) {
            console.error('誤検知フィードバックの読み込みに失敗:', e);
            return {};
        }
    }

    saveFalsePositiveFeedback(feedbackMap) {
        try {
            const sanitized = this._sanitizeFalsePositiveFeedbackMap(feedbackMap);
            localStorage.setItem(this.STORAGE_KEY_FALSE_POSITIVE_FEEDBACK, JSON.stringify(sanitized));
        } catch (e) {
            console.error('誤検知フィードバックの保存に失敗:', e);
        }
    }

    incrementFalsePositiveFeedback(issueKey, issueMeta = {}) {
        if (!this._isSafeFeedbackKey(issueKey)) return null;
        const current = this.loadFalsePositiveFeedback();
        const previous = current[issueKey] || { count: 0 };
        const target = typeof issueMeta.target === 'string' ? issueMeta.target.slice(0, 120) : '';
        const replacement = typeof issueMeta.replacement === 'string' ? issueMeta.replacement.slice(0, 120) : '';
        const reason = typeof issueMeta.reason === 'string' ? issueMeta.reason.slice(0, 200) : '';

        const next = {
            count: Math.max(0, Math.floor(previous.count || 0)) + 1,
            target,
            replacement,
            reason,
            lastReportedAt: new Date().toISOString()
        };
        current[issueKey] = next;
        this.saveFalsePositiveFeedback(current);
        return next;
    }

    // =========================================================================
    //  ヘルパー
    // =========================================================================

    _cloneDefaultRules() {
        return JSON.parse(JSON.stringify(this.defaultRules));
    }

    _isSafeRuleSetName(name) {
        return typeof name === 'string'
            && name.trim().length > 0
            && !this.UNSAFE_RULE_SET_NAMES.has(name);
    }

    _sanitizeRule(rule) {
        if (typeof rule !== 'object' || rule === null || typeof rule.target !== 'string') return null;

        const sanitized = {
            target: rule.target,
            replacement: typeof rule.replacement === 'string' ? rule.replacement : ''
        };
        if (rule.isRegex === true) sanitized.isRegex = true;
        if (rule.enabled === false) sanitized.enabled = false;
        if (typeof rule.memo === 'string' && rule.memo) sanitized.memo = rule.memo;
        return sanitized;
    }

    _sanitizeRuleArray(ruleArray) {
        if (!Array.isArray(ruleArray)) return null;
        const sanitized = [];
        for (const rule of ruleArray) {
            const normalized = this._sanitizeRule(rule);
            if (normalized) sanitized.push(normalized);
        }
        return sanitized;
    }

    _sanitizeRuleSetsObject(obj) {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};

        const sanitizedSets = {};
        for (const [setName, rules] of Object.entries(obj)) {
            if (!this._isSafeRuleSetName(setName)) continue;
            const sanitizedRules = this._sanitizeRuleArray(rules);
            if (sanitizedRules === null) continue;
            sanitizedSets[setName] = sanitizedRules;
        }
        return sanitizedSets;
    }

    _isSafeFeedbackKey(key) {
        return typeof key === 'string'
            && key.length > 0
            && key.length <= 180
            && !this.UNSAFE_RULE_SET_NAMES.has(key);
    }

    _sanitizeFalsePositiveFeedbackItem(value) {
        if (typeof value !== 'object' || value === null) return null;
        const count = Number.isFinite(value.count) ? Math.floor(value.count) : 0;
        if (count <= 0) return null;

        const sanitized = {
            count: Math.min(count, 999999),
            target: typeof value.target === 'string' ? value.target.slice(0, 120) : '',
            replacement: typeof value.replacement === 'string' ? value.replacement.slice(0, 120) : '',
            reason: typeof value.reason === 'string' ? value.reason.slice(0, 200) : ''
        };
        if (typeof value.lastReportedAt === 'string' && value.lastReportedAt) {
            sanitized.lastReportedAt = value.lastReportedAt;
        }
        return sanitized;
    }

    _sanitizeFalsePositiveFeedbackMap(map) {
        if (typeof map !== 'object' || map === null || Array.isArray(map)) return {};
        const sanitized = {};
        for (const [key, value] of Object.entries(map)) {
            if (!this._isSafeFeedbackKey(key)) continue;
            const item = this._sanitizeFalsePositiveFeedbackItem(value);
            if (!item) continue;
            sanitized[key] = item;
        }
        return sanitized;
    }

    /** V1（単一配列）→ V2（名前付きオブジェクト）マイグレーション */
    _migrateLegacy() {
        try {
            const legacy = localStorage.getItem(this.STORAGE_KEY_LEGACY);
            if (legacy) {
                const parsed = JSON.parse(legacy);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const sanitized = this._sanitizeRuleArray(parsed);
                    if (!sanitized || sanitized.length === 0) return this._cloneDefaultRules();
                    const migrated = { 'デフォルト (移行済み)': sanitized };
                    this.saveAllRuleSets(migrated);
                    return migrated;
                }
            }
        } catch (e) {
            console.error('V1マイグレーションに失敗:', e);
        }
        return this._cloneDefaultRules();
    }
}
