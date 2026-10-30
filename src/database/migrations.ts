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
  `CREATE TABLE gift_birthdays (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, day_month TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  ) STRICT;
  CREATE TABLE gift_cycles (
    id INTEGER PRIMARY KEY,
    guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, user_id TEXT NOT NULL,
    name TEXT NOT NULL, birthday TEXT NOT NULL,
    prior_view INTEGER NOT NULL CHECK (prior_view BETWEEN -1 AND 1),
    state TEXT NOT NULL CHECK (state IN ('prepared', 'hidden', 'publishing', 'announced', 'restoring', 'restored')),
    message_id TEXT,
    UNIQUE (guild_id, channel_id, user_id, birthday)
  ) STRICT;
  CREATE UNIQUE INDEX gift_active_member ON gift_cycles (guild_id, channel_id, user_id) WHERE state != 'restored';
  CREATE TABLE gift_participants (
    cycle_id INTEGER NOT NULL REFERENCES gift_cycles(id), user_id TEXT NOT NULL,
    PRIMARY KEY (cycle_id, user_id)
  ) STRICT;`,
  `CREATE TABLE gift_admin_notices (
    id INTEGER PRIMARY KEY,
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
    name TEXT NOT NULL, birthday TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'sent', 'uncertain')),
    message_id TEXT,
    retry_at INTEGER NOT NULL DEFAULT 0 CHECK (retry_at >= 0),
    CHECK (user_id != recipient_id),
    UNIQUE (guild_id, user_id, birthday)
  ) STRICT;`,
  `ALTER TABLE gift_cycles ADD COLUMN exclusion_mode TEXT NOT NULL DEFAULT 'bot'
    CHECK (exclusion_mode IN ('bot', 'manual'));`,
  `CREATE TABLE gift_member_details (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    username TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    phone TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, postal_code TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id),
    FOREIGN KEY (guild_id, user_id) REFERENCES gift_birthdays(guild_id, user_id)
  ) STRICT;`,
  `ALTER TABLE gift_birthdays ADD COLUMN category TEXT NOT NULL DEFAULT 'gift'
    CHECK (category IN ('gift', 'no-gift'));`,
  `ALTER TABLE gift_cycles ADD COLUMN access_role_id TEXT;`,
];
