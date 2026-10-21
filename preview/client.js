const chat = document.getElementById('chat');
const persona = document.getElementById('persona');
const input = document.getElementById('message');
const error = document.getElementById('error');
let state;
let busy = false;
const groupNames = { social: 'GIFs del grupo', progress: 'Participación', info: 'Ayuda' };

async function api(path, payload) {
  const response = await fetch(
    path,
    payload === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la prueba.');
  return data;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function memberName(id) {
  return state?.members.find((m) => m.id === id)?.displayName || `usuario ${id}`;
}
function richText(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /<@!?(\d+)>|<t:(\d+):([RD])>|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(start, match.index)));
    if (match[1]) fragment.append(element('span', 'mention', '@' + memberName(match[1])));
    else if (match[2]) {
      const date = new Date(Number(match[2]) * 1000);
      const value =
        match[3] === 'R'
          ? `en ${Math.max(1, Math.ceil((date - new Date(state.now)) / 3600000))} h`
          : date.toLocaleDateString('es-UY', { year: 'numeric', month: 'short', day: 'numeric' });
      fragment.append(document.createTextNode(value));
    } else if (match[4]) fragment.append(element('strong', '', match[4]));
    else fragment.append(element('code', '', match[5]));
    start = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(start)));
  return fragment;
}
function appendMessage(author, content, embeds = [], bot = false) {
  const row = element('article', 'message');
  const avatar = element('div', 'avatar' + (bot ? ' bot' : ''), bot ? '🧉' : author.displayName[0]);
  if (!bot && author.avatarUrl) {
    const image = element('img');
    image.src = author.avatarUrl;
    image.alt = '';
    avatar.replaceChildren(image);
  }
  const body = element('div');
  const head = element('div', 'message-head');
  head.append(element('span', 'author', author.displayName));
  if (bot) head.append(element('span', 'bot-tag', 'APP'));
  head.append(
    element(
      'span',
      'timestamp',
      new Date(state.now).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
    ),
  );
  body.append(head);
  if (content) {
    const text = element('div', 'message-content');
    text.append(richText(content));
    body.append(text);
  }
  for (const embed of embeds) {
    const card = element('div', 'embed');
    if (embed.thumbnail) {
      const image = element('img', 'embed-thumbnail');
      image.src = embed.thumbnail.url;
      image.alt = '';
      card.append(image);
    }
    if (embed.title) card.append(element('div', 'embed-title', embed.title));
    if (embed.description) {
      const description = element('div', 'message-content');
      description.append(richText(embed.description));
      card.append(description);
    }
    if (embed.fields) {
      const fields = element('div', 'embed-fields');
      for (const field of embed.fields) {
        const node = element('div', 'embed-field');
        node.append(element('div', 'field-name', field.name));
        const value = element('div', 'field-value');
        value.append(richText(field.value));
        node.append(value);
        fields.append(node);
      }
      card.append(fields);
    }
    if (embed.image) {
      const image = element('img', 'embed-image');
      image.src = embed.image.url;
      image.alt = embed.title || 'GIF de respuesta';
      card.append(image);
    }
    if (embed.footer) card.append(element('div', 'embed-footer', embed.footer.text));
    body.append(card);
  }
  row.append(avatar, body);
  chat.append(row);
}
function renderState(next) {
  state = next;
  document.getElementById('clock').textContent = new Date(state.now).toLocaleString('es-UY', {
    timeZone: 'America/Montevideo',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const members = document.getElementById('members');
  members.replaceChildren();
  for (const member of state.members) {
    const row = element('div', 'member');
    row.append(element('div', 'avatar', member.displayName[0]));
    const info = element('div');
    info.append(
      element('div', 'member-name', member.displayName),
      element('div', 'member-level', `Nivel ${member.level} · ${member.xp} XP`),
    );
    const track = element('div', 'xp-track');
    const fill = element('div', 'xp-fill');
    fill.style.width = `${(member.current / member.needed) * 100}%`;
    track.append(fill);
    info.append(track);
    info.append(
      element(
        'div',
        'member-stats',
        `${member.current} / ${member.needed} XP para el próximo nivel`,
      ),
    );
    row.append(info);
    members.append(row);
  }
}
async function send(content) {
  if (busy || !content.trim()) return;
  busy = true;
  error.textContent = '';
  document.getElementById('send').disabled = true;
  try {
    for (const member of state.members)
      content = content.replaceAll('@' + member.displayName, `<@${member.id}>`);
    const result = await api('/api/message', { userId: persona.value, content });
    renderState(result.state);
    appendMessage(result.actor, result.content);
    for (const reply of result.replies)
      appendMessage({ displayName: 'Bot del grupo' }, reply.content, reply.embeds, true);
    input.value = '';
  } catch (cause) {
    error.textContent = cause.message;
  } finally {
    busy = false;
    document.getElementById('send').disabled = false;
  }
}
async function advance(minutes) {
  if (busy) return;
  busy = true;
  try {
    renderState(await api('/api/advance', { minutes }));
    chat.append(element('div', 'system', 'Pasó un minuto en la demo'));
  } catch (cause) {
    error.textContent = cause.message;
  } finally {
    busy = false;
  }
}
document.getElementById('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  void send(input.value);
});
document
  .querySelectorAll('[data-command]')
  .forEach((button) => button.addEventListener('click', () => send(button.dataset.command)));
document.getElementById('minute').addEventListener('click', () => advance(1));
(async () => {
  renderState(await api('/api/state'));
  for (const member of state.members) {
    const option = element('option', '', member.displayName + ' · miembro');
    option.value = member.id;
    persona.append(option);
  }
  const catalog = document.getElementById('catalog');
  for (const [category, label] of Object.entries(groupNames)) {
    catalog.append(element('div', 'group', label));
    for (const command of state.commands.filter((c) => c.category === category)) {
      const button = element('button', '', command.name);
      button.type = 'button';
      button.title = command.description;
      button.addEventListener('click', () => {
        input.value = command.name;
        input.focus();
      });
      catalog.append(button);
    }
  }
  await send('desayuno?');
  await send('nivel');
})().catch((cause) => {
  error.textContent = cause.message;
});
