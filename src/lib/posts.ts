/**
 * Dual-source blog listings: local `blog` + Notion `notionBlog`.
 * Theme Pure pages call getAllBlogPosts() instead of getBlogCollection() alone.
 */
import { type CollectionEntry, getCollection } from 'astro:content'

import { getBlogCollection, sortMDByDate } from 'astro-pure/server'

import { hasNotionCredentials } from './notion'

export type LocalBlogPost = CollectionEntry<'blog'>
export type NotionBlogPost = CollectionEntry<'notionBlog'>
export type BlogPost = LocalBlogPost | NotionBlogPost

const prod = import.meta.env.PROD

async function getNotionBlogCollection(): Promise<NotionBlogPost[]> {
  // Avoid Astro "collection empty / does not exist" noise when token unset
  if (!hasNotionCredentials()) return []
  try {
    return await getCollection('notionBlog', ({ data }) => (prod ? !data.draft : true))
  } catch {
    return []
  }
}

/** Merge local markdown + Notion posts (draft-filtered like Theme Pure). */
export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const [local, notion] = await Promise.all([getBlogCollection('blog'), getNotionBlogCollection()])
  return [...local, ...notion] as BlogPost[]
}

/** Merged posts sorted by date (newest first). */
export async function getAllBlogPostsSorted(): Promise<BlogPost[]> {
  return sortMDByDate(await getAllBlogPosts()) as BlogPost[]
}

export function isNotionPost(post: BlogPost): post is NotionBlogPost {
  return post.collection === 'notionBlog'
}
