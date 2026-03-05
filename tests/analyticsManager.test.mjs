import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    AnalyticsManager,
    sanitizeEventName,
    sanitizeEventParams
} from '../js/AnalyticsManager.js';

describe('AnalyticsManager: pure helpers', () => {
    it('イベント名を規約に沿って正規化する', () => {
        assert.strictEqual(sanitizeEventName(' Score Shared '), 'score_shared');
        assert.strictEqual(sanitizeEventName('無効!イベント'), '');
    });

    it('PIIを含むキーを除外しつつパラメータを正規化する', () => {
        const params = sanitizeEventParams({
            score: 88,
            grade: 'A',
            email: 'private@example.com',
            username: 'katakata',
            status: 'good'
        });

        assert.deepStrictEqual(params, {
            score: 88,
            grade: 'A',
            status: 'good'
        });
    });
});

describe('AnalyticsManager: track', () => {
    it('dataLayerへイベントをpushできる', () => {
        const windowLike = { dataLayer: [] };
        const manager = new AnalyticsManager({
            windowLike,
            navigatorLike: {},
            locationLike: { pathname: '/writer-checker/' }
        });

        const ok = manager.track('score_shared', { score: 91, grade: 'A' });

        assert.strictEqual(ok, true);
        assert.strictEqual(windowLike.dataLayer.length, 1);
        assert.strictEqual(windowLike.dataLayer[0].event, 'score_shared');
    });

    it('Measurement Readiness Indexを返せる', () => {
        const manager = new AnalyticsManager({
            windowLike: { dataLayer: [] },
            navigatorLike: {},
            locationLike: { pathname: '/writer-checker/' }
        });
        const readiness = manager.getMeasurementReadiness();

        assert.ok(typeof readiness.score === 'number');
        assert.ok(['Measurement-Ready', 'Usable with Gaps', 'Unreliable', 'Broken'].includes(readiness.verdict));
    });
});

