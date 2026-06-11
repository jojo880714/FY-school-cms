import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: 給 GitHub Pages 用 — 部署網址是 https://jojo880714.github.io/FY-school-cms/
//       本機 dev 仍可正常運作(Vite dev server 不受 base 影響)
export default defineConfig({
  base: '/FY-school-cms/',
  plugins: [react()],
})
