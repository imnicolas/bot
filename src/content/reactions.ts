import { probotAssetBase } from './probot.js';

export interface Reaction {
  readonly text: string;
  readonly gif: string;
}

type ReactionVariants = readonly [Reaction, ...Reaction[]];
export interface MealReactions {
  readonly win: ReactionVariants;
  readonly lose: ReactionVariants;
}

// Originales de ProBot: docs/probot-reaction-sources.json conserva fuentes y hashes.
// El resultado 1/3 se sortea antes de elegir una variante; agregar frases no cambia las chances.
export const reactions = {
  grupo: [{
    text: '¡Grupo comando presente, {user}! ¿Cuál es la misión?',
    gif: probotAssetBase + 'ahj0Fx.gif',
  }],
  desayuno: {
    win: [{
      text: 'Ligaste desayuno, {user}. Kero dejó de comer dos segundos y te guardó algo. 🥐',
      gif: probotAssetBase + 'animesher.com_sakura-card-captor-kero-1228813.gif',
    }],
    lose: [{
      text: 'No puede ser, {user}. Te volvieron a robar',
      gif: probotAssetBase + 'tumblr_934345c79e0a95d977e8ad2574a5527a_51bcac4f_400.gif',
    }],
  },
  almuerzo: {
    win: [{
      text: '{user} es tu día de suerte! Sanji te guardó <3',
      gif: probotAssetBase + 'sanji-sanji-vin-smoke.gif',
    }],
    lose: [{
      text: 'Fuiste {user}, te la robó Luffy 🙁',
      gif: probotAssetBase + 'tumblr_88ea4ba0d6546130a18d7077b2a0c2c6_02943bb8_540.gif',
    }],
  },
  cena: {
    win: [{
      text: 'Hoy cenás como protagonista de anime, {user}. El asado zafó de Luffy. 🥩',
      gif: probotAssetBase + 'contrafile-grill-com.jpg',
    }],
    lose: [{
      text: 'Fuiste, {user}. Sasha se comió tu cena antes de que terminara el opening. 🙁',
      gif: probotAssetBase + 'sasha-cena.gif',
    }],
  },
} as const satisfies { grupo: ReactionVariants } & Record<'desayuno' | 'almuerzo' | 'cena', MealReactions>;

export const reactionAssetFiles = [...new Set([
  ...reactions.grupo,
  ...reactions.desayuno.win, ...reactions.desayuno.lose,
  ...reactions.almuerzo.win, ...reactions.almuerzo.lose,
  ...reactions.cena.win, ...reactions.cena.lose,
].map(({ gif }) => gif.slice(probotAssetBase.length)))];
