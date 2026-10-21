export const migrations: readonly string[] = [
  `CREATE TABLE lottery_players (
    guild_id TEXT NOT NULL CHECK (length(guild_id) > 0 AND guild_id NOT GLOB '*[^0-9]*'),
    user_id TEXT NOT NULL CHECK (length(user_id) > 0 AND user_id NOT GLOB '*[^0-9]*'),
    points INTEGER NOT NULL CHECK (points BETWEEN 0 AND 9007199254740991),
    last_played_day TEXT NOT NULL CHECK (last_played_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    PRIMARY KEY (guild_id, user_id)
  ) STRICT;
  CREATE INDEX lottery_ranking ON lottery_players (guild_id, points DESC, user_id ASC);`,
  `CREATE TABLE member_levels (
    guild_id TEXT NOT NULL CHECK (length(guild_id) > 0 AND guild_id NOT GLOB '*[^0-9]*'),
    user_id TEXT NOT NULL CHECK (length(user_id) > 0 AND user_id NOT GLOB '*[^0-9]*'),
    xp INTEGER NOT NULL CHECK (xp BETWEEN 0 AND 9007199254740991),
    last_awarded_at INTEGER NOT NULL CHECK (last_awarded_at >= 0),
    PRIMARY KEY (guild_id, user_id)
  ) STRICT;
  CREATE INDEX levels_ranking ON member_levels (guild_id, xp DESC, user_id ASC);`,
  `CREATE TABLE member_reputation (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    points INTEGER NOT NULL CHECK (points BETWEEN 0 AND 9007199254740991),
    PRIMARY KEY (guild_id, user_id)
  ) STRICT;
  CREATE TABLE reputation_cooldowns (
    guild_id TEXT NOT NULL,
    giver_id TEXT NOT NULL,
    last_given_at INTEGER NOT NULL CHECK (last_given_at >= 0),
    PRIMARY KEY (guild_id, giver_id)
  ) STRICT;`,
];
