# pinia-plugin-uni-persist

专为 **UniApp** 打造的 Pinia 持久化插件。

> A Pinia persistence plugin specifically designed for UniApp.

## ✨ 特性

- ⚡ **UniApp 专用**：基于 `uni.setStorage` 和 `uni.getStorageSync` 开发。
- 🚀 **性能优化**：
  - **写入**：默认异步 (`async`)，避免大数据量写入阻塞主线程导致页面卡顿。
  - **读取**：初始化时同步 (`sync`)，确保页面渲染前数据已就绪。
- 🛡️ **安全可靠**：自动处理 `BigInt`、`Date` 和循环引用 (`Circular References`)。
- 📦 **TypeScript**：提供完整的类型定义。

## 📦 安装

使用 pnpm (推荐):

```bash
pnpm add pinia-plugin-uni-persist
```

或者 npm/yarn:

```bash
npm install pinia-plugin-uni-persist
# yarn add pinia-plugin-uni-persist
```

## 🚀 快速上手

### 1. 注册插件 (main.ts)

```typescript
import { createSSRApp } from "vue";
import { createPinia } from "pinia";
import { createUniPersistPlugin } from "pinia-plugin-uni-persist"; // 引入插件
import App from "./App.vue";

export function createApp() {
  const app = createSSRApp(App);
  const pinia = createPinia();

  // 注册插件
  pinia.use(
    createUniPersistPlugin({
      keyPrefix: "app_storage_", // 可选：配置统一的 key 前缀
    })
  );

  app.use(pinia);
  return { app };
}
```

### 2. 在 Store 中使用

在定义 store 时，添加 `persist` 配置即可。

#### 组合式 (Setup Store) - 推荐

```typescript
import { defineStore } from "pinia";
import { ref } from "vue";

export const useUserStore = defineStore(
  "user",
  () => {
    const token = ref("");
    const userInfo = ref({ name: "UniApp", age: 18 });

    return { token, userInfo };
  },
  {
    persist: {
      enabled: true, // 开启持久化
      strategies: [
        {
          key: "user_key", // 自定义存储 key
          paths: ["token"], // 指定只持久化 token
        },
      ],
    },
  }
);
```

## ⚙️ 配置说明

| 选项         | 类型      | 默认值                 | 说明                         |
| ------------ | --------- | ---------------------- | ---------------------------- |
| `enabled`    | `boolean` | `false`                | 是否开启当前 store 的持久化  |
| `async`      | `boolean` | `true`                 | 是否异步存储 (推荐保持 true) |
| `strategies` | `Array`   | `[{ key: store.$id }]` | 存储策略数组                 |

### Strategy 详情

- **key**: 存储到本地缓存的键名。
- **paths**: 需要持久化的 state 属性名数组（如 `['count', 'token']`）。如果不传，则持久化整个 store。
- **async**: 覆盖全局的异步设置。

## 🛠 工具函数

```typescript
import { clearStore, clearAll } from "pinia-plugin-uni-persist";

// 清除特定 key
clearStore("app_storage_user_key");

// 清除全部缓存
clearAll();
```

## License

MIT
