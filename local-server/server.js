const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = path.join(DATA_DIR, 'worldcup-2026-pool.sqlite');
const PUBLIC_DIR = path.join(__dirname, 'public');
const FIFA_API_URL = 'https://api.fifa.com/api/v3/calendar/matches';
const FIFA_COMPETITION_ID = '17';
const FIFA_SEASON_ID = '285023';
const UPDATE_INTERVAL_SECONDS = Number(
  process.env.FIFA_UPDATE_INTERVAL_SECONDS || 60
);

const DEFAULT_SCORING = {
  exactScorePoints: 15,
  correctResultPoints: 10,
  scoreDifferencePenalty: 1,
  minimumCorrectResultPoints: 0,
  wrongResultPoints: 0,
  bonusRules: {},
  tournamentStartAt: Date.parse('2026-06-11T19:00:00.000Z'),
};

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    displayName TEXT NOT NULL,
    userName TEXT NOT NULL UNIQUE,
    photoURL TEXT NOT NULL DEFAULT '',
    score INTEGER NOT NULL DEFAULT 0,
    admin INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    fifaId TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    homeScore INTEGER NOT NULL DEFAULT -1,
    awayScore INTEGER NOT NULL DEFAULT -1,
    status TEXT NOT NULL DEFAULT 'unknown',
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS predictions (
    userId TEXT NOT NULL,
    matchId TEXT NOT NULL,
    homePrediction INTEGER NOT NULL,
    awayPrediction INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL,
    PRIMARY KEY (userId, matchId)
  );

  CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    ownerId TEXT NOT NULL,
    inviteCode TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL,
    description TEXT,
    imageURL TEXT
  );

  CREATE TABLE IF NOT EXISTS league_members (
    leagueId TEXT NOT NULL,
    userId TEXT NOT NULL,
    PRIMARY KEY (leagueId, userId)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const json = (res, status, data) => {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

const text = (res, status, message) => {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(message);
};

const readBody = async (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });

const normalizeUsername = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\./g, '');

const sanitizeUsername = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');

const generateSlug = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const getWinner = (home, away) => {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'tied';
};

const getScoring = () => {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'scoring'")
    .get();
  if (!row) return DEFAULT_SCORING;
  return { ...DEFAULT_SCORING, ...JSON.parse(row.value) };
};

const setScoring = (settings) => {
  const current = getScoring();
  if (Date.now() >= current.tournamentStartAt) {
    throw new Error('Scoring settings are locked');
  }
  const next = { ...DEFAULT_SCORING, ...settings };
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('scoring', ?)"
  ).run(JSON.stringify(next));
  recalculateAllPredictionPoints();
};

const getBonusRulePoints = (
  rule,
  homeScore,
  awayScore,
  homePrediction,
  awayPrediction
) => {
  if (!rule.enabled) return 0;
  if (rule.type === 'correctHomeScore') {
    return homeScore === homePrediction ? rule.points : 0;
  }
  if (rule.type === 'correctAwayScore') {
    return awayScore === awayPrediction ? rule.points : 0;
  }
  if (rule.type === 'correctGoalDifference') {
    return homeScore - awayScore === homePrediction - awayPrediction
      ? rule.points
      : 0;
  }
  return 0;
};

const calculatePoints = (
  homeScore,
  awayScore,
  homePrediction,
  awayPrediction,
  settings = getScoring()
) => {
  if (homeScore < 0 || awayScore < 0) return 0;

  let points = settings.wrongResultPoints;
  if (homeScore === homePrediction && awayScore === awayPrediction) {
    points = settings.exactScorePoints;
  } else if (
    getWinner(homeScore, awayScore) ===
    getWinner(homePrediction, awayPrediction)
  ) {
    const difference =
      Math.abs(homePrediction - homeScore) +
      Math.abs(awayPrediction - awayScore);
    points = Math.max(
      settings.minimumCorrectResultPoints,
      settings.correctResultPoints -
        difference * settings.scoreDifferencePenalty
    );
  }

  for (const rule of Object.values(settings.bonusRules || {})) {
    points += getBonusRulePoints(
      rule,
      homeScore,
      awayScore,
      homePrediction,
      awayPrediction
    );
  }

  return points;
};

const userToData = (user) => ({
  email: user.email,
  displayName: user.displayName,
  userName: user.userName,
  photoURL: user.photoURL,
  score: user.score,
  admin: Boolean(user.admin),
});

const toLocalUser = (user) => ({
  uid: user.id,
  email: user.email,
  displayName: user.displayName,
  photoURL: user.photoURL,
});

const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

const getUsers = () =>
  db
    .prepare('SELECT * FROM users ORDER BY score DESC, displayName ASC')
    .all()
    .map((user) => ({ id: user.id, ...userToData(user) }));

const rebuildUserScore = (userId) => {
  const row = db
    .prepare('SELECT COALESCE(SUM(points), 0) AS score FROM predictions WHERE userId = ?')
    .get(userId);
  db.prepare('UPDATE users SET score = ? WHERE id = ?').run(row.score, userId);
};

const recalculateAllPredictionPoints = () => {
  const settings = getScoring();
  const predictions = db.prepare('SELECT * FROM predictions').all();
  const users = new Set();

  for (const prediction of predictions) {
    const match = getMatchRow(prediction.matchId);
    if (!match) continue;
    const points = calculatePoints(
      match.homeScore,
      match.awayScore,
      prediction.homePrediction,
      prediction.awayPrediction,
      settings
    );
    db.prepare(
      'UPDATE predictions SET points = ? WHERE userId = ? AND matchId = ?'
    ).run(points, prediction.userId, prediction.matchId);
    users.add(prediction.userId);
  }

  for (const userId of users) rebuildUserScore(userId);
};

const ensureUniqueUsername = (baseName) => {
  const base = sanitizeUsername(baseName) || 'user';
  let userName = base;
  let suffix = 0;
  while (
    db.prepare('SELECT id FROM users WHERE userName = ?').get(userName)
  ) {
    suffix += 1;
    userName = `${base}${suffix}`;
  }
  return userName;
};

const getMatchRow = (id) =>
  db.prepare('SELECT * FROM matches WHERE id = ?').get(String(id));

const rowToMatch = (row) => (row ? JSON.parse(row.data) : null);

const getMatches = () => {
  const rows = db.prepare('SELECT * FROM matches ORDER BY CAST(id AS INTEGER)').all();
  return Object.fromEntries(rows.map((row) => [row.id, rowToMatch(row)]));
};

const saveMatch = (id, match) => {
  db.prepare(
    `INSERT OR REPLACE INTO matches
      (id, fifaId, timestamp, homeScore, awayScore, status, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    String(id),
    match.fifaId,
    match.timestamp,
    match.homeScore,
    match.awayScore,
    match.status || 'unknown',
    JSON.stringify(match)
  );
};

const readStatusText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readStatusText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return [
      value.Description,
      value.Name,
      value.Status,
      value.MatchStatus,
      value.Phase,
    ]
      .map(readStatusText)
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

const normalizeStatus = (match) => {
  const text = [match.MatchStatus, match.Status, match.MatchTime, match.Period]
    .map(readStatusText)
    .join(' ')
    .toLowerCase();
  if (/\b(finished|final|full.?time|completed|closed|ft|aet|pen)\b/.test(text)) {
    return 'finished';
  }
  if (/\b(live|progress|half|halftime|1h|2h|extra|penalty|started)\b/.test(text)) {
    return 'live';
  }
  if (/\b(scheduled|not started|fixture|ns|tbd)\b/.test(text)) {
    return 'scheduled';
  }
  return 'unknown';
};

const transformFifaData = (results) => {
  const matches = {};
  results.forEach((item, index) => {
    const game = index + 1;
    const home = item.Home?.Abbreviation || item.PlaceHolderA || 'TBD';
    const away = item.Away?.Abbreviation || item.PlaceHolderB || 'TBD';
    matches[String(game)] = {
      game,
      fifaId: item.IdMatch,
      status: normalizeStatus(item),
      round: item.StageName?.[0]?.Description || '',
      group: item.GroupName?.[0]?.Description?.replace('Group ', '') || null,
      date: item.Date,
      timestamp: Math.floor(new Date(item.Date).getTime() / 1000),
      location: item.Stadium?.Name?.[0]?.Description || '',
      locationCity: item.Stadium?.CityName?.[0]?.Description || '',
      locationCountry: item.Stadium?.IdCountry || '',
      home,
      homeName: item.Home?.ShortClubName || item.PlaceHolderA || home,
      homeScore: item.Home?.Score ?? -1,
      away,
      awayName: item.Away?.ShortClubName || item.PlaceHolderB || away,
      awayScore: item.Away?.Score ?? -1,
    };
  });
  return matches;
};

const fetchFifaMatches = async (from, to) => {
  const url = new URL(FIFA_API_URL);
  url.searchParams.set('idseason', FIFA_SEASON_ID);
  url.searchParams.set('idcompetition', FIFA_COMPETITION_ID);
  url.searchParams.set('count', '500');
  if (from) url.searchParams.set('from', from.toISOString());
  if (to) url.searchParams.set('to', to.toISOString());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FIFA API error: ${response.status}`);
  const data = await response.json();
  return data.Results || [];
};

const initializeMatchesIfMissing = async () => {
  const row = db.prepare('SELECT COUNT(*) AS total FROM matches').get();
  if (row.total > 0) return;
  console.info('Initializing matches from FIFA API...');
  const matches = transformFifaData(await fetchFifaMatches());
  for (const [id, match] of Object.entries(matches)) saveMatch(id, match);
  console.info(`Initialized ${Object.keys(matches).length} matches`);
};

const updateScoresFromFifa = async () => {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const fifaMatches = await fetchFifaMatches(from, to);
  let changed = 0;

  for (const fifaMatch of fifaMatches) {
    const row = db
      .prepare('SELECT * FROM matches WHERE fifaId = ?')
      .get(fifaMatch.IdMatch);
    if (!row) continue;

    const match = rowToMatch(row);
    const nextHomeScore = fifaMatch.Home?.Score ?? -1;
    const nextAwayScore = fifaMatch.Away?.Score ?? -1;
    const nextStatus = normalizeStatus(fifaMatch);
    let shouldSave = false;

    if (nextHomeScore >= 0 && match.homeScore !== nextHomeScore) {
      match.homeScore = nextHomeScore;
      shouldSave = true;
    }
    if (nextAwayScore >= 0 && match.awayScore !== nextAwayScore) {
      match.awayScore = nextAwayScore;
      shouldSave = true;
    }
    if (nextStatus !== 'unknown' && match.status !== nextStatus) {
      match.status = nextStatus;
      shouldSave = true;
    }

    if (shouldSave) {
      saveMatch(row.id, match);
      recalculateMatchPredictionPoints(row.id);
      changed += 1;
    }
  }

  if (changed > 0) console.info(`Updated ${changed} match(es)`);
};

const recalculateMatchPredictionPoints = (matchId) => {
  const match = rowToMatch(getMatchRow(matchId));
  if (!match) return;
  const settings = getScoring();
  const predictions = db
    .prepare('SELECT * FROM predictions WHERE matchId = ?')
    .all(String(matchId));
  const users = new Set();

  for (const prediction of predictions) {
    const points = calculatePoints(
      match.homeScore,
      match.awayScore,
      prediction.homePrediction,
      prediction.awayPrediction,
      settings
    );
    db.prepare(
      'UPDATE predictions SET points = ? WHERE userId = ? AND matchId = ?'
    ).run(points, prediction.userId, prediction.matchId);
    users.add(prediction.userId);
  }

  for (const userId of users) rebuildUserScore(userId);
};

const getPredictions = (userId) => {
  const rows = db
    .prepare('SELECT * FROM predictions WHERE userId = ?')
    .all(userId);
  return Object.fromEntries(
    rows.map((row) => [
      row.matchId,
      {
        homePrediction: row.homePrediction,
        awayPrediction: row.awayPrediction,
        points: row.points,
        updatedAt: row.updatedAt,
      },
    ])
  );
};

const leagueWithCount = (league) => {
  const row = db
    .prepare('SELECT COUNT(*) AS total FROM league_members WHERE leagueId = ?')
    .get(league.id);
  return {
    id: league.id,
    name: league.name,
    slug: league.slug,
    ownerId: league.ownerId,
    inviteCode: league.inviteCode,
    createdAt: league.createdAt,
    description: league.description || undefined,
    imageURL: league.imageURL || undefined,
    memberCount: row.total,
  };
};

const getLeagueBySlug = (slug) => {
  const row = db.prepare('SELECT * FROM leagues WHERE slug = ?').get(slug);
  return row ? leagueWithCount(row) : null;
};

const getLeagueByCode = (code) => {
  const row = db
    .prepare('SELECT * FROM leagues WHERE UPPER(inviteCode) = ?')
    .get(String(code).toUpperCase());
  return row ? leagueWithCount(row) : null;
};

const handleApi = async (req, res, url) => {
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (req.method === 'POST' && url.pathname === '/api/auth/local') {
    const body = await readBody(req);
    const displayName = String(body.displayName || '').trim();
    if (!displayName) return text(res, 400, 'Display name is required');

    const count = db.prepare('SELECT COUNT(*) AS total FROM users').get();
    const id = crypto.randomUUID();
    const userName = ensureUniqueUsername(displayName);
    db.prepare(
      `INSERT INTO users
        (id, displayName, userName, admin, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, displayName, userName, count.total === 0 ? 1 : 0, Date.now());
    const user = getUser(id);
    return json(res, 200, { user: toLocalUser(user), userData: userToData(user) });
  }

  if (req.method === 'GET' && parts[1] === 'auth' && parts[2] === 'local') {
    const user = getUser(parts[3]);
    if (!user) return text(res, 404, 'User not found');
    return json(res, 200, { user: toLocalUser(user), userData: userToData(user) });
  }

  if (req.method === 'GET' && url.pathname === '/api/matches') {
    await initializeMatchesIfMissing();
    return json(res, 200, getMatches());
  }

  if (req.method === 'POST' && url.pathname === '/api/matches/refresh') {
    await updateScoresFromFifa();
    return json(res, 200, getMatches());
  }

  if (req.method === 'GET' && parts[1] === 'matches') {
    return json(res, 200, rowToMatch(getMatchRow(parts[2])));
  }

  if (req.method === 'GET' && url.pathname === '/api/users') {
    return json(res, 200, getUsers());
  }

  if (req.method === 'GET' && url.pathname === '/api/usernames/check') {
    const userName = sanitizeUsername(url.searchParams.get('userName'));
    const currentUid = url.searchParams.get('currentUid');
    const row = db.prepare('SELECT id FROM users WHERE userName = ?').get(userName);
    return json(res, 200, { available: !row || row.id === currentUid });
  }

  if (req.method === 'GET' && parts[1] === 'users' && parts[2] === 'by-username') {
    const user = db
      .prepare('SELECT * FROM users WHERE userName = ?')
      .get(sanitizeUsername(parts[3]));
    return json(res, 200, user ? { id: user.id, data: userToData(user) } : null);
  }

  if (parts[1] === 'users' && parts[2]) {
    const userId = parts[2];

    if (req.method === 'PUT' && parts.length === 3) {
      const body = await readBody(req);
      const current = getUser(userId);
      if (!current) return text(res, 404, 'User not found');
      const userName = body.userName
        ? sanitizeUsername(body.userName)
        : current.userName;
      const existing = db
        .prepare('SELECT id FROM users WHERE userName = ? AND id != ?')
        .get(userName, userId);
      if (existing) return text(res, 409, 'Username is already taken');
      db.prepare(
        `UPDATE users
         SET userName = ?, displayName = ?, photoURL = ?
         WHERE id = ?`
      ).run(
        userName,
        body.displayName ?? current.displayName,
        body.photoURL ?? current.photoURL,
        userId
      );
      return json(res, 200, userToData(getUser(userId)));
    }

    if (req.method === 'DELETE' && parts.length === 3) {
      db.prepare('DELETE FROM predictions WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM league_members WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      return json(res, 204);
    }

    if (req.method === 'GET' && parts[3] === 'predictions' && !parts[4]) {
      return json(res, 200, getPredictions(userId));
    }

    if (parts[3] === 'predictions' && parts[4]) {
      const matchId = parts[4];
      if (req.method === 'GET') {
        return json(res, 200, getPredictions(userId)[matchId] || null);
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const match = rowToMatch(getMatchRow(matchId));
        if (!match) return text(res, 404, 'Match not found');
        const now = Date.now();
        const cutoff = match.timestamp * 1000 - 10 * 60 * 1000;
        if (now >= cutoff) return text(res, 403, 'Predictions are closed');
        const homePrediction = Math.max(0, Math.floor(Number(body.homePrediction)));
        const awayPrediction = Math.max(0, Math.floor(Number(body.awayPrediction)));
        const points = calculatePoints(
          match.homeScore,
          match.awayScore,
          homePrediction,
          awayPrediction
        );
        db.prepare(
          `INSERT OR REPLACE INTO predictions
            (userId, matchId, homePrediction, awayPrediction, points, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(userId, matchId, homePrediction, awayPrediction, points, now);
        rebuildUserScore(userId);
        return json(res, 204);
      }
    }

    if (req.method === 'GET' && parts[3] === 'leagues') {
      const leagues = db
        .prepare(
          `SELECT l.* FROM leagues l
           INNER JOIN league_members lm ON lm.leagueId = l.id
           WHERE lm.userId = ?
           ORDER BY l.createdAt DESC`
        )
        .all(userId)
        .map(leagueWithCount);
      return json(res, 200, leagues);
    }

    if (req.method === 'GET' && parts[3] === 'owned-leagues') {
      const leagues = db
        .prepare('SELECT * FROM leagues WHERE ownerId = ? ORDER BY createdAt DESC')
        .all(userId)
        .map(leagueWithCount);
      return json(res, 200, leagues);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/leagues/slugs/check') {
    const slug = generateSlug(url.searchParams.get('slug'));
    const row = db.prepare('SELECT id FROM leagues WHERE slug = ?').get(slug);
    return json(res, 200, { available: !row });
  }

  if (req.method === 'POST' && url.pathname === '/api/leagues') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return text(res, 400, 'League name is required');
    let slug = generateSlug(body.slug || name);
    if (!slug) slug = crypto.randomUUID();
    let suffix = 0;
    const baseSlug = slug;
    while (db.prepare('SELECT id FROM leagues WHERE slug = ?').get(slug)) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }
    const id = crypto.randomUUID();
    const inviteCode = generateInviteCode();
    db.prepare(
      `INSERT INTO leagues
        (id, name, slug, ownerId, inviteCode, createdAt, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, slug, body.ownerId, inviteCode, Date.now(), body.description || null);
    db.prepare('INSERT INTO league_members (leagueId, userId) VALUES (?, ?)').run(
      id,
      body.ownerId
    );
    return json(res, 200, leagueWithCount(db.prepare('SELECT * FROM leagues WHERE id = ?').get(id)));
  }

  if (req.method === 'GET' && parts[1] === 'leagues' && parts[2] === 'by-slug') {
    return json(res, 200, getLeagueBySlug(parts[3]));
  }

  if (req.method === 'GET' && parts[1] === 'leagues' && parts[2] === 'by-code') {
    return json(res, 200, getLeagueByCode(parts[3]));
  }

  if (parts[1] === 'leagues' && parts[2]) {
    const leagueId = parts[2];

    if (req.method === 'PUT' && parts.length === 3) {
      const body = await readBody(req);
      const current = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
      if (!current) return text(res, 404, 'League not found');
      const slug = body.slug ? generateSlug(body.slug) : current.slug;
      const existing = db
        .prepare('SELECT id FROM leagues WHERE slug = ? AND id != ?')
        .get(slug, leagueId);
      if (existing) return text(res, 409, 'This URL is already taken');
      db.prepare(
        `UPDATE leagues
         SET name = ?, description = ?, imageURL = ?, slug = ?
         WHERE id = ?`
      ).run(
        body.name ?? current.name,
        body.description ?? current.description,
        body.imageURL ?? current.imageURL,
        slug,
        leagueId
      );
      return json(res, 204);
    }

    if (req.method === 'DELETE' && parts.length === 3) {
      db.prepare('DELETE FROM league_members WHERE leagueId = ?').run(leagueId);
      db.prepare('DELETE FROM leagues WHERE id = ?').run(leagueId);
      return json(res, 204);
    }

    if (req.method === 'GET' && parts[3] === 'members' && !parts[4]) {
      const rows = db
        .prepare('SELECT userId FROM league_members WHERE leagueId = ?')
        .all(leagueId);
      return json(res, 200, rows.map((row) => row.userId));
    }

    if (parts[3] === 'members' && parts[4]) {
      const userId = parts[4];
      if (req.method === 'GET') {
        const row = db
          .prepare('SELECT 1 FROM league_members WHERE leagueId = ? AND userId = ?')
          .get(leagueId, userId);
        return json(res, 200, { member: Boolean(row) });
      }
      if (req.method === 'PUT') {
        db.prepare(
          'INSERT OR IGNORE INTO league_members (leagueId, userId) VALUES (?, ?)'
        ).run(leagueId, userId);
        return json(res, 204);
      }
      if (req.method === 'DELETE') {
        db.prepare(
          'DELETE FROM league_members WHERE leagueId = ? AND userId = ?'
        ).run(leagueId, userId);
        return json(res, 204);
      }
    }

    if (req.method === 'POST' && parts[3] === 'invite-code') {
      const inviteCode = generateInviteCode();
      db.prepare('UPDATE leagues SET inviteCode = ? WHERE id = ?').run(
        inviteCode,
        leagueId
      );
      return json(res, 200, { inviteCode });
    }
  }

  if (url.pathname === '/api/settings/scoring') {
    if (req.method === 'GET') return json(res, 200, getScoring());
    if (req.method === 'PUT') {
      setScoring(await readBody(req));
      return json(res, 204);
    }
  }

  return text(res, 404, 'Not found');
};

const serveStatic = (req, res, url) => {
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return text(res, 403, 'Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const mime =
    {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
    }[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((error) => {
      console.error(error);
      text(res, 500, error.message || 'Internal server error');
    });
    return;
  }

  serveStatic(req, res, url);
});

initializeMatchesIfMissing().catch((error) => {
  console.error('Initial match sync failed:', error);
});

setInterval(() => {
  updateScoresFromFifa().catch((error) => {
    console.error('Score sync failed:', error);
  });
}, Math.max(15, UPDATE_INTERVAL_SECONDS) * 1000);

server.listen(PORT, () => {
  console.info(`World Cup pool local server listening on ${PORT}`);
  console.info(`SQLite database: ${DB_PATH}`);
});
