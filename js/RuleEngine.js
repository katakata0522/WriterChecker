/**
 * Writer Checker — RuleEngine V3
 * 全文上で正規表現の文脈を維持し、ルール別除外と自動修正可否を尊重する。
 */
import {
    collectScopedRanges,
    isMatchExcluded,
    normalizeRegexFlags,
    normalizeRuleArray,
    normalizeRuleV3,
    validateRegexSafety
} from './RuleSchema.js';

class OccupiedRangeIndex {
    constructor() {
        this.ranges = [];
    }

    _insertionIndex(start) {
        let low = 0;
        let high = this.ranges.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (this.ranges[middle].start < start) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    overlaps(start, end) {
        const index = this._insertionIndex(start);
        const previous = this.ranges[index - 1];
        const next = this.ranges[index];
        return Boolean((previous && previous.end > start) || (next && next.start < end));
    }

    add(start, end) {
        this.ranges.splice(this._insertionIndex(start), 0, { start, end });
    }
}

export function expandReplacement(replacement, { match, captures, offset, source, groups }) {
    return String(replacement).replace(/\$([$&'`]|\d{1,2}|<[^>]+>)/g, (whole, token) => {
        if (token === '$') return '$';
        if (token === '&') return match;
        if (token === '`') return source.slice(0, offset);
        if (token === "'") return source.slice(offset + match.length);
        if (token.startsWith('<') && token.endsWith('>')) {
            if (!groups) return whole;
            return groups[token.slice(1, -1)] ?? '';
        }
        if (/^\d{1,2}$/.test(token)) {
            let index = Number(token);
            if (index > 0 && index <= captures.length) return captures[index - 1] ?? '';
            if (token.length === 2) {
                index = Number(token[0]);
                if (index > 0 && index <= captures.length) return `${captures[index - 1] ?? ''}${token[1]}`;
            }
        }
        return whole;
    });
}

function replacementForMatch(rule, match, text) {
    return expandReplacement(rule.replacement, {
        match: match[0], captures: match.slice(1), offset: match.index, source: text, groups: match.groups || null
    });
}

export class RuleEngine {
    constructor() {
        this.rules = [];
        this.removeAsterisks = false;
    }

    setRules(rules) {
        this.rules = normalizeRuleArray(rules) || [];
    }

    setRemoveAsterisks() {
        this.removeAsterisks = false;
    }

    static escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    _buildRegex(rawRule) {
        const rule = normalizeRuleV3(rawRule);
        if (!rule?.target) return null;
        try {
            if (rule.isRegex) {
                const validation = validateRegexSafety(rule.target);
                if (!validation.safe) {
                    console.warn(`安全でない正規表現: "${rule.target}"`, validation.reason);
                    return null;
                }
            }
            const pattern = rule.isRegex ? rule.target : RuleEngine.escapeRegExp(rule.target);
            const flags = rule.isRegex ? normalizeRegexFlags(rule.flags) : 'g';
            return new RegExp(pattern, flags);
        } catch (error) {
            console.warn(`無効な正規表現パターン: "${rule.target}"`, error.message);
            return null;
        }
    }

    tokenize(text) {
        if (!text) return [];
        const protectedRanges = collectScopedRanges(text);
        const occupied = new OccupiedRangeIndex();
        const highlights = [];

        for (const [ruleIndex, rule] of this.rules.entries()) {
            if (!rule?.enabled || !rule.target) continue;
            if (!rule.isRegex && !text.includes(rule.target)) continue;
            const regex = this._buildRegex(rule);
            if (!regex) continue;
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match[0] === '') {
                    if (regex.lastIndex === match.index) regex.lastIndex++;
                    continue;
                }
                const start = match.index;
                const end = start + match[0].length;
                if (occupied.overlaps(start, end)) continue;
                if (isMatchExcluded(protectedRanges, start, end, rule.excludeScopes)) continue;
                highlights.push({ start, end, token: {
                    type: 'highlight', content: match[0], replacement: replacementForMatch(rule, match, text),
                    target: rule.target, ruleIndex, ruleMeta: rule, start, end
                }});
                occupied.add(start, end);
            }
        }

        highlights.sort((left, right) => left.start - right.start || left.end - right.end);
        const tokens = [];
        let cursor = 0;
        for (const item of highlights) {
            if (item.start > cursor) tokens.push({ type: 'text', content: text.slice(cursor, item.start) });
            tokens.push(item.token);
            cursor = item.end;
        }
        if (cursor < text.length) tokens.push({ type: 'text', content: text.slice(cursor) });
        return tokens;
    }

    /**
     * 検出時と同じトークン列から修正結果を組み立てる。
     * 置換結果を次のルールへ再入力しないため、連鎖置換とプレビュー不一致を防ぐ。
     */
    createFixPlan(text, preparedTokens = null) {
        const tokens = Array.isArray(preparedTokens) ? preparedTokens : this.tokenize(text);
        let autoFixCount = 0;
        let manualCount = 0;
        const cleanedText = tokens.map((token) => {
            if (token.type !== 'highlight') return token.content;
            if (token.ruleMeta?.autoFix === false) {
                manualCount++;
                return token.content;
            }
            const replacement = token.replacement ?? '';
            if (replacement !== token.content) autoFixCount++;
            return replacement;
        }).join('');
        return { cleanedText, autoFixCount, manualCount, tokens };
    }

    getCleanedText(text) {
        if (!text) return text;
        return this.createFixPlan(text).cleanedText;
    }
}
