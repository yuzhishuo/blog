import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

import { createNotionBlogLoader } from './lib/notion'

function removeDupsAndLowerCase(array: string[]) {
  if (!array.length) return array
  const lowercaseItems = array.map((str) => str.toLowerCase())
  const distinctItems = new Set(lowercaseItems)
  return Array.from(distinctItems)
}

// Local Markdown/MDX — primary source (Theme Pure default)
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().max(60),
      description: z.string().max(160),
      publishDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: z
        .object({
          src: image(),
          alt: z.string().optional(),
          inferSize: z.boolean().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          color: z.string().optional()
        })
        .optional(),
      tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
      language: z.string().optional(),
      draft: z.boolean().default(false),
      comment: z.boolean().default(true)
    })
})

/**
 * Notion dual-source collection.
 * Loader: @luanroger/notion-astro-loader (data source API).
 * Filter: Status (SELECT) = 已发布 — see src/lib/notion.ts
 * No-ops when NOTION_TOKEN is unset.
 * Mapped fields: title←Name, description←Summary, publishDate←PublishDate,
 * tags←Tags, draft=false, entry id←Slug
 */
const notionBlog = defineCollection({
  loader: createNotionBlogLoader(),
  schema: z.object({
    title: z.string().max(60),
    description: z.string().max(160),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
    language: z.string().optional(),
    draft: z.boolean().default(false),
    comment: z.boolean().default(true),
    slug: z.string().optional()
  })
})

const docs = defineCollection({
  loader: glob({ base: './src/content/docs', pattern: '**/*.{md,mdx}' }),
  schema: () =>
    z.object({
      title: z.string().max(60),
      description: z.string().max(160),
      publishDate: z.coerce.date().optional(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
      draft: z.boolean().default(false),
      order: z.number().default(999)
    })
})

export const collections = { blog, notionBlog, docs }
