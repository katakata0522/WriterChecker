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
                if (this._isValidRuleSetsObject(parsed)) return parsed;
            } else {
                return this._migrateLegacy();
            }
        } catch (e) {
            console.error('ルールセットの読み込みに失敗:', e);
        }
        return JSON.parse(JSON.stringify(this.defaultRules));
    }

    saveAllRuleSets(ruleSetsObj) {
        try {
            localStorage.setItem(this.STORAGE_KEY_RULES, JSON.stringify(ruleSetsObj));
        } catch (e) {
            console.error('ルールセットの保存に失敗（容量超過？）:', e);
        }
    }

    // =========================================================================
    //  アクティブセット名
    // =========================================================================

    loadActiveSetName() {
        try {
            return localStorage.getItem(this.STORAGE_KEY_ACTIVE_SET) || Object.keys(this.defaultRules)[0];
        } catch (e) {
            console.error('アクティブセット名の読み込みに失敗:', e);
            return Object.keys(this.defaultRules)[0];
        }
    }

    saveActiveSetName(name) {
        try {
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
    //  ヘルパー
    // =========================================================================

    _isValidRuleSetsObject(obj) {
        return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
    }

    /** V1（単一配列）→ V2（名前付きオブジェクト）マイグレーション */
    _migrateLegacy() {
        try {
            const legacy = localStorage.getItem(this.STORAGE_KEY_LEGACY);
            if (legacy) {
                const parsed = JSON.parse(legacy);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const migrated = { 'デフォルト (移行済み)': parsed };
                    this.saveAllRuleSets(migrated);
                    return migrated;
                }
            }
        } catch (e) {
            console.error('V1マイグレーションに失敗:', e);
        }
        return JSON.parse(JSON.stringify(this.defaultRules));
    }
}
