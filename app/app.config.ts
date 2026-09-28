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
    // Three control heights across the app: 32px (xs to md: toolbars, rows,
    // the header), 40px (lg: a page's main actions) and 48px (xl: the hero).
    // An icon-only button is as wide as it is tall; a link stays inline.
    button: {
      variants: {
        size: {
          xs: { base: 'h-8' },
          sm: { base: 'h-8' },
          md: { base: 'h-8' },
          lg: { base: 'h-10' },
          xl: { base: 'h-12' },
        },
      },
      compoundVariants: [
        { size: ['xs', 'sm', 'md'], square: true, class: 'w-8 p-0 justify-center' },
        { size: 'lg', square: true, class: 'w-10 p-0 justify-center' },
        { size: 'xl', square: true, class: 'w-12 p-0 justify-center' },
        { variant: 'link', class: 'h-auto' },
      ],
    },
  },
})
