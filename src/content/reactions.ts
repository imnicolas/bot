export interface Reaction {
  readonly text: string;
  readonly gif: string;
}

type ReactionVariants = readonly [Reaction, ...Reaction[]];
export interface MealReactions {
  readonly win: ReactionVariants;
  readonly lose: ReactionVariants;
}

// URLs directas: Discord muestra el GIF en un embed sin descargarlo en el bot.
// Los catálogos de premio y rechazo no deciden la probabilidad del sorteo.
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
  desayuno: {
    win: [
      {
        text: 'Te tocó, {user}: café y medialunas para arrancar el día. ☕',
        gif: 'https://media.giphy.com/media/XqwwAKkqXDR0EQ0BHJ/giphy.gif',
      },
      {
        text: 'Ganaste, {user}. ¡Desayuno servido, a darle! 🥞',
        gif: 'https://media.giphy.com/media/Lk4ESQ9fL1vy/giphy.gif',
      },
    ],
    lose: [
      {
        text: 'Uy, llegaste tarde paps, {user}. No quedó ni una medialuna.',
        gif: 'https://media.giphy.com/media/j2pOFyuTJqWj9S5qdE/giphy.gif',
      },
      {
        text: 'Hoy no hubo suerte, {user}. Pepe se bajó el último desayuno. 😔',
        gif: 'https://media.giphy.com/media/8UGoOaR1lA1uaAN892/giphy.gif',
      },
    ],
  },
  almuerzo: {
    win: [
      {
        text: '¡Te tocó el almuerzo, {user}! Sale un sánguche bien cargado. 🥪',
        gif: 'https://media.giphy.com/media/TQt1xVuNhc9hK/giphy.gif',
      },
      {
        text: 'Hoy comés como un campeón, {user}. ¡Ganaste el almuerzo!',
        gif: 'https://media.giphy.com/media/44FvjefygrRTO/giphy.gif',
      },
    ],
    lose: [
      {
        text: 'Sin almuerzo esta vuelta, {user}. La cocina te dijo que no. 🚫',
        gif: 'https://media.giphy.com/media/j2pOFyuTJqWj9S5qdE/giphy.gif',
      },
      {
        text: 'F, {user}. Se llevaron el último plato y te quedaste sin almuerzo. 😔',
        gif: 'https://media.giphy.com/media/8UGoOaR1lA1uaAN892/giphy.gif',
      },
    ],
  },
  cena: {
    win: [
      {
        text: 'Ganaste la cena, {user}. ¡Esa pizza es toda tuya! 🍕',
        gif: 'https://media.giphy.com/media/bguSbMBFt3JHa/giphy.gif',
      },
      {
        text: 'Hoy ligaste, {user}: Pepe te guardó la última porción para cenar. 🍕',
        gif: 'https://media.giphy.com/media/mZWAgG8U4sXzW/giphy.gif',
      },
    ],
    lose: [
      {
        text: 'Uy, {user}, ya cerramos la cocina. Esta vez te quedaste sin cena.',
        gif: 'https://media.giphy.com/media/j2pOFyuTJqWj9S5qdE/giphy.gif',
      },
      {
        text: 'No hubo suerte, {user}. De la cena quedó solamente la caja vacía. 😔',
        gif: 'https://media.giphy.com/media/8UGoOaR1lA1uaAN892/giphy.gif',
      },
    ],
  },
} as const satisfies { grupo: ReactionVariants } & Record<
  'desayuno' | 'almuerzo' | 'cena',
  MealReactions
>;
