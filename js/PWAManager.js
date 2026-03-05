/**
 * Writer Checker — PWAManager
 * PWAの初期化（Service Worker登録 / インストール導線）を担う。
 */

const DEFAULT_SW_FILE = 'sw.js';

function isLocalhost(hostname = '') {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function getScopePath(pathname = '/') {
    if (!pathname || pathname === '/') return '/';
    if (pathname.endsWith('/')) return pathname;
    const lastSlash = pathname.lastIndexOf('/');
    if (lastSlash <= 0) return `${pathname}/`;
    return pathname.slice(0, lastSlash + 1);
}

export function getServiceWorkerPath(locationLike, swFileName = DEFAULT_SW_FILE) {
    if (!locationLike?.href) return `/${swFileName}`;
    return new URL(swFileName, locationLike.href).pathname;
}

export function isServiceWorkerRegistrationSupported(locationLike, navigatorLike) {
    if (!navigatorLike?.serviceWorker) return false;
    if (!locationLike?.protocol || !locationLike?.hostname) return false;
    return locationLike.protocol === 'https:' || isLocalhost(locationLike.hostname);
}

export async function registerAppServiceWorker({
    locationLike = window.location,
    navigatorLike = navigator,
    swFileName = DEFAULT_SW_FILE
} = {}) {
    if (!isServiceWorkerRegistrationSupported(locationLike, navigatorLike)) {
        return { status: 'skipped' };
    }

    const swPath = getServiceWorkerPath(locationLike, swFileName);
    const scope = getScopePath(locationLike.pathname);

    try {
        const registration = await navigatorLike.serviceWorker.register(swPath, { scope });
        return { status: 'registered', registration, swPath, scope };
    } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
        return { status: 'error', error };
    }
}

function isStandalone(windowLike = window) {
    const mediaStandalone = typeof windowLike.matchMedia === 'function'
        ? windowLike.matchMedia('(display-mode: standalone)').matches
        : false;
    const iosStandalone = Boolean(windowLike.navigator?.standalone);
    return mediaStandalone || iosStandalone;
}

function setupInstallPrompt({ windowLike = window, documentLike = document } = {}) {
    const installBtn = documentLike.getElementById('installAppBtn');
    if (!installBtn || typeof windowLike.addEventListener !== 'function') return;

    let deferredPrompt = null;

    const hideButton = () => {
        installBtn.classList.add('hidden');
        installBtn.disabled = false;
    };

    if (isStandalone(windowLike)) {
        hideButton();
        return;
    }

    const onBeforeInstallPrompt = (event) => {
        event.preventDefault();
        deferredPrompt = event;
        installBtn.classList.remove('hidden');
    };

    const onAppInstalled = () => {
        deferredPrompt = null;
        hideButton();
    };

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        installBtn.disabled = true;
        try {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice;
        } catch (error) {
            console.error('[PWA] Install prompt failed:', error);
        } finally {
            deferredPrompt = null;
            hideButton();
        }
    });

    windowLike.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    windowLike.addEventListener('appinstalled', onAppInstalled);
}

export async function initPWA({
    windowLike = window,
    documentLike = document,
    locationLike = window.location,
    navigatorLike = navigator
} = {}) {
    setupInstallPrompt({ windowLike, documentLike });
    return registerAppServiceWorker({ locationLike, navigatorLike });
}
