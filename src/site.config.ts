import type { CardListData, Config, IntegrationUserConfig, ThemeUserConfig } from 'astro-pure/types'

export const theme: ThemeUserConfig = {
  // [Basic]
  title: '博客',
  author: 'Yi min Liu',
  description: 'Engineering notes · Linux · tools',
  favicon: '/favicon/favicon.ico',
  socialCard: '/images/social-card.png',
  locale: {
    lang: 'zh-CN',
    attrs: 'zh_CN',
    dateLocale: 'zh-CN',
    dateOptions: {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }
  },
  logo: {
    src: '/src/assets/avatar.png',
    alt: 'Avatar'
  },

  titleDelimiter: '•',
  prerender: true,
  npmCDN: 'https://cdn.jsdelivr.net/npm',

  head: [],
  customCss: [],

  header: {
    menu: [
      { title: '博客', link: '/blog' },
      { title: '项目', link: '/projects' },
      { title: '友链', link: '/links' },
      { title: '关于', link: '/about' },
      { title: '订阅', link: '/rss.xml' }
    ]
  },

  footer: {
    year: `© ${new Date().getFullYear()}`,
    links: [
      {
        title: '站点政策',
        link: '/terms',
        pos: 2
      }
    ],
    credits: true,
    social: [
      { icon: 'github', label: 'GitHub', href: 'https://github.com/yuzhishuo' },
      { icon: 'rss', label: 'RSS 订阅', href: '/rss.xml' }
    ]
  },

  content: {
    externalLinks: {
      content: ' ↗',
      properties: { style: 'user-select:none' }
    },
    blogPageSize: 8,
    share: ['weibo']
  }
}

export const integ: IntegrationUserConfig = {
  links: {
    logbook: [
      { date: '2026-09-11', content: 'Blog scaffolded with Astro Theme Pure.' }
    ],
    applyTip: [
      { name: 'Name', val: theme.title },
      { name: 'Desc', val: theme.description || 'Null' },
      { name: 'Link', val: 'https://yuzhishuo.github.io/' },
      { name: 'Avatar', val: 'https://yuzhishuo.github.io/favicon/favicon.ico' }
    ],
    cacheAvatar: false
  },
  pagefind: true,
  quote: {
    server: 'https://dummyjson.com/quotes/random',
    target: `(data) => (data.quote.length > 80 ? \`\${data.quote.slice(0, 80)}...\` : data.quote || 'Error')`
  },
  typography: {
    class: 'prose text-base',
    blockquoteStyle: 'italic',
    inlineCodeBlockStyle: 'modern'
  },
  mediumZoom: {
    enable: true,
    selector: '.prose .zoomable',
    options: {
      className: 'zoomable'
    }
  },
  // Waline disabled — using Giscus (see src/config/giscus.ts)
  waline: {
    enable: false,
    server: '',
    showMeta: false,
    emoji: ['bmoji', 'weibo'],
    additionalConfigs: {
      pageview: false,
      comment: false
    }
  }
}

/**
 * Giscus comments — Discussions enabled on yuzhishuo/blog.
 * See SETUP.md. Values can also be overridden via PUBLIC_GISCUS_* env vars.
 * Giscus GitHub App install may still be needed for the widget to load.
 */
export const giscus = {
  enable: true,
  repo: 'yuzhishuo/blog',
  repoId: 'R_kgDOUYAkfQ',
  category: 'Announcements',
  categoryId: 'DIC_kwDOUYAkfc4DFe3D',
  mapping: 'pathname' as const,
  strict: '0' as const,
  reactionsEnabled: '1' as const,
  emitMetadata: '0' as const,
  inputPosition: 'bottom' as const,
  // Theme URLs set in Giscus.astro to match Pure light/dark palette
  theme: 'preferred_color_scheme' as const,
  lang: 'zh-CN' as const,
  loading: 'lazy' as const
}

export const terms: CardListData = {
  title: 'Terms content',
  list: [
    {
      title: 'Privacy Policy',
      link: '/terms/privacy-policy'
    },
    {
      title: 'Terms and Conditions',
      link: '/terms/terms-and-conditions'
    },
    {
      title: 'Copyright',
      link: '/terms/copyright'
    },
    {
      title: 'Disclaimer',
      link: '/terms/disclaimer'
    }
  ]
}

const config = { ...theme, integ } as Config
export default config
