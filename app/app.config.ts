export default defineAppConfig({
  ui: {
    // Neutral, monochrome base. Themed/accent elements are driven by the
    // dynamic --accent-* CSS vars (per-deck mana identity), not Nuxt UI colors.
    colors: {
      primary: 'ink',
      secondary: 'ink',
      neutral: 'ink',
      // Dedicated cyan scale (matches the design system's --color-info token) so
      // info-colored alerts/toasts are visually distinguishable from plain neutral UI.
      info: 'cyan',
      success: 'green',
      warning: 'amber',
      error: 'red',
    },
  },
})
