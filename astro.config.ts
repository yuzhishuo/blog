import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import sitemap from '@astrojs/sitemap'
import AstroPureIntegration from 'astro-pure'
import { defineConfig, fontProviders, svgoOptimizer } from 'astro/config'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

// Local integrations
import rehypeAutolinkHeadings from './src/plugins/rehype-auto-link-headings.ts'
// Shiki
import {
  addCollapse,
  addCopyButton,
  addLanguage,
  addTitle,
  updateStyle
} from './src/plugins/shiki-custom-transformers.ts'
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerRemoveNotationEscape
} from './src/plugins/shiki-official/transformers.ts'
import config from './src/site.config.ts'

// https://astro.build/config
// GitHub Pages: static output (user site https://yuzhishuo.github.io)
// If deploying to a project site (username.github.io/repo), set base: '/repo/'
// Note: Theme Pure docs discourage base path — prefer user/org Pages root.
export default defineConfig({
  site: 'https://yuzhishuo.github.io',
  // base: '/pure-blog/',
  trailingSlash: 'never',
  server: { host: true },
  prefetch: {
    defaultStrategy: 'viewport'
  },

  // Static site for GitHub Pages (no Vercel adapter)
  output: 'static',

  image: {
    responsiveStyles: true,
    service: { entrypoint: 'astro/assets/services/sharp' },
    domains: ['ghchart.rshah.org'],
    remotePatterns: [
      { protocol: 'https' },
      { protocol: 'https', hostname: 'ghchart.rshah.org' }
    ]
  },
  fonts: [
    {
      provider: fontProviders.fontshare(),
      name: 'Satoshi',
      cssVariable: '--font-satoshi',
      styles: ['normal', 'italic'],
      weights: [400, 500],
      subsets: ['latin']
    }
  ],

  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [
      [rehypeKatex, {}],
      rehypeHeadingIds,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { className: ['anchor'] },
          content: { type: 'text', value: '#' }
        }
      ]
    ],
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark'
      },
      transformers: [
        // @ts-ignore multiple shiki type versions
        transformerNotationDiff(),
        // @ts-ignore
        transformerNotationHighlight(),
        // @ts-ignore
        transformerRemoveNotationEscape(),
        // @ts-ignore
        updateStyle(),
        // @ts-ignore
        addTitle(),
        // @ts-ignore
        addLanguage(),
        // @ts-ignore
        addCopyButton(2000),
        // @ts-ignore
        addCollapse(15)
      ]
    }
  },

  integrations: [
    // Provide sitemap ourselves so Pure skips its default, and exclude /resume
    sitemap({
      filter: (page) => !page.includes('/resume')
    }),
    AstroPureIntegration(config)
  ],

  experimental: {
    contentIntellisense: true,
    svgOptimizer: svgoOptimizer(),
    clientPrerender: true,
    queuedRendering: {
      enabled: true
    }
  }
})
