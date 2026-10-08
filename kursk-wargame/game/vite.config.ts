import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相对路径：部署在 GitHub Pages 子目录下也能正确加载资源
  base: './',
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
