/**
 * Writer Checker — V3 policy-aware rule engine
 * 正規表現を全文上で評価しつつ、マッチ範囲ごとに除外ポリシーを適用する。
 */
import { normalizeRuleV3 } from './RuleSchemaV3Enhancer.js';
import { collectScopedRanges } from './RulePolicyV3Enhancer.js';

const DEFAULT_EXCLUDE_SCOPES = ['url', 'email', 'code'];

function overlaps(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart < rightEnd && leftEnd > rightStart;
}

function isExcludedMatch(ranges, start, end, excludeScopes) {
    if (!Array.isArray(excludeScopes) || excludeScopes.length === 0) return false;
    return ranges.some((range) =>
        overlaps(start, end, range.start, range.end)
        && [...range.scopes].some((scope) => excludeScopes.includes(scope))
    );
}

function isOccupied(occupied, start, end) {
    return occupied.some((range) => overlaps(start, end, range.start, range.end));
}

function collectMatches({ text, regex, rule, ruleIndex, protectedRanges, occupied }) {
    const matches = [];
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
        if (isExcludedMatch(protectedRanges, start, end, rule.excludeScopes)) continue;

        matches.push({
            start,
            end,
            token: {
                type: 'highlight',
                content: match[0],
                replacement: rule.replacement,
                target: rule.target || match[0],
                ruleIndex,
                ruleMeta: rule
            }
        });
        occupied.push({ start, end });
    }
    return matches;
}

function tokenizePolicyAware(engine, text) {
    if (!text) return [];
    const protectedRanges = collectScopedRanges(text);
    const occupied = [];
    const highlights = [];

    if (engine.removeAsterisks) {
        const decorationRule = normalizeRuleV3({
            id: 'builtin-remove-asterisks',
            target: '*',
            replacement: '',
            severity: 'info',
            category: '装飾',
            reason: 'AI出力などに含まれるアスタリスク装飾です。',
            excludeScopes: DEFAULT_EXCLUDE_SCOPES,
            autoFix: true
        });
        highlights.push(...collectMatches({
            text,
            regex: /(\*\*|\*)/g,
            rule: decorationRule,
            ruleIndex: null,
            protectedRanges,
            occupied
        }));
    }

    for (const [ruleIndex, rawRule] of engine.rules.entries()) {
        const rule = normalizeRuleV3(rawRule);
        if (!rule || rule.enabled === false || !rule.target) continue;
        const regex = engine._buildRegex(rule);
        if (!regex) continue;
        highlights.push(...collectMatches({
            text,
            regex,
            rule,
            ruleIndex,
            protectedRanges,
            occupied
        }));
    }

    highlights.sort((left, right) => left.start - right.start || left.end - right.end);
    const tokens = [];
    let cursor = 0;
    for (const highlight of highlights) {
        if (highlight.start > cursor) {
            tokens.push({ type: 'text', content: text.slice(cursor, highlight.start) });
        }
        tokens.push(highlight.token);
        cursor = highlight.end;
    }
    if (cursor < text.length) tokens.push({ type: 'text', content: text.slice(cursor) });
    return tokens;
}

function parseReplaceArguments(args) {
    const hasNamedGroups = typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null;
    const groups = hasNamedGroups ? args[args.length - 1] : null;
    const source = hasNamedGroups ? args[args.length - 2] : args[args.length - 1];
    const offset = hasNamedGroups ? args[args.length - 3] : args[args.length - 2];
    const captures = args.slice(1, hasNamedGroups ? -3 : -2);
    return { match: args[0], captures, offset, source, groups };
}

function expandReplacement(replacement, { match, captures, offset, source, groups }) {
    return String(replacement).replace(/\$([$&'`]|\d{1,2}|<[^>]+>)/g, (whole, token) => {
        if (token === '$') return '$';
        if (token === '&') return match;
        if (token === '`') return source.slice(0, offset);
        if (token === "'") return source.slice(offset + match.length);
        if (token.startsWith('<') && token.endsWith('>')) {
            if (!groups) return whole;
            const name = token.slice(1, -1);
            return groups[name] ?? '';
        }
        if (/^\d{1,2}$/.test(token)) {
            let index = Number(token);
            if (index > 0 && index <= captures.length) return captures[index - 1] ?? '';
            if (token.length === 2) {
                index = Number(token[0]);
                if (index > 0 && index <= captures.length) {
                    return `${captures[index - 1] ?? ''}${token[1]}`;
                }
            }
        }
        return whole;
    });
}

function replaceWithPolicy(text, regex, replacement, excludeScopes) {
    const protectedRanges = collectScopedRanges(text);
    regex.lastIndex = 0;
    return text.replace(regex, (...args) => {
        const parsed = parseReplaceArguments(args);
        const start = parsed.offset;
        const end = start + parsed.match.length;
        if (isExcludedMatch(protectedRanges, start, end, excludeScopes)) return parsed.match;
        return expandReplacement(replacement, parsed);
    });
}

function cleanPolicyAware(engine, text) {
    if (!text) return text;
    let result = text;
    if (engine.removeAsterisks) {
        result = replaceWithPolicy(result, /(\*\*|\*)/g, '', DEFAULT_EXCLUDE_SCOPES);
    }
    for (const rawRule of engine.rules) {
        const rule = normalizeRuleV3(rawRule);
        if (!rule || rule.enabled === false || rule.autoFix === false || !rule.target) continue;
        const regex = engine._buildRegex(rule);
        if (!regex) continue;
        result = replaceWithPolicy(result, regex, rule.replacement, rule.excludeScopes);
    }
    return result;
}

export function applyRulePolicyV3Engine({ RuleEngine }) {
    if (!RuleEngine) throw new Error('Rule Policy V3 Engine requires RuleEngine.');
    if (RuleEngine.prototype.__rulePolicyV3EngineApplied) return;
    RuleEngine.prototype.__rulePolicyV3EngineApplied = true;

    RuleEngine.prototype.tokenize = function tokenizePolicyV3Engine(text) {
        return tokenizePolicyAware(this, text);
    };
    RuleEngine.prototype.getCleanedText = function getCleanedTextPolicyV3Engine(text) {
        return cleanPolicyAware(this, text);
    };
}

export { expandReplacement };
