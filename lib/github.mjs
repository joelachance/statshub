/**
 * GitHub collection — runs on the server, never in the CLI.
 *
 * The web app owns identity, so it also owns everything that needs a GitHub
 * token. Nothing here touches the filesystem, which keeps it safe to import
 * from a route handler.
 */

const DAYS = 364;   // GitHub rejects a contributions window longer than a year

const dayKey = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

const DAY_FIELDS = ["prompts", "tokens", "input", "output", "cached", "contributions", "linesAccepted"];
function newDays() { return new Map(); }
function bump(days, key, field, n = 1) {
  if (!key || !n) return;
  let d = days.get(key);
  if (!d) { d = Object.fromEntries(DAY_FIELDS.map((f) => [f, 0])); days.set(key, d); }
  d[field] += n;
}

let log = () => {};
export function setLogger(fn) { log = fn; }

const GH_API = "https://api.github.com";

function makeGitHub(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "statshub",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  async function rest(pathname) {
    const r = await fetch(`${GH_API}${pathname}`, { headers });
    if (!r.ok) throw new Error(`GitHub ${r.status} on ${pathname}`);
    return r.json();
  }

  async function graphql(query, variables) {
    const r = await fetch(`${GH_API}/graphql`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json();
    if (j.errors?.length) throw new Error(j.errors[0].message);
    return j.data;
  }

  /** Search sees private repositories the token can read, unlike the typed
   *  contribution counters, which are public-only. */
  async function count(kind, q) {
    try {
      const j = await rest(`/search/${kind}?q=${encodeURIComponent(q)}&per_page=1`);
      return j.total_count ?? null;
    } catch { return null; }
  }

  return { rest, graphql, count };
}

export async function collectGitHub(token) {
  const days = newDays();
  const totals = {
    commits: 0, commitsAllTime: 0, prs: 0, prsMerged: 0, prsAllTime: 0,
    contributions: 0, privateContributions: 0, publicCommits: 0,
    reviews: 0, issues: 0, repos: 0, followers: 0,
  };
  const repoBreakdown = [];
  let login = "", name = "", avatar = "", bio = "";

  if (!token) return { tool: "GitHub", days, totals, unavailable: true, login, name, avatar, bio, repoBreakdown };

  const api = makeGitHub(token);
  const me = await api.rest("/user");
  login = me.login; name = me.name || me.login; avatar = me.avatar_url; bio = me.bio || "";
  totals.followers = me.followers || 0;

  const from = new Date(); from.setDate(from.getDate() - DAYS);
  const sinceDay = dayKey(from);

  const query = `
    query($login:String!, $from:DateTime!, $to:DateTime!) {
      user(login:$login) {
        contributionsCollection(from:$from, to:$to) {
          totalCommitContributions
          totalPullRequestReviewContributions
          totalIssueContributions
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
          commitContributionsByRepository(maxRepositories:100) {
            repository { nameWithOwner isPrivate stargazerCount primaryLanguage { name } }
            contributions { totalCount }
          }
        }
      }
    }`;

  let calendarDays = [];
  try {
    const d = await api.graphql(query, {
      login, from: from.toISOString(), to: new Date().toISOString(),
    });
    const cc = d.user.contributionsCollection;

    totals.publicCommits = cc.totalCommitContributions;
    totals.reviews = cc.totalPullRequestReviewContributions;
    totals.issues = cc.totalIssueContributions;
    totals.privateContributions = cc.restrictedContributionsCount || 0;
    totals.contributions = cc.contributionCalendar.totalContributions;

    for (const w of cc.contributionCalendar.weeks)
      for (const day of w.contributionDays) {
        calendarDays.push(day.date);
        if (day.contributionCount) bump(days, day.date, "contributions", day.contributionCount);
      }

    for (const r of cc.commitContributionsByRepository) {
      const priv = r.repository.isPrivate;
      repoBreakdown.push({
        // Private repositories are never named. Their commits still count
        // toward the headline totals; only the identity is withheld.
        name: priv ? "Private repository" : r.repository.nameWithOwner,
        private: priv,
        commits: r.contributions.totalCount,
        stars: priv ? 0 : r.repository.stargazerCount,
        language: priv ? null : (r.repository.primaryLanguage?.name || null),
      });
    }
    repoBreakdown.sort((a, b) => b.commits - a.commits);
    totals.repos = repoBreakdown.length;
  } catch (e) {
    log(`  github: contributions query failed — ${e.message}`);
  }

  const [commitsWindow, prsWindow, prsMerged, commitsAll, prsAll] = await Promise.all([
    api.count("commits", `author:${login} committer-date:>=${sinceDay}`),
    api.count("issues", `is:pr author:${login} created:>=${sinceDay}`),
    api.count("issues", `is:pr author:${login} is:merged created:>=${sinceDay}`),
    api.count("commits", `author:${login}`),
    api.count("issues", `is:pr author:${login}`),
  ]);

  totals.commits = commitsWindow ?? totals.publicCommits;
  totals.commitsAllTime = commitsAll ?? 0;
  totals.prs = prsWindow ?? 0;
  totals.prsMerged = prsMerged ?? 0;
  totals.prsAllTime = prsAll ?? 0;

  return { tool: "GitHub", days, totals, login, name, avatar, bio, repoBreakdown, calendarDays };
}


/** Day buckets are a Map, which does not survive JSON. Flatten for storage. */
export function githubToJSON(g) {
  return {
    totals: g.totals,
    login: g.login, name: g.name, avatar: g.avatar, bio: g.bio,
    repoBreakdown: g.repoBreakdown,
    calendarDays: g.calendarDays || [],
    days: Object.fromEntries([...g.days].map(([k, v]) => [k, v.contributions])),
    collectedAt: new Date().toISOString(),
  };
}
