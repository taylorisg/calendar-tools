#!/usr/bin/env node
/**
 * Pull all open (non-completed) tasks from Motion and output them in an
 * LLM-friendly format so you can reason about priorities in a chat or prompt.
 *
 * Only pulls tasks from the Nirvana workspace (resolved by name via Motion API).
 * Recurring tasks (and instances of recurring tasks) are always excluded.
 * Tasks with status "Canceled" are excluded.
 *
 * Usage:
 *   node pull-open-tasks.js              # save to open-tasks.md (default)
 *   node pull-open-tasks.js --out fn     # save to custom file
 *   node pull-open-tasks.js --stdout     # print to terminal instead
 *   npm run pull-open-tasks
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG = {
  API_BASE_URL: 'https://api.usemotion.com/v1',
  RATE_LIMIT: 12,
  RATE_LIMIT_WINDOW: 60 * 1000,
};

class RateLimiter {
  constructor(requestsPerMinute) {
    this.requestsPerMinute = requestsPerMinute;
    this.requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    const oneMinuteAgo = now - CONFIG.RATE_LIMIT_WINDOW;
    this.requests = this.requests.filter((t) => t > oneMinuteAgo);
    if (this.requests.length >= this.requestsPerMinute) {
      const waitTime =
        CONFIG.RATE_LIMIT_WINDOW - (now - Math.min(...this.requests)) + 1000;
      console.error(
        `⏳ Rate limit: waiting ${Math.ceil(waitTime / 1000)}s...`
      );
      await new Promise((r) => setTimeout(r, waitTime));
      return this.waitForSlot();
    }
    this.requests.push(now);
  }
}

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, '.env'), 'utf8');
    const env = {};
    raw.split('\n').forEach((line) => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) env[key.trim()] = rest.join('=').trim();
    });
    return env;
  } catch (e) {
    console.error('❌ Error loading .env:', e.message);
    console.error('💡 Copy env.example to .env and set MOTION_API_KEY, MOTION_WORKSPACE_ID');
    process.exit(1);
  }
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: 'medium',
    });
  } catch {
    return iso;
  }
}

function formatDuration(duration) {
  if (duration == null) return '—';
  if (typeof duration === 'string') {
    if (duration === 'NONE' || duration === 'REMINDER') return duration;
    const m = parseInt(duration, 10);
    if (!Number.isNaN(m)) return `${m}m`;
    return duration;
  }
  if (typeof duration === 'number') {
    if (duration >= 60) return `${Math.floor(duration / 60)}h ${duration % 60}m`;
    return `${duration}m`;
  }
  return '—';
}

class MotionAPI {
  constructor(apiKey, workspaceId) {
    this.apiKey = apiKey;
    this.workspaceId = workspaceId;
    this.limiter = new RateLimiter(CONFIG.RATE_LIMIT);
  }

  async request(endpoint, method = 'GET', body = null) {
    await this.limiter.waitForSlot();
    const url = `${CONFIG.API_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async getWorkspaces() {
    const workspaces = [];
    let cursor = null;
    do {
      const url = cursor
        ? `/workspaces?cursor=${encodeURIComponent(cursor)}`
        : '/workspaces';
      const data = await this.request(url);
      const list = data.workspaces ?? data.data ?? [];
      workspaces.push(...list);
      cursor = data.meta?.nextCursor ?? null;
    } while (cursor);
    return workspaces;
  }

  async getStatuses() {
    const data = await this.request(
      `/statuses?workspaceId=${encodeURIComponent(this.workspaceId)}`
    );
    return Array.isArray(data) ? data : data?.statuses ?? data?.data ?? [];
  }

  async getAllOpenTasks() {
    const tasks = [];
    let cursor = null;
    const base = `/tasks?workspaceId=${encodeURIComponent(this.workspaceId)}&includeAllStatuses=true`;
    do {
      const url = cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
      const data = await this.request(url);
      const list = data.tasks ?? data.data ?? [];
      tasks.push(...list);
      cursor = data.meta?.nextCursor ?? null;
    } while (cursor);
    const statusName = (t) =>
      (t.status?.name ?? (typeof t.status === 'string' ? t.status : '')).trim().toLowerCase();
    return tasks.filter(
      (t) =>
        t.completed !== true &&
        !t.parentRecurringTaskId &&
        !t.isRecurring &&
        statusName(t) !== 'canceled'
    );
  }
}

function taskToMarkdown(task, index, statusNames) {
  const statusName =
    task.status?.name ?? (task.status && typeof task.status === 'string' ? task.status : '—');
  const projectName = task.project?.name ?? task.project?.title ?? '—';
  const desc = stripHtml(task.description ?? '');
  const parts = [
    `## ${index}. ${task.name}`,
    `- **Status:** ${statusName}`,
    `- **Due:** ${formatDate(task.dueDate)}`,
    `- **Priority:** ${task.priority ?? '—'}`,
    `- **Duration:** ${formatDuration(task.duration)}`,
    `- **Project:** ${projectName}`,
  ];
  if (desc) parts.push(`\n${desc}`);
  parts.push('');
  return parts.join('\n');
}

function buildOutput(tasks, statusNames, workspaceName = 'Nirvana') {
  const header = [
    `# Open tasks — ${workspaceName} (for prioritization)`,
    '',
    `Total: **${tasks.length}** open tasks. Use this list in an LLM to reason about order, dependencies, and what to do next.`,
    '',
    '---',
    '',
  ].join('\n');
  const body = tasks.map((t, i) => taskToMarkdown(t, i + 1, statusNames)).join('\n');
  return header + body;
}

const DEFAULT_OUT_FILE = 'open-tasks.md';

async function main() {
  const args = process.argv.slice(2);
  const toStdout = args.includes('--stdout');
  const outIdx = args.indexOf('--out');
  const outFile = toStdout
    ? null
    : (outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : join(__dirname, DEFAULT_OUT_FILE));

  const env = loadEnv();
  if (!env.MOTION_API_KEY) {
    console.error('❌ Set MOTION_API_KEY in .env');
    process.exit(1);
  }

  const TARGET_WORKSPACE_NAME = 'Nirvana';
  const api = new MotionAPI(env.MOTION_API_KEY, null);

  console.error('🔄 Resolving Nirvana workspace...');
  const workspaces = await api.getWorkspaces();
  const nirvana = workspaces.find(
    (w) => (w.name || '').trim().toLowerCase() === TARGET_WORKSPACE_NAME.toLowerCase()
  );
  if (!nirvana) {
    console.error(`❌ Workspace "${TARGET_WORKSPACE_NAME}" not found.`);
    console.error('   Available:', workspaces.map((w) => w.name).join(', ') || '(none)');
    process.exit(1);
  }
  api.workspaceId = nirvana.id;
  console.error(`   Using workspace: ${nirvana.name} (${nirvana.id})\n`);

  console.error('🔄 Fetching statuses...');
  const statuses = await api.getStatuses();
  console.error('🔄 Fetching tasks (including pagination)...');
  const openTasks = await api.getAllOpenTasks();
  console.error(`✅ Found ${openTasks.length} open task(s)\n`);

  const markdown = buildOutput(openTasks, statuses, nirvana.name);
  if (outFile) {
    writeFileSync(outFile, markdown, 'utf8');
    console.error(`📄 Written to ${outFile}`);
  } else {
    console.log(markdown);
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
