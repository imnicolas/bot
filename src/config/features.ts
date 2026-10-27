export interface Features {
  readonly social: boolean;
  readonly meals: boolean;
  readonly levels: boolean;
}

export const defaultFeatures: Features = { social: true, meals: true, levels: false };

export function loadFeatures(env: NodeJS.ProcessEnv): Features {
  const flag = (name: string, fallback: boolean): boolean => {
    const value = env[name]?.trim().toLowerCase();
    if (value === undefined) return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${name} debe ser true o false.`);
  };
  return {
    social: flag('FEATURE_SOCIAL_ENABLED', defaultFeatures.social),
    meals: flag('FEATURE_MEALS_ENABLED', defaultFeatures.meals),
    levels: flag('FEATURE_LEVELS_ENABLED', defaultFeatures.levels),
  };
}
