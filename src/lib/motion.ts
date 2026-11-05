/** Shared motion tokens: one easing curve, no springs, no bounce. */
export const EASE = [0.16, 1, 0.3, 1] as const;

export const t = {
  fast: { duration: 0.2, ease: EASE },
  base: { duration: 0.4, ease: EASE },
  slow: { duration: 0.6, ease: EASE },
};

/** Fade-and-rise entrance used for sections and list rows. */
export const rise = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};
