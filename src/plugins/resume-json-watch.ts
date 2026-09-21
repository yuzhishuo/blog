import { copyFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Plugin, ViteDevServer } from 'vite'

const root = fileURLToPath(new URL('../..', import.meta.url))
const SRC = resolve(root, 'resume/resume.json')
const DEST = resolve(root, 'src/data/resume.json')

function sameFile(a: string, b: string) {
  return resolve(a) === resolve(b)
}

function syncResumeJson() {
  const text = readFileSync(SRC, 'utf8')
  JSON.parse(text)
  copyFileSync(SRC, DEST)
}

export default function resumeJsonWatch(): Plugin {
  let timer: ReturnType<typeof setTimeout> | undefined

  const run = (server?: ViteDevServer) => {
    try {
      syncResumeJson()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[resume] skip sync: ${message}`)
      return
    }
    if (!server) return
    for (const mod of server.moduleGraph.idToModuleMap.values()) {
      if (mod.file && (sameFile(mod.file, SRC) || sameFile(mod.file, DEST))) {
        server.moduleGraph.invalidateModule(mod)
      }
    }
    server.ws.send({ type: 'full-reload' })
  }

  return {
    name: 'resume-json-watch',
    buildStart() {
      try {
        syncResumeJson()
      } catch {
        /* production still has npm run resume:sync */
      }
      this.addWatchFile(SRC)
    },
    configureServer(server) {
      run()
      server.watcher.add(SRC)
      const schedule = (file: string) => {
        if (!sameFile(file, SRC)) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => run(server), 80)
      }
      server.watcher.on('change', schedule)
      server.watcher.on('add', schedule)
    }
  }
}
