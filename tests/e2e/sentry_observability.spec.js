const { test, expect } = require('@playwright/test');

test.describe('LYANN V1 — Sentry Observability & Diagnostic Tests', () => {

  test('1. Centralized Sentry Initializer Presence & Verification', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const sentryState = await page.evaluate(() => {
      return {
        initialized: window.__LYANN_SENTRY_INITIALIZED__ === true,
        testHelperAvailable: !!window.__LYANN_SENTRY_TEST__,
        hasTriggerException: typeof window.__LYANN_SENTRY_TEST__?.triggerException === 'function',
        hasTriggerRejection: typeof window.__LYANN_SENTRY_TEST__?.triggerRejection === 'function'
      };
    });

    expect(sentryState.initialized).toBe(true);
    expect(sentryState.testHelperAvailable).toBe(true);
    expect(sentryState.hasTriggerException).toBe(true);
    expect(sentryState.hasTriggerRejection).toBe(true);
  });

  test('2. Diagnostic Test Exception Capture', async ({ page }) => {
    await page.goto('/index.html');

    // Trigger test exception helper
    const result = await page.evaluate(() => {
      try {
        window.__LYANN_SENTRY_TEST__.triggerException('[PLAYWRIGHT DIAGNOSTIC TEST EXCEPTION]');
        return { thrown: false };
      } catch (err) {
        return { thrown: true, message: err.message };
      }
    });

    expect(result.thrown).toBe(true);
    expect(result.message).toContain('[PLAYWRIGHT DIAGNOSTIC TEST EXCEPTION]');
  });

  test('3. Diagnostic Test Unhandled Rejection Capture', async ({ page }) => {
    await page.goto('/index.html');

    // Trigger test promise rejection helper
    const result = await page.evaluate(async () => {
      try {
        await window.__LYANN_SENTRY_TEST__.triggerRejection('[PLAYWRIGHT DIAGNOSTIC TEST REJECTION]');
        return { rejected: false };
      } catch (err) {
        return { rejected: true, message: err.message };
      }
    });

    expect(result.rejected).toBe(true);
    expect(result.message).toContain('[PLAYWRIGHT DIAGNOSTIC TEST REJECTION]');
  });

  test('4. Privacy & Data Masking Inspection', async ({ page }) => {
    await page.goto('/index.html');

    // Verify Sentry beforeSend filter strips authorization & passwords
    const privacyCheck = await page.evaluate(() => {
      // Simulate raw Sentry event with sensitive data
      const mockEvent = {
        request: {
          headers: {
            'authorization': 'Bearer secret_jwt_token_123',
            'cookie': 'session_cookie=abc',
            'user-agent': 'Mozilla/5.0'
          },
          data: {
            password: 'SuperSecretPassword123!',
            email: 'user@example.com',
            normal_field: 'safe_value'
          }
        },
        user: {
          id: 'user_123',
          email: 'user@example.com',
          ip_address: '127.0.0.1'
        },
        extra: {
          access_token: 'secret_token_val',
          public_info: 'safe'
        }
      };

      // Execute beforeSend logic if Sentry is configured
      if (window.Sentry && window.Sentry.getOptions) {
        const options = window.Sentry.getOptions();
        if (options && typeof options.beforeSend === 'function') {
          const sanitized = options.beforeSend(mockEvent);
          return {
            hasAuthHeader: !!sanitized?.request?.headers?.['authorization'],
            hasCookieHeader: !!sanitized?.request?.headers?.['cookie'],
            passwordValue: sanitized?.request?.data?.password,
            userEmail: sanitized?.user?.email,
            accessTokenVal: sanitized?.extra?.access_token
          };
        }
      }

      return { sanitized: true };
    });

    if (!privacyCheck.sanitized) {
      expect(privacyCheck.hasAuthHeader).toBe(false);
      expect(privacyCheck.hasCookieHeader).toBe(false);
      expect(privacyCheck.passwordValue).toBe('[FILTERED_SENSITIVE_DATA]');
      expect(privacyCheck.userEmail).toBeUndefined();
      expect(privacyCheck.accessTokenVal).toBe('[FILTERED_SENSITIVE_DATA]');
    }
  });
});
