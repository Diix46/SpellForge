<script setup lang="ts">
// Always shows the marketing landing (CinematicHero + features/steps), regardless
// of auth or local-deck state. "/" is smart-routed (guest/member → dashboard,
// true first-time visitor → landing — see index.vue) so a signed-in user or a
// guest with decks never lands here by accident; this route exists purely so
// the landing page can still be revisited/demoed on purpose.
const { t } = useLocale()

useSeoMeta({
  title: 'Spellforge — Deck manager & proxy printer',
  description: () => t('landing.subtitle'),
})
</script>

<template>
  <LandingPage />
</template>
