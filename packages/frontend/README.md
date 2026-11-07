# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## 环境变量

复制 `.env.example` 为 `.env.local`（或直接设置环境变量）后配置：

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE_URL` | 可选。接口服务地址，例如 `http://127.0.0.1:8000`。留空表示与前端同源。 |

例如本地前后端分开启动时：

```bash
# packages/frontend/.env.local
VITE_API_BASE_URL=http://127.0.0.1:8000
```

注意：跨域访问时接口服务需要允许前端来源的 CORS 请求；也可以通过反向代理让前后端同源。若接口配置了 `PASSWORD`，密码校验依赖前端域下的 cookie，跨域时同样建议使用反向代理。
