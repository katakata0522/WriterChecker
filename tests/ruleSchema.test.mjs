import test from 'node:test';
import assert from 'node:assert/strict';
import {
    collectScopedRanges,
    isMatchExcluded,
    normalizeRuleV3,
    SAFE_REGEX_TEMPLATES
} from '../js/RuleSchema.js';

test('V2ルールをV3へ正規化しメモを理由へ移行する', () => {
    const rule = normalizeRuleV3({ target: '全て', replacement: 'すべて', memo: '表記を統一' });
    assert.equal(rule.schemaVersion, 3);
    assert.equal(rule.reason, '表記を統一');
    assert.equal(rule.autoFix, true);
    assert.deepEqual(rule.excludeScopes, ['url', 'email', 'code']);
    assert.equal(Object.hasOwn(rule, 'memo'), false);
});

test('除外範囲が重なってもスコープを保持する', () => {
    const text = '`mail@example.com` https://example.com/mail@example.com';
    const ranges = collectScopedRanges(text);
    assert.ok(ranges.some((range) => range.scopes.includes('code') && range.scopes.includes('email')));
    assert.ok(ranges.some((range) => range.scopes.includes('url') && range.scopes.includes('email')));
});

test('ルール別の除外設定を判定する', () => {
    const text = '本文 https://example.com/出来る';
    const ranges = collectScopedRanges(text);
    const start = text.indexOf('出来る');
    assert.equal(isMatchExcluded(ranges, start, start + 3, ['url']), true);
    assert.equal(isMatchExcluded(ranges, start, start + 3, []), false);
});

test('安全テンプレートは空置換の全角英数字削除を含まない', () => {
    assert.ok(SAFE_REGEX_TEMPLATES.length > 0);
    assert.ok(!SAFE_REGEX_TEMPLATES.some((template) => /０-９|ａ-ｚ|Ａ-Ｚ/.test(template.rule.target)));
    assert.ok(SAFE_REGEX_TEMPLATES.every((template) => template.rule.autoFix !== false));
});
