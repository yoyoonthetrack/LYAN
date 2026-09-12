(function (global) {
    'use strict';

    const registry = {
        safety: 'safety-disputes-engine.js',
        subscriptions: 'subscriptions-engine.js',
        proVerification: 'pro-verification-engine.js'
    };

    const loads = new Map();

    function loadScript(src) {
        if (loads.has(src)) return loads.get(src);

        const existing = Array.from(document.scripts || []).find((script) => {
            const attr = script.getAttribute('src') || '';
            return attr === src || attr.endsWith('/' + src);
        });
        if (existing) {
            const ready = Promise.resolve(existing);
            loads.set(src, ready);
            return ready;
        }

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.dataset.lyannFeature = src;
            script.addEventListener('load', () => resolve(script), { once: true });
            script.addEventListener('error', () => {
                loads.delete(src);
                reject(new Error('Unable to load LYANN feature: ' + src));
            }, { once: true });
            document.head.appendChild(script);
        });

        loads.set(src, promise);
        return promise;
    }

    function ensure(name) {
        const src = registry[name];
        if (!src) return Promise.reject(new Error('Unknown LYANN feature: ' + name));
        return loadScript(src);
    }

    function warmNonCriticalFeatures() {
        const warm = () => {
            Promise.allSettled([
                ensure('safety'),
                ensure('subscriptions'),
                ensure('proVerification')
            ]);
        };

        if ('requestIdleCallback' in global) {
            global.requestIdleCallback(warm, { timeout: 5000 });
        } else {
            global.setTimeout(warm, 2500);
        }
    }

    global.LYANN_FEATURES = Object.freeze({
        ensure,
        loadScript,
        registry: Object.freeze({ ...registry })
    });

    if (document.readyState === 'complete') {
        warmNonCriticalFeatures();
    } else {
        global.addEventListener('load', warmNonCriticalFeatures, { once: true });
    }
})(window);
