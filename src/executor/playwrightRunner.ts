import { BrowserAction, BrowserSpec, TestCase, TestResult } from '../shared/types';
import { ExecutionContext, ExecutionEngine } from './engine';

/**
 * Browser execution engine for web frontends and Electron apps.
 * Lazy-loads playwright-core so the extension does not require browsers to
 * be installed unless browser tests are actually run. Screenshots are
 * captured on failure as evidence.
 */
export class PlaywrightRunner implements ExecutionEngine {
  readonly kind = 'browser' as const;

  async execute(test: TestCase, context: ExecutionContext): Promise<TestResult> {
    const spec = test.spec as BrowserSpec;
    const started = Date.now();
    const screenshots: string[] = [];

    try {
      const { chromium } = await this.loadPlaywright();
      const browser = await chromium.launch({ headless: context.headless });
      try {
        const page = await browser.newPage();
        await page.setViewportSize({ width: 1280, height: 800 });

        for (const action of spec.actions) {
          await this.runAction(page, action, context, screenshots);
        }

        const durationMs = Date.now() - started;
        return {
          testId: test.id,
          status: 'passed',
          durationMs,
          message: `All ${spec.actions.length} actions completed`,
          evidence: screenshots.length > 0 ? { screenshots } : undefined,
        };
      } finally {
        await browser.close();
      }
    } catch (err) {
      const durationMs = Date.now() - started;
      return {
        testId: test.id,
        status: 'failed',
        durationMs,
        message: err instanceof Error ? err.message : String(err),
        evidence: {
          error: err instanceof Error ? err.stack : String(err),
          screenshots: screenshots.length > 0 ? screenshots : undefined,
        },
      };
    }
  }

  private async runAction(
    page: import('playwright-core').Page,
    action: BrowserAction,
    context: ExecutionContext,
    screenshots: string[],
  ): Promise<void> {
    const timeout = action.timeoutMs ?? 10_000;
    const baseUrl = context.appUrl;

    switch (action.type) {
      case 'goto': {
        const raw = action.url && action.url.length > 0 ? action.url : baseUrl;
        const url = /^https?:\/\//i.test(raw)
          ? raw
          : new URL(raw, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
        break;
      }
      case 'click':
        await page.click(action.selector!, { timeout });
        break;
      case 'fill':
        await page.fill(action.selector!, action.value ?? '', { timeout });
        break;
      case 'press':
        await page.press(action.selector!, action.value ?? 'Enter', { timeout });
        break;
      case 'waitFor':
        await page.waitForSelector(action.selector!, { timeout });
        break;
      case 'expectText':
        await page.waitForSelector(`text=${escapeText(action.text ?? '')}`, { timeout });
        break;
      case 'expectUrl':
        await page.waitForURL((u) => u.href.includes(action.url ?? ''), { timeout });
        break;
      case 'screenshot':
        screenshots.push(await page.screenshot({ type: 'png', fullPage: false }).then((b) => `data:image/png;base64,${b.toString('base64')}`));
        break;
      default:
        throw new Error(`Unknown browser action: ${(action as { type: string }).type}`);
    }
  }

  private async loadPlaywright(): Promise<typeof import('playwright-core')> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return await import('playwright-core');
    } catch {
      throw new Error(
        'playwright-core is not installed. Run "npm install playwright-core" and "npx playwright-core install chromium" in this extension folder, or install the Playwright VS Code extension.',
      );
    }
  }
}

function escapeText(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
