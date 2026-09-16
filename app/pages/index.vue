<script setup lang="ts">
// The home page: the same landing for everyone, rendered by the server. The
// workshop itself lives at /decks.
const { t } = useLocale()

usePublicSeo({
  title: () => t('brand.title'),
  description: () => t('brand.description'),
})
</script>

<template>
  <LandingPage />
</template>
