/**
 * Merges the two halves of a profile into what the dashboard renders.
 *
 * The CLI uploads local agent activity; the web app collects GitHub itself.
 * Neither half is complete on its own, and either can be missing — a user who
 * has signed in but never run the CLI still gets a page.
 */

const DAYS = 364;

const dayKey = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

function buildCalendar(agentDays, byTool, gh) {
  // Prefer GitHub's own week grid: it is Sunday-aligned and matches exactly
  // what an employer sees on the public profile.
  const ghCal = gh?.calendarDays;
  let dates = ghCal && ghCal.length >= 300 ? ghCal.slice() : null;

  if (!dates) {
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - (DAYS - 1));
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    dates = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(dayKey(d));
  }

  const ghDays = gh?.days || {};
  return dates.map((k) => {
    const a = agentDays?.[k];
    const cell = {
      date: k,
      prompts: a?.prompts || 0,
      tokens: a?.tokens || 0,
      contributions: ghDays[k] || 0,
      byTool: {},
    };
    for (const [slug, series] of Object.entries(byTool || {})) {
      const n = series?.[k];
      if (n) cell.byTool[slug] = { prompts: n };
    }
    cell.score = cell.prompts + cell.contributions;
    return cell;
  });
}

function streaks(cal) {
  let run = 0, longest = 0, activeDays = 0;
  for (const c of cal) {
    if (c.score > 0) { run++; activeDays++; longest = Math.max(longest, run); }
    else run = 0;
  }
  // Current streak counts back from today; an idle today doesn't break it yet.
  let current = 0;
  for (let i = cal.length - 1; i >= 0; i--) {
    if (cal[i].score > 0) current++;
    else if (i === cal.length - 1) continue;
    else break;
  }
  return { current, longest, activeDays };
}

/**
 * @param user  row from the users table (slug, name, avatar, bio)
 * @param agents payload uploaded by the CLI, or null
 * @param gh     GitHub data collected server-side, or null
 */
export function buildSnapshot({ user, agents, gh }) {
  const tools = agents?.tools || [];
  const calendar = buildCalendar(agents?.days, agents?.byTool, gh);
  const st = streaks(calendar);
  const t = gh?.totals || {};

  const sum = (f) => tools.reduce((n, x) => n + (x[f] || 0), 0);
  const windowPrompts = calendar.reduce((n, c) => n + c.prompts, 0);
  const promptDays = calendar.filter((c) => c.prompts > 0).length;
  const peak = calendar.reduce((m, c) => (c.prompts > (m?.prompts ?? -1) ? c : m), null);

  return {
    slug: user.slug,
    generatedAt: new Date().toISOString(),
    agentsAt: agents?.collectedAt || null,
    githubAt: gh?.collectedAt || null,
    windowDays: calendar.length,
    windowStart: calendar[0]?.date,
    windowEnd: calendar[calendar.length - 1]?.date,
    profile: { name: user.name || user.slug, login: user.slug, avatar: user.avatar || "", bio: user.bio || "" },
    headline: {
      tokens: sum("tokens"),
      cachedTokens: sum("cached"),
      prompts: windowPrompts,
      promptsAllTime: sum("prompts"),
      sessions: sum("sessions"),
      commits: t.commits || 0,
      commitsAllTime: t.commitsAllTime || 0,
      publicCommits: t.publicCommits || 0,
      privateContributions: t.privateContributions || 0,
      contributions: t.contributions || 0,
      prs: t.prs || 0,
      prsMerged: t.prsMerged || 0,
      prsAllTime: t.prsAllTime || 0,
      reviews: t.reviews || 0,
      repos: t.repos || 0,
      promptsPerPromptDay: promptDays ? +(windowPrompts / promptDays).toFixed(1) : 0,
      promptDays,
      peakDay: peak ? { date: peak.date, prompts: peak.prompts } : null,
      ...st,
    },
    tools: [...tools, { slug: "github", label: "GitHub", ...t, unavailable: !gh }],
    calendar,
    repos: (gh?.repoBreakdown || []).slice(0, 10),
    // Surfaced so the page can say which half is missing rather than showing zeros.
    has: { agents: !!agents, github: !!gh },
  };
}
