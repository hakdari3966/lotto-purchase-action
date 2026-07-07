import * as core from '@actions/core';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { BrowserSession } from './core/browser';
import { getDepositBalance } from './core/balance';
import { purchaseAuto, purchaseManual } from './core/purchase';
import { generateExcluding } from './utils/numbers';
import { initLabels, createConsolidatedIssue, checkWinningIssues } from './github/issues';
import { notifyPurchase, notifyWinning, notifyWinningCheckSummary } from './telegram/notify';
import { notifyApnsPurchase, notifyApnsWinning, notifyApnsWinningCheckSummary } from './push/apns';

interface PurchaseMetadata {
  type: 'auto' | 'manual';
  numbers: number[][];
  timestamp: string;
}

interface WorkflowApi {
  purchaseAuto: (amount: number) => Promise<number[][]>;
  purchaseManual: (numbers: number[][]) => Promise<number[][]>;
  generateExcluding: (exclude: number[][], count: number) => number[][];
}

type CustomWorkflow = (api: WorkflowApi) => Promise<unknown> | unknown;

function parseBooleanInput(value: string): boolean {
  return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
}

function resolveWorkflowPath(workflowFile: string): string {
  const repoRoot = process.cwd();
  const resolvedPath = path.resolve(repoRoot, workflowFile);
  const relativePath = path.relative(repoRoot, resolvedPath);
  const allowedExtensions = new Set(['.js', '.mjs', '.cjs']);

  if (path.isAbsolute(workflowFile) || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`[Main] workflow-file must point to a file inside this repository: "${workflowFile}"`);
  }

  if (!allowedExtensions.has(path.extname(resolvedPath))) {
    throw new Error(`[Main] workflow-file must be a JavaScript module (.js, .mjs, or .cjs): "${workflowFile}"`);
  }

  return resolvedPath;
}

async function loadWorkflow(workflowFile: string): Promise<CustomWorkflow> {
  const resolvedPath = resolveWorkflowPath(workflowFile);

  try {
    const workflowModule = await import(pathToFileURL(resolvedPath).href);
    const workflow = workflowModule.default;

    if (typeof workflow !== 'function') {
      throw new Error(
        `[Main] Invalid custom workflow export in "${workflowFile}". ` +
          `Expected default export function.\n` +
          `- ESM (.js/.mjs): export default async (api) => {}\n` +
          `- CJS (.cjs): module.exports = async (api) => {}`
      );
    }

    return workflow as CustomWorkflow;
  } catch (error) {
    if (error instanceof Error && error.message.includes('module is not defined in ES module scope')) {
      throw new Error(
        `[Main] Invalid custom workflow module format in "${workflowFile}".\n` +
          `Detected CommonJS syntax (module.exports) in a .js file under an ESM package.\n` +
          `Choose one of the following:\n` +
          `1) Keep .js and switch to ESM: export default async (api) => {}\n` +
          `2) Keep CommonJS and rename file to .cjs: module.exports = async (api) => {}`
      );
    }

    throw error;
  }
}

async function run() {
  const session = new BrowserSession();
  const purchases: PurchaseMetadata[] = []; // Track all successful purchases
  let dryRun = false;
  let checkOnly = false;

  try {
    // Get inputs
    checkOnly = parseBooleanInput(core.getInput('check-only') || process.env.CHECK_ONLY || 'false');
    const id = core.getInput('dhlottery-id', { required: !checkOnly });
    const pwd = core.getInput('dhlottery-password', { required: !checkOnly });
    const amount = Number(core.getInput('game-count') || '5');
    const workflowFile = core.getInput('workflow-file');
    dryRun = parseBooleanInput(core.getInput('dry-run') || process.env.DRY_RUN || 'false');
    const purchaseConfirmation = core.getInput('purchase-confirmation') || '';

    console.log('[Main] Starting lotto purchase action');
    if (checkOnly) {
      console.log('[Main] Check-only mode enabled. The action will only check previous purchases for winning.');
    } else if (dryRun) {
      console.log('[Main] Dry-run mode enabled. The action will stop before clicking the purchase button.');
    } else if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && purchaseConfirmation !== 'BUY') {
      throw new Error(
        '[Main] Manual real purchase blocked. Set purchase-confirmation to BUY to run with dry-run=false.'
      );
    }

    if (checkOnly) {
      console.log('[Main] Initializing GitHub labels');
      await initLabels();

      console.log('[Main] Checking winning for previous purchases');
      const checkedResults = await checkWinningIssues();

      await notifyWinningCheckSummary(checkedResults);
      await notifyApnsWinningCheckSummary(checkedResults);

      console.log('[Main] Check-only mode completed. No purchase was attempted.');
      return;
    }

    // Initialize browser and login
    console.log('[Main] Initializing browser session');
    await session.init({
      headless: true,
      args: ['--no-sandbox']
    });

    console.log('[Main] Logging in');
    await session.login(id, pwd);

    if (!dryRun) {
      // Initialize GitHub labels
      console.log('[Main] Initializing GitHub labels');
      await initLabels();

      // Check previous purchases for winning
      console.log('[Main] Checking winning for previous purchases');
      const checkedResults = await checkWinningIssues();

      // Send Telegram notifications for winning results
      for (const result of checkedResults.filter(result => result.ranks.some(rank => rank > 0))) {
        await notifyWinning(result.issueNumber, result.round, result.ranks);
        await notifyApnsWinning(result.issueNumber, result.round, result.ranks);
      }
    } else {
      console.log('[Main] Skipping GitHub issue checks and Telegram winning notifications in dry-run mode');
    }

    // Create API with session bound to functions (no need to pass session manually)
    const api = {
      purchaseAuto: async (amt: number) => {
        console.log(`[Main] Executing auto purchase${dryRun ? ' dry-run' : ''}: ${amt} games`);
        const result = await purchaseAuto(session, amt, { dryRun });
        if (!dryRun) {
          purchases.push({
            type: 'auto',
            numbers: result,
            timestamp: new Date().toISOString()
          }); // Auto-track successful purchase
        }
        console.log(`[Main] Auto purchase ${dryRun ? 'dry-run completed' : 'successful'}: ${result.length} games`);
        return result;
      },
      purchaseManual: async (numbers: number[][]) => {
        console.log(`[Main] Executing manual purchase${dryRun ? ' dry-run' : ''}: ${numbers.length} games`);
        const result = await purchaseManual(session, numbers, { dryRun });
        if (!dryRun) {
          purchases.push({
            type: 'manual',
            numbers: result,
            timestamp: new Date().toISOString()
          }); // Auto-track successful purchase
        }
        console.log(`[Main] Manual purchase ${dryRun ? 'dry-run completed' : 'successful'}: ${result.length} games`);
        return result;
      },
      generateExcluding: (exclude: number[][], count: number) => {
        console.log(`[Main] Generating ${count} games excluding ${exclude.length} sets`);
        return generateExcluding(exclude, count);
      }
    };

    // Execute user workflow
    if (workflowFile) {
      console.log(`[Main] Loading custom workflow from: ${workflowFile}`);
      const workflow = await loadWorkflow(workflowFile);
      await workflow(api);
      console.log('[Main] Custom workflow completed');
    } else {
      // Default: simple auto purchase
      console.log(`[Main] Running default auto purchase: ${amount} games`);
      await api.purchaseAuto(amount);
    }

    console.log(
      `[Main] All ${dryRun ? 'dry-run selections' : 'purchases'} completed: ${purchases.length} tracked purchases`
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('[Main] Workflow error:', error.message);
      core.setFailed(error.message);
    } else {
      console.error('[Main] Workflow error:', error);
      core.setFailed(String(error));
    }
    // Continue to create issues for successful purchases
  } finally {
    // Create one consolidated issue for all successful purchases
    if (purchases.length > 0) {
      try {
        const depositBalance = await getDepositBalance(session).catch(error => {
          console.warn('[Main] Failed to fetch deposit balance:', error instanceof Error ? error.message : error);
          return null;
        });

        await createConsolidatedIssue(purchases, depositBalance);
        const totalGames = purchases.reduce((sum, p) => sum + p.numbers.length, 0);
        console.log(`[Main] Created consolidated issue for ${purchases.length} purchases (${totalGames} total games)`);

        // Send Telegram notification for purchases
        await notifyPurchase(purchases, depositBalance);
        await notifyApnsPurchase(purchases, depositBalance);
      } catch (error) {
        console.error(`[Main] Failed to create consolidated issue:`, error);
      }
    } else if (checkOnly) {
      console.log(`[Main] Check-only completed. No issue was created for a new purchase`);
    } else if (dryRun) {
      console.log(`[Main] Dry-run completed. No issue or Telegram purchase notification was created`);
    } else {
      console.log(`[Main] No successful purchases to create issue`);
    }

    // Close browser session
    console.log('[Main] Closing browser session');
    await session.close();

    console.log('[Main] Action completed');
  }
}

run();
