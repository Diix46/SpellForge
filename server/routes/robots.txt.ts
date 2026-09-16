import { robotsTxt, siteOrigin } from '../utils/sitemap'

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return robotsTxt(siteOrigin(useRuntimeConfig(event).public.siteUrl, getRequestURL(event).origin))
})
