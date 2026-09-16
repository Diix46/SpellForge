import { describe, expect, it } from 'vitest'
import { robotsTxt, SITEMAP_MAX_URLS, sitemapIndex, siteOrigin, urlset } from '../server/utils/sitemap'

describe('sitemap', () => {
  it('prefers the configured address and drops trailing slashes', () => {
    expect(siteOrigin('https://prism.example/', 'http://10.0.0.2:3000')).toBe('https://prism.example')
    expect(siteOrigin('', 'http://10.0.0.2:3000')).toBe('http://10.0.0.2:3000')
  })

  it('writes escaped absolute addresses with their date', () => {
    const xml = urlset('https://p.example', [
      { path: '/magic/card/Hans%20Eriksson' },
      { path: '/x?a=1&b=2', lastmod: new Date('2026-09-16T12:00:00Z') },
    ])
    expect(xml).toContain('<loc>https://p.example/magic/card/Hans%20Eriksson</loc>')
    expect(xml).toContain('<loc>https://p.example/x?a=1&amp;b=2</loc><lastmod>2026-09-16</lastmod>')
    expect(xml.startsWith('<?xml')).toBe(true)
  })

  it('refuses more addresses than a sitemap may hold', () => {
    const many = Array.from({ length: SITEMAP_MAX_URLS + 1 }, (_, i) => ({ path: `/${i}` }))
    expect(() => urlset('https://p.example', many)).toThrow(/at most/)
  })

  it('indexes the game sitemaps and points robots at it', () => {
    expect(sitemapIndex('https://p.example', ['/sitemaps/magic.xml'])).toContain('<sitemap><loc>https://p.example/sitemaps/magic.xml</loc></sitemap>')
    const robots = robotsTxt('https://p.example')
    expect(robots).toContain('Disallow: /api/')
    expect(robots).toContain('Disallow: /one-piece/deck/')
    expect(robots).toContain('Sitemap: https://p.example/sitemap.xml')
  })
})
