import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { ButtonInteraction, ClientUser, DiscordAPIError, Message, PermissionFlagsBits as P } from 'discord.js';
import { createBot } from '../dist/discord/client.js';
import { DiscordGiftChannel } from '../dist/discord/gift-channel.js';
import { GiftService } from '../dist/features/gifts/service.js';
import { GiftStore } from '../dist/features/gifts/store.js';

// Real SDK permission resolution, message serialization and interaction REST; no login or network.
export async function verifyGiftLifecycle(db, levels) {
  const guildId = '100000000000000010';
  const channelId = '100000000000000020';
  const secondChannelId = '100000000000000021';
  const birthdayUser = '100000000000000001';
  const participant = '100000000000000002';
  const manager = '100000000000000003';
  const admin = '100000000000000004';
  const owner = '100000000000000005';
  const botId = '100000000000000006';
  const roleId = '100000000000000030';
  const managerRole = '100000000000000031';
  const adminRole = '100000000000000032';
  const botRole = '100000000000000033';
  const config = { guildId, channelId, roleId, protectedChannelIds: [channelId, secondChannelId], timeZone: 'America/Montevideo', adminIds: [admin, owner], dmOnlyAdminId: owner };
  const store = new GiftStore(db);
  const bot = createBot({ levels }, { config, store }, { config, store });
  const client = bot.client;
  client.token = 'offline-gifts-smoke';
  client.rest.setToken(client.token);
  const user = (id) => ({ id, username: `User${id.slice(-2)}`, discriminator: '0', avatar: null, bot: id === botId });
  client.user = new ClientUser(client, user(botId));
  const botPermissions = P.ViewChannel | P.SendMessages | P.EmbedLinks | P.ReadMessageHistory | P.ManageRoles | P.MentionEveryone;
  const roles = [
    { id: guildId, name: '@everyone', permissions: P.ViewChannel.toString(), position: 0 },
    { id: roleId, name: 'Cumpleañeri', permissions: '0', position: 1 },
    { id: managerRole, name: 'Organizador', permissions: P.ManageChannels.toString(), position: 2 },
    { id: adminRole, name: 'Admin', permissions: P.Administrator.toString(), position: 3 },
    { id: botRole, name: 'Pepe', permissions: botPermissions.toString(), position: 4 },
  ];
  const members = new Map([birthdayUser, participant, manager, admin, owner, botId].map((id) => [id, {
    user: user(id), joined_at: '2026-01-01T00:00:00Z', flags: 0,
    roles: id === botId ? [botRole] : [roleId, ...(id === manager ? [managerRole] : id === admin ? [adminRole] : [])],
  }]));
  const channelData = { id: channelId, guild_id: guildId, type: 0, name: 'regalos-privado', permission_overwrites: [
    { id: guildId, type: 0, allow: '0', deny: P.ViewChannel.toString() },
    { id: roleId, type: 0, allow: P.ViewChannel.toString(), deny: '0' },
    { id: botRole, type: 0, allow: P.ViewChannel.toString(), deny: '0' },
  ] };
  const secondChannel = { ...structuredClone(channelData), id: secondChannelId, name: 'regalos-nuevo' };
  const guildData = { id: guildId, name: 'Prueba local', owner_id: owner, roles, channels: [channelData, secondChannel], members: [...members.values()], features: [], shardId: 0 };
  const guild = client.guilds._add(guildData);
  const posts = [];
  const callbacks = [];
  const edits = [];
  const privatePosts = [];
  const roleWrites = [];
  let loseRoleDeleteResponse = true;
  const dmIds = new Map([[owner, '100000000000000070'], [admin, '100000000000000071']]);
  let blockedDM = false;
  let serial = 1;
  const response = (body, author = user(botId)) => JSON.parse(JSON.stringify({
    id: String(200000000000000000n + BigInt(serial++)), type: 0, channel_id: channelId, guild_id: guildId,
    author, timestamp: new Date().toISOString(), mentions: [], mention_roles: [], attachments: [], embeds: [], ...body,
  }));
  client.rest.get = async (route) => {
    if (route === `/channels/${channelId}`) return structuredClone(channelData);
    if (route === `/channels/${secondChannelId}`) return structuredClone(secondChannel);
    if (route === `/guilds/${guildId}`) return { ...guildData, channels: undefined, members: undefined };
    if (route === `/guilds/${guildId}/roles`) return structuredClone(roles);
    if (route.startsWith(`/guilds/${guildId}/members/`)) return structuredClone(members.get(route.split('/').at(-1)));
    if (route === `/channels/${channelId}/messages`) return [...posts].reverse();
    for (const dmId of dmIds.values()) {
      if (route === `/channels/${dmId}/messages`) return privatePosts.filter((p) => p.channel_id === dmId).reverse();
    }
    throw new Error(`Unexpected GET ${route}`);
  };
  client.rest.put = async (route, options = {}) => {
    assert.match(route, new RegExp(`^/guilds/${guildId}/members/\\d+/roles/${roleId}$`));
    await client.rest.resolveRequest({ ...options, fullRoute: route, method: 'PUT' });
    const id = route.split('/')[4];
    members.get(id).roles = [...new Set([...members.get(id).roles, roleId])];
    roleWrites.push({ method: 'PUT', userId: id });
  };
  client.rest.delete = async (route) => {
    assert.match(route, new RegExp(`^/guilds/${guildId}/members/\\d+/roles/${roleId}$`));
    const id = route.split('/')[4];
    members.get(id).roles = members.get(id).roles.filter((r) => r !== roleId);
    roleWrites.push({ method: 'DELETE', userId: id });
    if (loseRoleDeleteResponse) { loseRoleDeleteResponse = false; throw new Error('Respuesta de retirada perdida'); }
  };
  client.rest.post = async (route, options) => {
    await client.rest.resolveRequest({ ...options, fullRoute: route, method: 'POST' });
    if (route.startsWith('/interactions/')) { callbacks.push(options.body); return undefined; }
    if (route === '/users/@me/channels') {
      const recipient = options.body.recipient_id;
      assert.ok(dmIds.has(recipient), 'Nunca abrir un DM al cumpleañero ni a una persona sin configurar.');
      return { id: dmIds.get(recipient), type: 1, recipients: [user(recipient)] };
    }
    assert.match(route, /^\/channels\/\d+\/messages$/);
    const target = route.split('/')[2];
    if ([...dmIds.values()].includes(target)) {
      if (blockedDM) throw new DiscordAPIError({ message: 'Cannot send messages to this user', code: 50007 }, 50007, 403, 'POST', route, {});
      const raw = response({ ...options.body, channel_id: target, guild_id: undefined });
      privatePosts.push(raw);
      return raw;
    }
    const raw = response({ ...options.body, channel_id: route.split('/')[2] });
    posts.push(raw);
    return raw;
  };
  client.rest.patch = async (route, options) => {
    assert.ok(route.startsWith(`/webhooks/${botId}/`));
    await client.rest.resolveRequest({ ...options, fullRoute: route, method: 'PATCH' });
    edits.push(options.body);
    return response(options.body);
  };
  const incoming = (author, content, targetChannel = channelId) => new Message(client, { ...response({ content }, user(author)), channel_id: targetChannel });
  const emitMessage = async (author, content) => { client.emit('messageCreate', incoming(author, content)); await setImmediate(); };
  const adapter = new DiscordGiftChannel(client, config);
  const service = new GiftService(config, store, adapter);
  try {
    await adapter.validate();
    assert.equal((await adapter.inspect(admin)).canHide, false);
    assert.equal((await adapter.inspect(owner)).canHide, false);
    const everyone = channelData.permission_overwrites[0];
    everyone.deny = '0';
    await assert.rejects(adapter.validate(), /privado/);
    everyone.deny = P.ViewChannel.toString();
    const botRoleData = roles.find((r) => r.id === botRole);
    botRoleData.permissions = (botPermissions & ~P.ManageRoles).toString();
    await assert.rejects(adapter.validate(), /Gestionar roles/);
    botRoleData.permissions = botPermissions.toString();

    store.import(guildId, [{ userId: birthdayUser, name: '@everyone <@123> Persona', dayMonth: '12/11' }]);
    secondChannel.permission_overwrites.push({ id: birthdayUser, type: 1, allow: P.ViewChannel.toString(), deny: '0' });
    await assert.rejects(service.tick(new Date('2026-11-05T12:00:00Z')), /retirada perdida/);
    assert.equal(store.cycles(config)[0].state, 'prepared');
    assert.equal(members.get(birthdayUser).roles.includes(roleId), false);
    const recovered = new GiftService(config, new GiftStore(db), adapter);
    await assert.rejects(recovered.tick(new Date('2026-11-05T12:00:00Z')), /exclusión no confirmada/);
    assert.equal(posts.length, 0, 'Never announce while any protected channel remains visible.');
    assert.equal(roleWrites.length, 1, 'Restart must not repeat a completed role removal.');
    secondChannel.permission_overwrites = secondChannel.permission_overwrites.filter((o) => o.id !== birthdayUser);
    await service.tick(new Date('2026-11-05T12:00:00Z'));
    const cycle = store.cycles(config)[0];
    const announcement = posts[0];
    assert.equal((await adapter.inspect(birthdayUser)).visible, false);
    assert.deepEqual(announcement.allowed_mentions, { parse: ['everyone'], users: [], roles: [] });
    assert.equal(announcement.content.match(/@here/g).length, 1);
    assert.ok(!announcement.embeds[0].title.includes('@everyone'));
    assert.equal(announcement.components[0].components[0].custom_id, `gift:join:${cycle.id}`);
    assert.equal(announcement.enforce_nonce, true);
    assert.equal(await adapter.findAnnouncement(cycle), announcement.id);

    const button = (action, author = participant, message = announcement, giftId = cycle.id) => new ButtonInteraction(client, {
      id: String(300000000000000000n + BigInt(serial++)), application_id: botId, type: 3,
      token: 'offline-interaction', version: 1, guild_id: guildId, channel: structuredClone(channelData), channel_id: channelId,
      entitlements: [], authorizing_integration_owners: {}, locale: 'es-ES', context: 0,
      member: members.get(author), message,
      data: { component_type: 2, custom_id: `gift:${action}:${giftId}` },
    });
    client.emit('interactionCreate', button('join'));
    await setImmediate();
    assert.deepEqual(store.participants(cycle.id), [participant]);
    assert.equal(callbacks[0].data.flags, 64, 'Confirmación privada.');
    assert.match(edits.at(-1).content, /Contamos con vos/);
    client.emit('interactionCreate', button('join'));
    await setImmediate();
    assert.equal(store.participants(cycle.id).length, 1);
    client.emit('interactionCreate', button('leave'));
    await setImmediate();
    assert.equal(store.participants(cycle.id).length, 0);

    await emitMessage(participant, `!regalo reincorporar <@${birthdayUser}>`);
    assert.equal(store.get(cycle.id).state, 'announced');
    assert.match(posts.at(-1).content, /Necesitás/);
    assert.deepEqual(posts.at(-1).allowed_mentions.parse, []);
    // Fresh authorization must reject a manager whose role was removed after caching.
    await guild.members.fetch({ user: manager, force: true });
    members.get(manager).roles = [roleId];
    await emitMessage(manager, `!regalo reincorporar <@${birthdayUser}>`);
    assert.equal(store.get(cycle.id).state, 'announced');
    members.get(manager).roles = [roleId, managerRole];

    // An unrelated override added during isolation survives restoration, including after cache loss.
    channelData.permission_overwrites.push({ id: birthdayUser, type: 1, allow: '0', deny: P.SendMessages.toString() });
    client.users.cache.delete(birthdayUser);
    guild.members.cache.delete(birthdayUser);
    botRoleData.permissions = (botPermissions & ~P.MentionEveryone & ~P.EmbedLinks).toString();
    await emitMessage(manager, `!regalo reincorporar <@${birthdayUser}>`);
    assert.equal(store.get(cycle.id).state, 'restored');
    const restored = channelData.permission_overwrites.find((o) => o.id === birthdayUser);
    assert.equal(BigInt(restored.deny), P.SendMessages);
    assert.deepEqual(roleWrites.slice(0, 2), [{ method: 'DELETE', userId: birthdayUser }, { method: 'PUT', userId: birthdayUser }]);
    assert.equal(cycle.accessRoleId, roleId);
    assert.equal((await adapter.inspect(birthdayUser)).visible, true);
    await assert.rejects(adapter.validate(), /@here/);
    botRoleData.permissions = botPermissions.toString();
    assert.equal(levels.profile(guildId, manager).xp, 0);
    client.emit('interactionCreate', button('join'));
    await setImmediate();
    assert.match(edits.at(-1).content, /cerrada/);

    // Administrator bypass is accepted for manual commands, and scope remains the configured channel.
    await emitMessage(admin, '!regalo estado');
    assert.match(posts.at(-1).content, /No hay regalos/);
    const elsewhere = '100000000000000099';
    client.channels._add({ ...channelData, id: elsewhere }, guild);
    client.emit('messageCreate', incoming(manager, '!regalo estado', elsewhere));
    await setImmediate();
    assert.match(posts.at(-1).content, /no está habilitado en este canal/);

    store.import(guildId, [{ userId: admin, name: 'Admin A', dayMonth: '12/11' }]);
    const publicCount = posts.length;
    await service.tick(new Date('2026-11-05T12:00:00Z'));
    assert.equal(privatePosts.length, 1);
    assert.equal(privatePosts[0].channel_id, dmIds.get(owner), 'Si cumple admin, sólo recibe el dueño contrario.');
    assert.match(privatePosts[0].content, new RegExp(`<@${admin}>`));
    assert.deepEqual(privatePosts[0].allowed_mentions, { parse: [], users: [], roles: [] });
    assert.equal(privatePosts[0].enforce_nonce, true);
    assert.equal(posts.length, publicCount, 'Ningún anuncio público para el cumpleaños administrativo.');
    const notice = store.adminNotice(guildId, admin, '2026-11-12');
    assert.equal(notice.state, 'sent');
    assert.equal(await adapter.findAdminNotice(notice), privatePosts[0].id);
    await service.tick(new Date('2026-11-05T12:01:00Z'));
    assert.equal(privatePosts.length, 1);

    // SDK error 50007 stays private and retries with backoff; never posts an alert in the shared channel.
    store.import(guildId, [{ userId: owner, name: 'Admin B', dayMonth: '12/11' }]);
    blockedDM = true;
    const originalError = console.error;
    const privateErrors = [];
    console.error = (...args) => privateErrors.push(args);
    try { await service.tick(new Date('2026-11-05T12:00:00Z')); }
    finally { console.error = originalError; }
    assert.equal(privateErrors.length, 1);
    assert.equal(store.adminNotice(guildId, owner, '2026-11-12').state, 'pending');
    assert.equal(posts.length, publicCount);
    blockedDM = false;
    await service.tick(new Date('2026-11-05T18:00:00Z'));
    assert.equal(privatePosts.length, 2);
    assert.equal(privatePosts[1].channel_id, dmIds.get(admin), 'Si cumple el dueño, sólo recibe el admin contrario.');
    assert.match(privatePosts[1].content, /WhatsApp/);
    assert.ok(!privatePosts[1].content.includes('Retiren manualmente'));
    const otherNotice = store.adminNotice(guildId, owner, '2026-11-12');
    members.get(admin).roles = [roleId];
    await assert.rejects(adapter.sendAdminNotice(otherNotice), /ya no es un administrador humano/);
    assert.equal(privatePosts.length, 2);
    members.get(admin).roles = [roleId, adminRole];

    // Real SDK: a channel deny is ineffective while Administrator or server ownership remains.
    channelData.permission_overwrites.push({ id: admin, type: 1, allow: '0', deny: P.ViewChannel.toString() });
    channelData.permission_overwrites.push({ id: owner, type: 1, allow: '0', deny: P.ViewChannel.toString() });
    await service.tick(new Date('2026-11-05T18:01:00Z'));
    assert.equal(posts.length, publicCount);
    assert.equal(service.active(admin), undefined);
    assert.equal(service.active(owner), undefined);
    // Human removal of Administrator and the channel role makes access truly disappear.
    members.get(admin).roles = [];
    channelData.permission_overwrites = channelData.permission_overwrites.filter((o) => o.id !== admin);
    const manualPermissions = structuredClone(channelData.permission_overwrites);
    await service.tick(new Date('2026-11-05T18:02:00Z'));
    const manualCycle = service.active(admin);
    assert.equal(manualCycle.exclusionMode, 'manual');
    assert.equal(manualCycle.state, 'announced');
    assert.equal(manualCycle.priorView, 0);
    assert.equal(posts.length, publicCount + 1);
    assert.equal(service.active(owner), undefined, 'Ownership continues to block the owner birthday announcement.');
    assert.deepEqual(channelData.permission_overwrites, manualPermissions, 'Pepe never edits manually managed permissions.');
    assert.equal(privatePosts.length, 2, 'No repeated DMs after the birthday admin is demoted.');
    assert.equal(await adapter.findAdminNotice(notice), privatePosts[0].id, 'Recovery still works when the birthday admin was manually demoted.');
    const manualMessage = posts.at(-1);
    client.emit('interactionCreate', button('join', participant, manualMessage, manualCycle.id));
    await setImmediate();
    assert.deepEqual(store.participants(manualCycle.id), [participant]);
    await emitMessage(manager, `!regalo reincorporar <@${admin}>`);
    assert.match(posts.at(-1).content, /Devuélvanle el acceso/);
    assert.equal(store.get(manualCycle.id).state, 'announced');
    members.get(admin).roles = [roleId, adminRole];
    await emitMessage(manager, `!regalo reincorporar <@${admin}>`);
    assert.match(posts.at(-1).content, /manual confirmada/);
    assert.equal(store.get(manualCycle.id).state, 'restored');
    assert.deepEqual(channelData.permission_overwrites, manualPermissions);
    guildData.owner_id = manager;
    members.get(owner).roles = [];
    const afterClosing = posts.length;
    assert.equal((await adapter.inspect(owner)).visible, false);
    await service.tick(new Date('2026-11-05T18:03:00Z'));
    assert.equal(service.active(owner), undefined, 'Private-only birthday stays private even after ownership and access change.');
    assert.equal(posts.length, afterClosing);
    // Temporary !cumple goes through the gateway and SDK but only replies with a simulation.
    const saved = { permissions: structuredClone(channelData.permission_overwrites),
      cycles: store.cycles(config), notices: db.prepare('SELECT * FROM gift_admin_notices').all(),
      participants: db.prepare('SELECT * FROM gift_participants').all(), privateCount: privatePosts.length };
    await emitMessage(participant, `!cumple <@${birthdayUser}>`);
    assert.match(posts.at(-1).content, /Necesitás Administrador/);
    await emitMessage(manager, '!cumple');
    assert.match(posts.at(-1).content, /Usá !cumple/);
    await emitMessage(manager, `!cumple <@${birthdayUser}>`);
    assert.match(posts.at(-1).content, /PRUEBA · sin cambios reales/);
    assert.ok(!posts.at(-1).content.includes('@everyone'));
    assert.deepEqual(posts.at(-1).allowed_mentions, { parse: [], replied_user: false });
    assert.deepEqual(channelData.permission_overwrites, saved.permissions);
    assert.deepEqual(store.cycles(config), saved.cycles);
    assert.deepEqual(db.prepare('SELECT * FROM gift_admin_notices').all(), saved.notices);
    assert.deepEqual(db.prepare('SELECT * FROM gift_participants').all(), saved.participants);
    assert.equal(privatePosts.length, saved.privateCount);
    const originalBirthday = store.birthdays(guildId).find((b) => b.userId === birthdayUser);
    store.import(guildId, [{ ...originalBirthday, category: 'no-gift' }]);
    await emitMessage(manager, `!cumple <@${birthdayUser}>`);
    assert.match(posts.at(-1).content, /no-gift/);
    assert.ok(!posts.at(-1).content.includes('Convocatoria simulada'));
    assert.equal(privatePosts.length, saved.privateCount);
    assert.deepEqual(channelData.permission_overwrites, saved.permissions);
    store.import(guildId, [{ ...originalBirthday, category: 'gift' }]);
    const managerRoles = members.get(manager).roles;
    // Test permission checks fetch current roles, not the invoking message's old snapshot.
    guildData.owner_id = owner;
    members.get(manager).roles = [roleId];
    await emitMessage(manager, `!cumple <@${birthdayUser}>`);
    assert.match(posts.at(-1).content, /Necesitás Administrador/);
    members.get(manager).roles = managerRoles;
    await bot.stop();
    assert.equal(client.token, null);
    return { config, cycleId: cycle.id, adminId: admin, manualCycleId: manualCycle.id };
  } finally { await bot.stop(); }
}
