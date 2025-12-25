import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'], // 输出 CommonJS 和 ESModule
  dts: true,              // 自动生成 .d.ts 类型声明
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: true,           // 压缩代码
  external: ['pinia', '@dcloudio/types'] // 排除外部依赖
})