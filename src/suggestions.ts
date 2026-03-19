import type { ScheduleReport } from './scheduler.js';

interface SuggestionContext {
  missedLunch: ScheduleReport['missedLunch'];
  focusShortfall: ScheduleReport['focusShortfall'];
}

/**
 * Enriches scheduling report suggestions using GPT.
 * Falls back to the original rule-based suggestions if no API key or if the call fails.
 */
export async function enrichWithAI(
  report: ScheduleReport,
  openaiApiKey: string
): Promise<ScheduleReport> {
  const { missedLunch, focusShortfall } = report;
  if (missedLunch.length === 0 && !focusShortfall) return report;

  const prompt = buildPrompt({ missedLunch, focusShortfall });

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful calendar assistant. Give concise, practical, non-judgmental suggestions for how someone could make space on their calendar. Be specific about times and days when the data supports it. Keep each suggestion to 1-2 sentences. Never be preachy.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) return report;

    const data = await res.json() as any;
    const parsed = JSON.parse(data.choices[0].message.content) as {
      missedLunch?: { day: string; suggestion: string }[];
      focusSuggestions?: string[];
    };

    // Merge AI suggestions back in, keeping original reason/day fields
    const enrichedMissedLunch = missedLunch.map((m) => {
      const aiEntry = parsed.missedLunch?.find((a) => a.day === m.day);
      return aiEntry ? { ...m, suggestion: aiEntry.suggestion } : m;
    });

    const enrichedFocusShortfall = focusShortfall && parsed.focusSuggestions
      ? { ...focusShortfall, suggestions: parsed.focusSuggestions }
      : focusShortfall;

    return { ...report, missedLunch: enrichedMissedLunch, focusShortfall: enrichedFocusShortfall };
  } catch {
    return report; // silently fall back
  }
}

function buildPrompt(ctx: SuggestionContext): string {
  const lines: string[] = [
    'Here is a summary of what could not be scheduled on my calendar this week.',
    'Please suggest specific, practical ways I could make space. Return JSON in this shape:',
    '{ "missedLunch": [{ "day": "<day>", "suggestion": "<suggestion>" }], "focusSuggestions": ["<suggestion>"] }',
    '',
  ];

  if (ctx.missedLunch.length > 0) {
    lines.push('MISSED LUNCH:');
    for (const m of ctx.missedLunch) {
      lines.push(`- ${m.day}: ${m.reason}`);
      lines.push(`  Context: ${m.suggestion}`);
    }
    lines.push('');
  }

  if (ctx.focusShortfall) {
    const fs = ctx.focusShortfall;
    lines.push(`FOCUS TIME SHORTFALL: ${fs.scheduled.toFixed(1)}h scheduled of ${fs.weeklyTarget.toFixed(1)}h target`);
    for (const s of fs.suggestions) {
      lines.push(`- ${s}`);
    }
  }

  return lines.join('\n');
}
