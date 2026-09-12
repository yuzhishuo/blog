import type { AstroGlobal, ImageMetadata } from 'astro'
import { getImage } from 'astro:assets'
import type { CollectionEntry } from 'astro:content'
import rss from '@astrojs/rss'
import type { Root } from 'mdast'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

import { sortMDByDate } from 'astro-pure/server'
import { getAllBlogPosts, isNotionPost, type BlogPost } from '@/lib/posts'
import config from 'virtual:config'

// Get dynamic import of images as a map collection
const imagesGlob = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/blog/**/*.{jpeg,jpg,png,gif,avif,webp}'
)

const renderMarkdownContent = async (post: CollectionEntry<'blog'>, site: URL) => {
  function remarkReplaceImageLink() {
    return async (tree: Root) => {
      const promises: Promise<void>[] = []
      visit(tree, 'image', (node) => {
        if (node.url.startsWith('/images')) {
          node.url = `${site}${node.url.replace('/', '')}`
        } else {
          const imagePathPrefix = `/src/content/blog/${post.id}/${node.url.replace('./', '')}`
          const promise = imagesGlob[imagePathPrefix]?.().then(async (res) => {
            const imagePath = res?.default
            if (imagePath) {
              node.url = `${site}${(await getImage({ src: imagePath })).src.replace('/', '')}`
            }
          })
          if (promise) promises.push(promise)
        }
      })
      await Promise.all(promises)
    }
  }

  const file = await unified()
    .use(remarkParse)
    .use(remarkReplaceImageLink)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(post.body ?? '')

  return String(file)
}

const renderPostContent = async (post: BlogPost, site: URL) => {
  if (isNotionPost(post)) {
    // Notion loader stores pre-rendered HTML on the entry
    const html = (post as BlogPost & { rendered?: { html?: string } }).rendered?.html
    return html ?? post.data.description
  }
  return renderMarkdownContent(post, site)
}

const heroSrc = (post: BlogPost): string => {
  if (!('heroImage' in post.data) || !post.data.heroImage) return ''
  const hero = post.data.heroImage as { src?: string | { src: string } }
  if (!hero.src) return ''
  return typeof hero.src === 'string' ? hero.src : hero.src.src
}

const GET = async (context: AstroGlobal) => {
  const allPostsByDate = sortMDByDate(await getAllBlogPosts()) as BlogPost[]
  const siteUrl = context.site ?? new URL(import.meta.env.SITE)

  return rss({
    trailingSlash: false,
    xmlns: { h: 'http://www.w3.org/TR/html4/' },
    stylesheet: '/scripts/pretty-feed-v3.xsl',

    title: config.title,
    description: config.description,
    site: import.meta.env.SITE,
    items: await Promise.all(
      allPostsByDate.map(async (post) => {
        const img = heroSrc(post)
        return {
          pubDate: post.data.publishDate,
          link: `/blog/${post.id}`,
          customData: img
            ? `<h:img src="${img}" />
          <enclosure url="${img}" />`
            : '',
          content: await renderPostContent(post, siteUrl),
          title: post.data.title,
          description: post.data.description
        }
      })
    )
  })
}

export { GET }
