import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The commit the bundle was built from, shown as a pill in the header so the running
// version can be read off the page. Cloudflare Pages exposes the sha in the build
// environment; git is the source everywhere else.
const git = (args: string) => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}
const commitSha = (process.env.CF_PAGES_COMMIT_SHA || git('rev-parse HEAD')).slice(0, 7) || 'unknown'
const commitDate = git('log -1 --format=%cI')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_COMMIT__: JSON.stringify(commitSha),
    __APP_COMMIT_DATE__: JSON.stringify(commitDate),
  },
})
