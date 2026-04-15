import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'https';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import {
  makeOAuth2Client,
  setRefreshToken,
  getOrCreateBlockedCalendar,
  listOtherCalendarIds,
  queryBusyIntervals,
  listEvents,
  listEventIntervals,
  listCalendars,
  createEvent,
  deleteEvent,
  type GCalEvent,
} from './googleCalendar.js';
import { enrichWithAI } from './suggestions.js';
import {
  type Config,
  DEFAULT_CONFIG,
  scheduleBlocks,
  durationMinutes,
  formatTime,
  formatDayLabel,
  groupByWeek,
  buildTargetDays,
  setTimeOnDay,
  isWeekend,
} from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3000;
const ENV_PATH = join(__dirname, '..', '.env');
const CONFIG_PATH = join(__dirname, '..', 'block-time-config.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// ── Env helpers ───────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const raw = readFileSync(ENV_PATH, 'utf8');
  const env: Record<string, string> = {};
  raw.split('\n').forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) env[key.trim()] = rest.join('=').trim();
  });
  return env;
}

function saveEnvKey(key: string, value: string): void {
  let raw = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
  if (regex.test(raw)) {
    raw = raw.replace(regex, `${key}=${value}`);
  } else {
    raw = raw.trimEnd() + `\n${key}=${value}\n`;
  }
  writeFileSync(ENV_PATH, raw, 'utf8');
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<Config>;
  return {
    days: parsed.days ?? DEFAULT_CONFIG.days,
    weekdaysOnly: parsed.weekdaysOnly ?? DEFAULT_CONFIG.weekdaysOnly,
    workDayStart: parsed.workDayStart ?? DEFAULT_CONFIG.workDayStart,
    workDayEnd: parsed.workDayEnd ?? DEFAULT_CONFIG.workDayEnd,
    lunch: { ...DEFAULT_CONFIG.lunch, ...parsed.lunch },
    focusTime: { ...DEFAULT_CONFIG.focusTime, ...parsed.focusTime },
    meetingBreak: { ...DEFAULT_CONFIG.meetingBreak, ...parsed.meetingBreak },
    aiInstructions: parsed.aiInstructions,
    customCategories: parsed.customCategories ?? [],
    personalMirror: parsed.personalMirror,
    refreshSchedule: parsed.refreshSchedule,
    excludeCalendars: parsed.excludeCalendars,
  };
}

function getOAuthClient(redirectUri: string): OAuth2Client {
  const env = loadEnv();
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
}

function redirectUri(): string {
  return `http://localhost:${PORT}/auth/callback`;
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Auth routes ───────────────────────────────────────────────────────────────

app.get('/auth/start', (_req, res) => {
  const env = loadEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    res.status(400).json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env first' });
    return;
  }
  const client = getOAuthClient(redirectUri());
  const url = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send('Missing code'); return; }
  try {
    const client = getOAuthClient(redirectUri());
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      res.status(400).send('No refresh token — revoke app access at myaccount.google.com/permissions and try again.');
      return;
    }
    saveEnvKey('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
    res.redirect('/?auth=success');
  } catch (e: any) {
    res.status(500).send(`Auth failed: ${e.message}`);
  }
});

// ── API routes ────────────────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  const env = loadEnv();
  res.json({
    hasClientId: !!env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!env.GOOGLE_CLIENT_SECRET,
    authenticated: !!env.GOOGLE_REFRESH_TOKEN,
    config: loadConfig(),
  });
});

app.post('/api/config', (req, res) => {
  const incoming = req.body as Partial<Config>;
  const merged: Config = {
    days: incoming.days ?? DEFAULT_CONFIG.days,
    weekdaysOnly: incoming.weekdaysOnly ?? DEFAULT_CONFIG.weekdaysOnly,
    workDayStart: incoming.workDayStart ?? DEFAULT_CONFIG.workDayStart,
    workDayEnd: incoming.workDayEnd ?? DEFAULT_CONFIG.workDayEnd,
    lunch: { ...DEFAULT_CONFIG.lunch, ...incoming.lunch },
    focusTime: { ...DEFAULT_CONFIG.focusTime, ...incoming.focusTime },
    meetingBreak: { ...DEFAULT_CONFIG.meetingBreak, ...incoming.meetingBreak },
    aiInstructions: incoming.aiInstructions,
    customCategories: incoming.customCategories ?? [],
    personalMirror: incoming.personalMirror,
    refreshSchedule: incoming.refreshSchedule,
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  res.json({ ok: true, config: merged });
});

app.get('/api/calendars', async (_req, res) => {
  const env = loadEnv();
  if (!env.GOOGLE_REFRESH_TOKEN) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  try {
    const oauthClient = makeOAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    setRefreshToken(oauthClient, env.GOOGLE_REFRESH_TOKEN);
    const cals = await listCalendars(oauthClient);
    res.json({ calendars: cals });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/run', async (req, res) => {
  const dryRun: boolean = req.body.dryRun ?? false;
  const refresh: boolean = req.body.refresh ?? false;
  const env = loadEnv();

  if (!env.GOOGLE_REFRESH_TOKEN) {
    res.status(401).json({ error: 'Not authenticated. Connect Google Calendar first.' });
    return;
  }

  try {
    const oauthClient = makeOAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    setRefreshToken(oauthClient, env.GOOGLE_REFRESH_TOKEN);

    const config = loadConfig();
    const blockedCalId = await getOrCreateBlockedCalendar(oauthClient);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const windowEnd = new Date(now.getTime() + config.days * 24 * 60 * 60_000);

    if (refresh && !dryRun) {
      const existing = await listEvents(oauthClient, blockedCalId, now, windowEnd);
      for (const e of existing) await deleteEvent(oauthClient, blockedCalId, e.id);
    }

    let existingGCalKeys = new Set<string>();
    let existingEvents: GCalEvent[] = [];
    if (!refresh) {
      existingEvents = await listEvents(oauthClient, blockedCalId, now, windowEnd);
      for (const e of existingEvents) existingGCalKeys.add(`${e.summary}::${new Date(e.start).toISOString()}`);
    }

    // Mirror blocks go on the primary calendar — track existing ones separately
    const mirrorLookAhead = config.personalMirror?.lookAheadDays ?? 30;
    const mirrorWindowEnd = new Date(now.getTime() + mirrorLookAhead * 24 * 60 * 60_000);
    const existingMirrorKeys = new Set<string>();
    const existingMirrorEvents = await listEvents(oauthClient, 'primary', now, mirrorWindowEnd);
    for (const e of existingMirrorEvents) {
      if (e.summary === 'Busy') existingMirrorKeys.add(`Busy::${new Date(e.start).toISOString()}`);
    }

    const otherCalIds = await listOtherCalendarIds(oauthClient, blockedCalId, config.excludeCalendars ?? []);
    const busyIntervals = await queryBusyIntervals(oauthClient, otherCalIds, now, windowEnd);

    // Include existing blocks so the scheduler doesn't double-book over them
    if (!refresh) {
      for (const e of existingEvents) {
        const interval = { start: new Date(e.start), end: new Date(e.end) };
        busyIntervals.confirmed.push(interval);
        busyIntervals.all.push(interval);

        // If a lunch block already exists for this day, mark the entire lunch window
        // as busy so the scheduler doesn't find an earlier slot and add a second lunch
        if (e.summary === '🍝 Lunch') {
          const day = new Date(e.start);
          day.setHours(0, 0, 0, 0);
          const windowBusy = {
            start: setTimeOnDay(day, config.lunch.windowStart),
            end: setTimeOnDay(day, config.lunch.windowEnd),
          };
          busyIntervals.confirmed.push(windowBusy);
          busyIntervals.all.push(windowBusy);
        }
      }
    }

    const env2 = loadEnv();
    let report = scheduleBlocks(config, busyIntervals.confirmed, busyIntervals.all);
    if (env2.OPENAI_API_KEY) report = await enrichWithAI(report, env2.OPENAI_API_KEY, busyIntervals.confirmed, config.aiInstructions);
    const { blocks: allBlocks, missedLunch, focusShortfall } = report;

    type BlockResult = {
      label: string;
      start: string;
      end: string;
      day: string;
      timeRange: string;
      duration: number;
      created?: boolean;
      skipped?: boolean;
      deleted?: boolean;
    };

    const results: BlockResult[] = [];

    for (const block of allBlocks) {
      const gcalKey = `${block.label}::${block.start.toISOString()}`;
      const entry: BlockResult = {
        label: block.label,
        start: block.start.toISOString(),
        end: block.end.toISOString(),
        day: formatDayLabel(block.start),
        timeRange: `${formatTime(block.start)} – ${formatTime(block.end)}`,
        duration: durationMinutes(block.start, block.end),
      };

      if (dryRun) {
        results.push(entry);
      } else if (existingGCalKeys.has(gcalKey)) {
        results.push({ ...entry, skipped: true });
      } else {
        await createEvent(oauthClient, blockedCalId, block.label, block.start, block.end);
        results.push({ ...entry, created: true });
      }
    }

    // Trim excess focus blocks when the weekly target was reduced
    if (!refresh && !dryRun && config.focusTime.enabled) {
      const FOCUS_LABEL = '🤓 Focus Time';
      for (const weekDays of groupByWeek(buildTargetDays(config))) {
        const weekStart = weekDays[0];
        const weekEnd = new Date(weekDays[weekDays.length - 1].getTime() + 24 * 60 * 60_000);
        const prorated = config.focusTime.weeklyTargetHours * (weekDays.length / 5);
        const targetMinutes = Math.round(prorated * 60);

        const weekFocusResults = results
          .filter(r => r.label === FOCUS_LABEL && (r.skipped || r.created))
          .filter(r => { const s = new Date(r.start); return s >= weekStart && s < weekEnd; })
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        let totalMinutes = weekFocusResults.reduce((sum, r) => sum + r.duration, 0);

        for (let i = weekFocusResults.length - 1; i >= 0 && totalMinutes > targetMinutes; i--) {
          const r = weekFocusResults[i];
          const key = `${r.label}::${new Date(r.start).toISOString()}`;
          const event = existingEvents.find(e => `${e.summary}::${new Date(e.start).toISOString()}` === key);
          if (event) {
            await deleteEvent(oauthClient, blockedCalId, event.id);
            totalMinutes -= r.duration;
            r.skipped = false;
            r.deleted = true;
          }
        }
      }
    }

    // ── Personal calendar mirroring ─────────────────────────────────────────────
    const mirrorConfig = config.personalMirror;
    const mirrorEnabled = mirrorConfig?.enabled && (mirrorConfig.calendarNames?.length ?? 0) > 0;

    if (mirrorEnabled) {
      const allCals = await listCalendars(oauthClient);
      const mirrorCalIds = allCals
        .filter((c) => mirrorConfig!.calendarNames.includes(c.name))
        .map((c) => c.id);

      for (const calId of mirrorCalIds) {
        const events = await listEventIntervals(oauthClient, calId, now, mirrorWindowEnd);
        for (const { start, end } of events) {
          if (config.weekdaysOnly && isWeekend(start)) continue;
          const workStart = setTimeOnDay(start, config.workDayStart);
          const workEnd = setTimeOnDay(start, config.workDayEnd);
          if (start >= workEnd || end <= workStart) continue;

          const gcalKey = `Busy::${start.toISOString()}`;
          const entry: BlockResult = {
            label: 'Busy',
            start: start.toISOString(),
            end: end.toISOString(),
            day: formatDayLabel(start),
            timeRange: `${formatTime(start)} – ${formatTime(end)}`,
            duration: durationMinutes(start, end),
          };

          if (dryRun) {
            results.push(entry);
          } else if (existingMirrorKeys.has(gcalKey)) {
            results.push({ ...entry, skipped: true });
          } else {
            await createEvent(oauthClient, 'primary', 'Busy', start, end, 'private');
            results.push({ ...entry, created: true });
          }
        }
      }
    }

    const weeks = groupByWeek(buildTargetDays(config));
    const totalFocusMin = allBlocks
      .filter((b) => b.label === '🤓 Focus Time')
      .reduce((sum, b) => sum + durationMinutes(b.start, b.end), 0);

    res.json({
      dryRun,
      blocks: results,
      summary: {
        total: allBlocks.length,
        created: results.filter((r) => r.created).length,
        skipped: results.filter((r) => r.skipped).length,
        lunchCount: allBlocks.filter((b) => b.label === '🍝 Lunch').length,
        focusHours: parseFloat((totalFocusMin / 60).toFixed(1)),
        weeklyTarget: config.focusTime.weeklyTargetHours,
        weeks: weeks.length,
      },
      missedLunch,
      focusShortfall,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Slack OAuth routes ────────────────────────────────────────────────────────

app.get('/slack/auth/start', (_req, res) => {
  const env = loadEnv();
  if (!env.SLACK_CLIENT_ID) {
    res.status(400).json({ error: 'SLACK_CLIENT_ID must be set in .env first' });
    return;
  }
  const redirectUri = `https://localhost:${PORT}/slack/auth/callback`;
  const url = `https://slack.com/oauth/v2/authorize?client_id=${env.SLACK_CLIENT_ID}&user_scope=users.profile:write&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(url);
});

app.get('/slack/auth/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send('Missing code'); return; }
  const env = loadEnv();
  const redirectUri = `https://localhost:${PORT}/slack/auth/callback`;
  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await response.json() as any;
    if (!data.ok) { res.status(400).send(`Slack auth failed: ${data.error}`); return; }
    const userToken = data.authed_user?.access_token;
    if (!userToken) { res.status(400).send('No user token returned'); return; }
    saveEnvKey('SLACK_USER_TOKEN', userToken);
    res.redirect('/?slack=success');
  } catch (e: any) {
    res.status(500).send(`Auth failed: ${e.message}`);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const sslOptions = {
  key: readFileSync(join(__dirname, '..', 'localhost-key.pem')),
  cert: readFileSync(join(__dirname, '..', 'localhost-cert.pem')),
};

createServer(sslOptions, app).listen(PORT, () => {
  console.log(`\n✅ Block Time running at https://localhost:${PORT}`);
  console.log(`   Google redirect URI: https://localhost:${PORT}/auth/callback`);
  console.log(`   Slack redirect URI:  https://localhost:${PORT}/slack/auth/callback\n`);
});
