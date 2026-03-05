import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    getScopePath,
    getServiceWorkerPath,
    isServiceWorkerRegistrationSupported,
    registerAppServiceWorker
} from '../js/PWAManager.js';

describe('PWAManager: pure helper', () => {
    it('scopeはパス末尾のディレクトリで解決する', () => {
        assert.strictEqual(getScopePath('/writer-checker/'), '/writer-checker/');
        assert.strictEqual(getScopePath('/writer-checker/index.html'), '/writer-checker/');
        assert.strictEqual(getScopePath('/writer-checker'), '/writer-checker/');
        assert.strictEqual(getScopePath('/'), '/');
    });

    it('service workerの登録パスを現在ページから解決する', () => {
        const path = getServiceWorkerPath(new URL('https://katakatalab.com/writer-checker/'));
        assert.strictEqual(path, '/writer-checker/sw.js');
    });

    it('httpsもしくはlocalhostなら登録可能と判定する', () => {
        assert.strictEqual(isServiceWorkerRegistrationSupported(
            { protocol: 'https:', hostname: 'katakatalab.com' },
            { serviceWorker: {} }
        ), true);
        assert.strictEqual(isServiceWorkerRegistrationSupported(
            { protocol: 'http:', hostname: 'localhost' },
            { serviceWorker: {} }
        ), true);
        assert.strictEqual(isServiceWorkerRegistrationSupported(
            { protocol: 'http:', hostname: 'example.com' },
            { serviceWorker: {} }
        ), false);
    });
});

describe('PWAManager: registerAppServiceWorker', () => {
    it('非対応環境では登録をスキップする', async () => {
        const result = await registerAppServiceWorker({
            locationLike: { protocol: 'http:', hostname: 'example.com', pathname: '/', href: 'http://example.com/' },
            navigatorLike: {}
        });
        assert.strictEqual(result.status, 'skipped');
    });

    it('対応環境ではservice workerをscope付きで登録する', async () => {
        const calls = [];
        const registration = { scope: '/writer-checker/' };
        const result = await registerAppServiceWorker({
            locationLike: {
                protocol: 'https:',
                hostname: 'katakatalab.com',
                pathname: '/writer-checker/',
                href: 'https://katakatalab.com/writer-checker/'
            },
            navigatorLike: {
                serviceWorker: {
                    register: async (swPath, opts) => {
                        calls.push([swPath, opts]);
                        return registration;
                    }
                }
            }
        });

        assert.strictEqual(result.status, 'registered');
        assert.strictEqual(result.registration, registration);
        assert.deepStrictEqual(calls, [
            ['/writer-checker/sw.js', { scope: '/writer-checker/' }]
        ]);
    });
});
