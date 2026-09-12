/**
 * Giscus comment config (placeholder).
 * Prefer editing `giscus` in `src/site.config.ts`, or set PUBLIC_GISCUS_* in `.env`.
 * Get IDs from https://giscus.app after enabling Discussions on the repo.
 */
import { giscus as siteGiscus } from '../site.config'

export type GiscusConfig = typeof siteGiscus

function envOr(siteVal: string, envKey: string): string {
  const fromEnv = import.meta.env[envKey]
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return siteVal
}

export function getGiscusConfig(): GiscusConfig {
  const repo = envOr(siteGiscus.repo, 'PUBLIC_GISCUS_REPO')
  const repoId = envOr(siteGiscus.repoId, 'PUBLIC_GISCUS_REPO_ID')
  const category = envOr(siteGiscus.category, 'PUBLIC_GISCUS_CATEGORY')
  const categoryId = envOr(siteGiscus.categoryId, 'PUBLIC_GISCUS_CATEGORY_ID')
  const enable =
    siteGiscus.enable ||
    Boolean(repo && repoId && categoryId) ||
    import.meta.env.PUBLIC_GISCUS_ENABLE === 'true'

  return {
    ...siteGiscus,
    enable,
    repo,
    repoId,
    category,
    categoryId
  }
}

export function isGiscusReady(cfg: GiscusConfig = getGiscusConfig()): boolean {
  return Boolean(cfg.enable && cfg.repo && cfg.repoId && cfg.category && cfg.categoryId)
}
