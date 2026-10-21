export interface Reaction {
  readonly text: string;
  readonly gif: string;
}

// URLs directas: Discord muestra el GIF en un embed sin descargarlo en el bot.
export const reactions = {
  grupo: [
    {
      text: '¡Grupo comando presente, {user}! ¿Cuál es la misión?',
      gif: 'https://media.giphy.com/media/ydgt7lD5ruT3OLw0Mv/giphy.gif',
    },
    {
      text: 'Se activó el grupo comando, {user}. Traé el mate.',
      gif: 'https://media.giphy.com/media/dzaUX7CAG0Ihi/giphy.gif',
    },
  ],
  desayuno: [
    {
      text: 'Uy, llegaste tarde paps, {user}. No quedó ni una medialuna.',
      gif: 'https://media.giphy.com/media/3oriO04qxVReM5rJEA/giphy.gif',
    },
    {
      text: 'Sale desayuno, {user}. Vos ponés el café y yo el hambre.',
      gif: 'https://media.giphy.com/media/3oriO04qxVReM5rJEA/giphy.gif',
    },
    {
      text: 'Buen día, {user}. ¿Sale desayuno? 🧉',
      gif: 'https://media.giphy.com/media/3oriO04qxVReM5rJEA/giphy.gif',
    },
    {
      text: 'Apurate, {user}, que te duermen la comida 😏',
      gif: 'https://media.giphy.com/media/0r3RvW5jN4WobV816C/giphy.gif',
    },
  ],
  almuerzo: [
    {
      text: '¿Almuerzo, {user}? Sale una milanesa con fritas.',
      gif: 'https://media.giphy.com/media/0r3RvW5jN4WobV816C/giphy.gif',
    },
    {
      text: 'Llegaste justo, {user}. Servite antes de que desaparezca todo.',
      gif: 'https://media.giphy.com/media/0r3RvW5jN4WobV816C/giphy.gif',
    },
  ],
  cena: [
    {
      text: 'Sale pizza para la cena, {user}. ¿Quién pide?',
      gif: 'https://media.giphy.com/media/9fuvOqZ8tbZOU/giphy.gif',
    },
    {
      text: 'Uy, {user}, ya levantamos la mesa. Queda el delivery.',
      gif: 'https://media.giphy.com/media/9fuvOqZ8tbZOU/giphy.gif',
    },
  ],
} as const satisfies Record<string, readonly [Reaction, ...Reaction[]]>;
