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
    overlaps,
    validateRegexSafety
} from './RuleSchema.js';

function isOccupied(occupied, start, end) {
    return occupied.some((range) => overlaps(start, end, range.start, range.end));
}

function parseReplaceArguments(args) {
    const hasNamedGroups = typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null;
    return {
        match: args[0],
        captures: args.slice(1, hasNamedGroups ? -3 : -2),
        offset: hasNamedGroups ? args[args.length - 3] : args[args.length - 2],
        source: hasNamedGroups ? args[args.length - 2] : args[args.length - 1],
        groups: hasNamedGroups ? args[args.length - 1] : null
    };
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
        const occupied = [];
        const highlights = [];
        for (const [ruleIndex, rawRule] of this.rules.entries()) {
            const rule = normalizeRuleV3(rawRule);
            if (!rule || !rule.enabled || !rule.target) continue;
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
                if (isOccupied(occupied, start, end)) continue;
                if (isMatchExcluded(protectedRanges, start, end, rule.excludeScopes)) continue;
                highlights.push({ start, end, token: {
                    type: 'highlight', content: match[0], replacement: replacementForMatch(rule, match, text),
                    target: rule.target, ruleIndex, ruleMeta: rule, start, end
                }});
                occupied.push({ start, end });
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

    _replaceWithPolicy(text, regex, rule) {
        const protectedRanges = collectScopedRanges(text);
        regex.lastIndex = 0;
        return text.replace(regex, (...args) => {
            const parsed = parseReplaceArguments(args);
            const end = parsed.offset + parsed.match.length;
            if (isMatchExcluded(protectedRanges, parsed.offset, end, rule.excludeScopes)) return parsed.match;
            return expandReplacement(rule.replacement, parsed);
        });
    }

    getCleanedText(text) {
        if (!text) return text;
        let result = text;
        for (const rawRule of this.rules) {
            const rule = normalizeRuleV3(rawRule);
            if (!rule || !rule.enabled || !rule.autoFix || !rule.target) continue;
            const regex = this._buildRegex(rule);
            if (!regex) continue;
            result = this._replaceWithPolicy(result, regex, rule);
        }
        return result;
    }
}
