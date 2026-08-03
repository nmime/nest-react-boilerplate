/**
 * Narrow, reviewed axe exceptions for stories whose violation comes from a
 * dependency's DOM rather than this design system. Every exception must name the
 * rule, the reason, and why the behaviour is still accessible in practice.
 */

/**
 * Radix builds its modal boundary with `aria-hidden` on the siblings of an open
 * portal layer (`hideOthers` from the `aria-hidden` package) without also
 * marking them `inert`, so axe's `aria-hidden-focus` sees focusable content
 * inside an `aria-hidden` subtree. Radix's own `FocusScope` traps focus inside
 * the layer, so the hidden content is genuinely unreachable — the DOM just
 * cannot prove it to axe. Apply only to stories that assert an *opened* portal
 * layer; the closed states must keep the rule on.
 */
export const radixModalLayerA11y = {
  a11y: {
    config: {
      rules: [{ enabled: false, id: 'aria-hidden-focus' }],
    },
  },
} as const;
