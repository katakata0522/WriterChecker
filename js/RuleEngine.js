/**
 * Writer Checker — RuleEngine
 * テキストに対してルールベースのマッチング・置換を行うエンジン。
 * リテラル文字列と正規表現パターンの両方に対応。
 */
export class RuleEngine {
    constructor() {
        /** @type {Array<{target: string, replacement: string, isRegex?: boolean}>} */
        this.rules = [];
        this.removeAsterisks = true;
    }

    setRules(rules) {
        this.rules = rules;
    }

    setRemoveAsterisks(value) {
        this.removeAsterisks = value;
    }

    /**
     * 正規表現の特殊文字をエスケープする
     * @param {string} str
     * @returns {string}
     */
    static escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * ルールからRegExpを安全に生成する。不正パターンはnullを返す。
     * @param {object} rule
     * @returns {RegExp|null}
     */
    _buildRegex(rule) {
        if (!rule.target) return null;
        try {
            const pattern = rule.isRegex ? rule.target : RuleEngine.escapeRegExp(rule.target);
            return new RegExp(pattern, 'g');
        } catch (e) {
            console.warn(`無効な正規表現パターン: "${rule.target}"`, e.message);
            return null;
        }
    }

    /**
     * テキストをルールに基づいて「text」と「highlight」のトークン配列に分解する
     * @param {string} text
     * @returns {Array<{type: string, content: string, replacement?: string, target?: string}>}
     */
    tokenize(text) {
        if (!text) return [];

        let tokens = [{ type: 'text', content: text }];

        // アスタリスク除去（AI出力クリーン用）
        if (this.removeAsterisks) {
            tokens = this._applyHighlight(tokens, /(\*\*|\*)/g, '', '');
        }

        // 各ルールを順に適用（enabled=falseのルールはスキップ）
        for (const rule of this.rules) {
            if (rule.enabled === false) continue;
            const regex = this._buildRegex(rule);
            if (!regex) continue;
            tokens = this._applyHighlight(tokens, regex, rule.replacement, rule.target);
        }

        return tokens;
    }

    /**
     * トークン配列内のtextトークンにregexを適用し、マッチ箇所をhighlightトークンに分割する
     * @param {Array} tokens
     * @param {RegExp} regex
     * @param {string} replacement
     * @param {string} originalTarget
     * @returns {Array}
     */
    _applyHighlight(tokens, regex, replacement, originalTarget) {
        const result = [];

        for (const token of tokens) {
            if (token.type !== 'text') {
                result.push(token);
                continue;
            }

            let lastIndex = 0;
            let match;
            regex.lastIndex = 0;

            while ((match = regex.exec(token.content)) !== null) {
                // 空文字マッチの無限ループ防止
                if (match[0] === '' && regex.lastIndex === match.index) {
                    regex.lastIndex++;
                    continue;
                }

                // マッチ前のテキスト
                if (match.index > lastIndex) {
                    result.push({ type: 'text', content: token.content.substring(lastIndex, match.index) });
                }

                // マッチ箇所をハイライトトークンとして追加
                result.push({
                    type: 'highlight',
                    content: match[0],
                    replacement,
                    target: originalTarget || match[0]
                });

                lastIndex = regex.lastIndex;
            }

            // 残りのテキスト
            if (lastIndex < token.content.length) {
                result.push({ type: 'text', content: token.content.substring(lastIndex) });
            }
        }

        return result;
    }

    /**
     * 全ルールを一括適用したクリーンテキストを返す
     * @param {string} text
     * @returns {string}
     */
    getCleanedText(text) {
        if (!text) return text;

        let result = text;

        if (this.removeAsterisks) {
            result = result.replace(/\*\*/g, '').replace(/\*/g, '');
        }

        for (const rule of this.rules) {
            if (rule.enabled === false) continue;
            const regex = this._buildRegex(rule);
            if (!regex) continue;
            result = result.replace(regex, rule.replacement);
        }

        return result;
    }
}
