// stores/plugins/pinia-persist-uni.ts
import type { PiniaPluginContext } from 'pinia';
import type { StateTree } from 'pinia';

export interface PersistStrategy {
  /** 存储 key，默认为 store.$id */
  key?: string;
  /** 只持久化指定的 state 路径 */
  paths?: string[];
  /** 强制异步存储（优先级高于全局 async） */
  async?: boolean;
}

export interface PersistOptions {
  enabled?: boolean;
  /** 多个存储策略 */
  strategies?: PersistStrategy[];
  /** 全局默认异步（推荐 true，避免主线程卡顿） */
  async?: boolean;
  /** 恢复前钩子（可用于数据迁移） */
  beforeRestore?: (ctx: PiniaPluginContext) => void;
  /** 恢复后钩子 */
  afterRestore?: (ctx: PiniaPluginContext) => void;
}

export interface PluginOptions {
  /** 存储 key 统一前缀，如 'hsbc_' */
  keyPrefix?: string;
}

declare module 'pinia' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S extends StateTree, Store> {
    persist?: PersistOptions;
  }
}

/** 精准计算字符串字节大小（uni-app 全平台可用） */
const getByteLength = (str: string): number => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  // 降级方案（极少触发）
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    len += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return len;
};

/** 安全的序列化（处理循环引用 + undefined + BigInt） */
const safeStringify = (obj: any): string => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return { __date__: value.toISOString() };
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
};

const safeParse = (val: any): any => {
  if (!val) return null;
  try {
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    // 简单恢复 Date
    if (parsed && typeof parsed === 'object') {
      Object.keys(parsed).forEach((key) => {
        const v = parsed[key];
        if (v && v.__date__ && typeof v.__date__ === 'string') {
          parsed[key] = new Date(v.__date__);
        }
      });
    }
    return parsed;
  } catch (e) {
    console.error('[Pinia Persist] Parse failed:', e);
    return null;
  }
};

const pick = (state: StateTree, paths?: string[]): Partial<StateTree> => {
  if (!paths || paths.length === 0) return { ...state };
  const result = {} as any;
  paths.forEach((p) => {
    if (p in state) result[p] = state[p];
  });
  return result;
};

export const createUniPersistPlugin = (pluginOptions?: PluginOptions) => {
  const keyPrefix = pluginOptions?.keyPrefix || '';

  return (ctx: PiniaPluginContext) => {
    const { store, options } = ctx;
    const persist = options.persist;
    if (!persist?.enabled) return;

    const strategies: PersistStrategy[] = persist.strategies?.length ? persist.strategies : [{ key: store.$id }];

    const globalAsync = persist.async ?? true; // uni-app 强烈推荐异步！

    // 生成带前缀的 key
    const getFullKey = (key: string) => `${keyPrefix}${key}`;

    // Step 1: 恢复状态（始终同步读取）
    persist.beforeRestore?.(ctx);

    strategies.forEach((strategy) => {
      const key = getFullKey(strategy.key || store.$id);
      try {
        const raw = uni.getStorageSync(key);
        const saved = safeParse(raw);
        if (saved !== null) {
          store.$patch(saved);
        }
      } catch (e) {
        console.error(`[Pinia Persist] Load failed: ${key}`, e);
        uni.removeStorageSync(key); // 损坏数据立即清理
      }
    });

    persist.afterRestore?.(ctx);

    // Step 2: 订阅变化
    store.$subscribe(
      (_mutation, state) => {
        strategies.forEach((strategy) => {
          const key = getFullKey(strategy.key || store.$id);
          const data = pick(state, strategy.paths);
          const json = safeStringify(data);

          // 大小警告（iOS 单条 < 4MB，小程序总和 < 10MB）
          if (getByteLength(json) > 3.5 * 1024 * 1024) {
            console.warn(`[Pinia Persist] Data too large (${key}): > 3.5MB`);
          }

          // 把这几行替换掉你原来的 save 逻辑
          const shouldUseAsync = (globalAsync && strategy.async !== false) || strategy.async === true;

          if (shouldUseAsync) {
            // 直接调用，最安全、最清晰、无类型问题
            uni.setStorage({
              key,
              data: json,
              // 可选：失败时也打印日志
              fail: (err) => {
                console.error(`[Pinia Persist] Async save failed (${key}):`, err);
              }
            });
          } else {
            try {
              uni.setStorageSync(key, json);
            } catch (err) {
              console.error(`[Pinia Persist] Sync save failed (${key}):`, err);
            }
          }
        });
      },
      {
        detached: true,
        deep: true,
        flush: globalAsync ? 'post' : 'sync' // 异步模式用 post 避免卡顿
      }
    );

    // Step 3: 安全处理 $reset（不覆盖原方法！）
    if (typeof store.$reset === 'function') {
      const originalReset = store.$reset;
      Object.defineProperty(store, '$reset', {
        value: function (this: typeof store) {
          originalReset.call(this);
          strategies.forEach((s) => {
            try {
              uni.removeStorageSync(getFullKey(s.key || store.$id));
            } catch {
              /* 静默失败 */
            }
          });
        },
        writable: true,
        configurable: true
      });
    }

    console.log(`[Pinia Persist] ${store.$id} 已启用持久化 (${globalAsync ? '异步' : '同步'}, 前缀: "${keyPrefix}")`);
  };
};

// 工具函数
export const clearStore = (key: string) => uni.removeStorageSync(key);
export const clearAll = () => uni.clearStorageSync();
