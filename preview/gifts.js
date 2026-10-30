const $ = (id) => document.getElementById(id);
let state;
let busy = false;
const roleName = { member: 'Miembro', admin: 'Admin · exclusión manual', 'dm-only': 'Sólo privado' };
function option(member) {
  const el = document.createElement('option');
  el.value = member.userId;
  el.textContent = `${member.name} · ${member.dayMonth} · ${member.category === 'no-gift' ? 'no-gift · ignorado' : roleName[member.role]}`;
  return el;
}
function fill(select, members) {
  const previous = select.value;
  select.replaceChildren();
  for (const category of ['gift', 'no-gift']) {
    const group = members.filter((m) => (m.category ?? 'gift') === category);
    if (!group.length) continue;
    const el = document.createElement('optgroup');
    el.label = category === 'gift' ? 'gift · con regalo' : 'no-gift · cumpleaños ignorados';
    el.append(...group.map(option)); select.append(el);
  }
  if (members.some((m) => m.userId === previous)) select.value = previous;
}
function messages(container, events, empty) {
  container.replaceChildren();
  if (!events.length) {
    const el = document.createElement('div'); el.className = 'empty-state'; el.textContent = empty;
    container.append(el); return;
  }
  for (const event of events) {
    const el = document.createElement('div'); el.className = 'gift-message';
    const title = document.createElement('strong');
    const recipient = state.members.find((m) => m.userId === event.recipientId);
    title.textContent = event.kind === 'dm' ? `Pepe → ${recipient?.name ?? 'otro admin'} · DM simulado` : 'Pepe · APP · mensaje simulado';
    el.append(title, document.createTextNode(event.text)); container.append(el);
  }
}
function render() {
  const target = state.members.find((m) => m.userId === state.targetId);
  const cycle = state.cycle;
  const closed = cycle?.state === 'restored';
  const announced = !!cycle?.messageId;
  const ignored = target?.category === 'no-gift';
  const privateOnly = !ignored && target?.role === 'dm-only';
  const waitingAdmin = !ignored && target?.role === 'admin' && !cycle;
  $('scenario-title').textContent = target ? `El regalo de ${target.name}` : 'Prepará el primer regalo';
  $('scenario-description').textContent = !target ? 'Empezá con un miembro; después probá los dos casos administrativos.'
    : ignored ? 'Categoría no-gift. Sus datos se conservan, pero Pepe ignora su cumpleaños y no inicia ninguna organización.'
    : privateOnly ? 'Privado al otro administrador. La organización continúa por WhatsApp, de forma manual.'
    : waitingAdmin ? 'El privado ya llegó al otro admin. La convocatoria espera hasta que el cumpleañero pierda todo acceso.'
    : closed ? 'Acceso devuelto y organización cerrada. Las adhesiones quedan guardadas.'
    : 'El canal quedó oculto para el cumpleañero. El resto puede organizarse y confirmar su participación.';
  $('simulated-date').textContent = target ? new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeZone: state.timeZone }).format(new Date(state.now)) : '—';
  $('birthday-date').textContent = target ? `Cumple: ${target.dayMonth} · 7 días después` : `Zona: ${state.timeZone}`;
  const steps = ignored ? [['01 · Fecha detectada', true], ['02 · no-gift: ignorado', true], ['03 · Sin aislamiento', false], ['04 · Sin avisos', false]]
    : privateOnly ? [['01 · Fecha detectada', !!target], ['02 · DM al otro admin', state.events.some((e) => e.kind === 'dm')], ['03 · Coordinar por WhatsApp', false], ['04 · Sin convocatoria', false]]
    : [['01 · Fecha detectada', !!target], ['02 · Canal oculto', !!cycle], ['03 · Convocatoria + checks', announced], ['04 · Reincorporación', closed]];
  $('steps').replaceChildren(...steps.map(([label, done]) => {
    const el = document.createElement('li'); el.textContent = label; el.classList.toggle('done', done); return el;
  }));
  messages($('channel-messages'), state.events.filter((e) => e.kind === 'channel'), !target ? '🎁\nAcá va a aparecer la convocatoria.'
    : ignored ? 'no-gift\nNo se oculta el canal ni se organiza un regalo.'
    : privateOnly ? '🔒 No se publica nada sobre este cumpleaños.\nLa coordinación sigue fuera de Discord.'
    : waitingAdmin ? '🔒 Sorpresa protegida.\nEsperando exclusión manual del administrador.' : 'Sin convocatoria.');
  messages($('private-messages'), state.events.filter((e) => e.kind === 'dm'), ignored ? 'No se envían privados por este cumpleaños.' : target?.role === 'member' ? 'Este miembro no es administrador.\nNo hace falta enviar un privado.' : '✉\nLos avisos de admins aparecen acá.');
  $('participation').hidden = !announced || closed;
  fill($('participant'), state.members.filter((m) => m.userId !== state.targetId && !m.hidden));
  $('manual-hide').hidden = !waitingAdmin;
  $('manual-restore').hidden = target?.role !== 'admin' || !cycle || closed || !target.hidden;
  $('restore').hidden = !cycle || closed;
  $('restart').disabled = !target || busy; $('tick').disabled = !target || busy;
  $('next-title').textContent = ignored ? 'Cumpleaños excluido: no-gift' : privateOnly ? 'Pepe termina con el privado' : waitingAdmin ? 'Paso humano: retirar acceso y Administrador' : closed ? 'Prueba completada' : announced ? 'Probá los checks y la reincorporación' : 'Listo para probar';
  $('next-description').textContent = ignored ? 'Revisar o reiniciar no inicia el flujo. Podés elegir otra persona para probar un regalo.' : privateOnly ? 'No se modifica la cuenta excluida de la coordinación en Discord ni se contacta WhatsApp desde el bot.'
    : waitingAdmin ? 'El botón simula lo que hace una persona. Pepe comprueba después que el admin ya no puede ver el canal.'
    : closed ? 'Reiniciá o revisá otra vez: este cumpleaños no vuelve a convocarse. Iniciar prueba limpia el escenario.'
    : announced ? 'Cambiar de participante permite sumar o retirar adhesiones. Reiniciar conserva el estado y evita duplicados.'
    : 'Cada inicio prepara un escenario nuevo; podés repetirlo cuantas veces quieras.';
  $('audit').replaceChildren(...state.events.filter((e) => e.kind === 'system').map((event) => {
    const el = document.createElement('li'); el.textContent = event.text; return el;
  }));
  const attendees = cycle?.participants ?? [];
  $('count').textContent = String(attendees.length);
  $('attendees').textContent = attendees.length ? attendees.map((id) => state.members.find((m) => m.userId === id)?.name ?? id).join(' · ') : announced ? 'Nadie confirmó todavía.' : 'Todavía no hay una convocatoria.';
}
async function request(path, data) {
  if (busy) return;
  busy = true; $('gift-error').textContent = '';
  document.querySelectorAll('button, select, input').forEach((el) => { el.disabled = true; });
  try {
    const response = await fetch(path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo ejecutar la prueba.');
    state = result;
  } catch (error) { $('gift-error').textContent = error.message; }
  finally {
    busy = false;
    document.querySelectorAll('button, select, input').forEach((el) => { el.disabled = false; });
    if (state) render();
  }
}
$('start').addEventListener('click', () => request('/api/gifts/start', { userId: $('birthday-person').value }));
for (const action of ['tick', 'restart', 'join', 'leave', 'restore', 'manual-hide', 'manual-restore']) {
  $(action).addEventListener('click', () => request('/api/gifts/action', { action, userId: $('participant').value }));
}
$('gift-command').addEventListener('submit', (event) => {
  event.preventDefault();
  const match = /^!cumple\s+(?:<@!?(\d+)>|@?([\w.]+))$/i.exec($('command').value.trim());
  const query = match?.[1] ?? match?.[2];
  const member = query && state.members.find((m) => m.userId === query || m.username.toLowerCase() === query.toLowerCase());
  if (!member) { $('gift-error').textContent = 'Usá !cumple @username o !cumple ID de una persona del selector.'; return; }
  $('birthday-person').value = member.userId;
  void request('/api/gifts/start', { userId: member.userId });
});
void request('/api/gifts').then(() => {
  if (!state) return;
  fill($('birthday-person'), state.members);
  $('source').textContent = `${state.members.length} personas · ${state.privateRoster ? 'padrón privado, sólo cumpleaños' : 'identidades ficticias'}`;
  $('command').placeholder = `!cumple @${state.members[0]?.username ?? 'persona'}`;
});
