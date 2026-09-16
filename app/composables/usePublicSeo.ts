import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

interface PublicSeo {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  /** Absolute or site-relative image for link previews. */
  image?: MaybeRefOrGetter<string | null | undefined>
  /** 'website' by default. */
  type?: 'website' | 'article'
  /** Keep a page out of search results (a missing card, a dead link). */
  noindex?: MaybeRefOrGetter<boolean>
}

/**
 * Head tags of a server-rendered public page: title, description, canonical
 * link, one alternate per language (the page takes `?lang=`), and the Open
 * Graph and Twitter cards. The site address comes from NUXT_PUBLIC_SITE_URL,
 * or from the request.
 */
export function usePublicSeo(seo: PublicSeo) {
  const route = useRoute()
  const { locale } = useLocale()
  const configured = useRuntimeConfig().public.siteUrl as string
  const origin = (configured || useRequestURL().origin).replace(/\/$/, '')

  const pageUrl = (lang?: string) => `${origin}${route.path}${lang ? `?lang=${lang}` : ''}`
  const canonical = computed(() => pageUrl(locale.value === 'en' ? 'en' : undefined))
  const image = computed(() => {
    const src = toValue(seo.image)
    return src ? new URL(src, `${origin}/`).href : undefined
  })

  useSeoMeta({
    title: () => toValue(seo.title),
    description: () => toValue(seo.description),
    ogTitle: () => toValue(seo.title),
    ogDescription: () => toValue(seo.description),
    ogType: seo.type ?? 'website',
    ogUrl: () => canonical.value,
    ogImage: () => image.value,
    ogLocale: () => (locale.value === 'fr' ? 'fr_FR' : 'en_US'),
    twitterCard: () => (image.value ? 'summary_large_image' : 'summary'),
    robots: () => (toValue(seo.noindex) ? 'noindex' : 'index, follow'),
  })
  useHead({
    link: () => [
      { rel: 'canonical', href: canonical.value },
      { rel: 'alternate', hreflang: 'fr', href: pageUrl('fr') },
      { rel: 'alternate', hreflang: 'en', href: pageUrl('en') },
      { rel: 'alternate', hreflang: 'x-default', href: pageUrl() },
    ],
  })
}
