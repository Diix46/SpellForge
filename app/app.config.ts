export default defineAppConfig({
  ui: {
    // Neutral, monochrome base. Themed/accent elements are driven by the
    // dynamic --accent-* CSS vars (per-deck mana identity), not Nuxt UI colors.
    colors: {
      primary: 'ink',
      secondary: 'ink',
      neutral: 'ink',
      info: 'ink',
      success: 'green',
      warning: 'amber',
      error: 'red',
    },
  },
})
