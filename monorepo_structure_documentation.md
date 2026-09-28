# Cấu trúc Dự án Monorepo (Turborepo + pnpm)

Dự án sử dụng kiến trúc Monorepo được quản lý bởi **pnpm workspaces** và **Turborepo** để tối ưu hóa việc chia sẻ code (Types, UI, Configs) trong khi vẫn đảm bảo khả năng build và đóng gói (Dockerize) hoàn toàn độc lập cho 3 ứng dụng lõi.

## 1. Cây thư mục tổng quan (Directory Tree)

```text
my-monorepo/
├── apps/
│   ├── cms-api/               # Backend API (Nest.js)
│   │   ├── src/
│   │   ├── Dockerfile         # Multi-stage Dockerfile (Node Alpine)
│   │   └── package.json
│   ├── cms-admin/             # Internal Portal (React.js/Vite)
│   │   ├── src/
│   │   ├── Dockerfile         # Multi-stage Dockerfile (Builder -> Nginx)
│   │   ├── nginx.conf         # Cấu hình Nginx cho SPA routing
│   │   └── package.json
│   └── frontend/              # Public Facing & BFF (Next.js)
│       ├── src/
│       ├── Dockerfile         # Multi-stage Dockerfile (Next Standalone)
│       ├── next.config.js     # Cấu hình output: 'standalone'
│       └── package.json
├── packages/
│   ├── types/                 # Shared TypeScript Interfaces / Zod Schemas
│   │   ├── index.ts
│   │   └── package.json
│   ├── ui/                    # Shared React Components (Tailwind/Radix)
│   │   └── package.json
│   ├── eslint-config/         # Cấu hình linter chung
│   │   └── package.json
│   └── typescript-config/     # Cấu hình tsconfig chung
│       └── package.json
├── package.json               # Root dependencies (Turborepo, pnpm)
├── pnpm-workspace.yaml        # Khai báo các workspace (apps/*, packages/*)
└── turbo.json                 # Cấu hình pipeline build/lint/test của Turborepo
```

## 2. Chi tiết các thành phần

### 2.1. Thư mục `apps/` (Các ứng dụng độc lập)
Đây là nơi chứa các ứng dụng có thể chạy và deploy được. Mỗi app đều có `Dockerfile` riêng và không phụ thuộc chéo logic của nhau (chỉ phụ thuộc vào `packages/`).

*   **`cms-api` (Nest.js):** 
    *   Chịu trách nhiệm tương tác Database, xử lý nghiệp vụ lõi.
    *   **Dockerfile:** Build theo 3 stages (Builder -> Production Deps -> Runner). Sử dụng `node:20-alpine`, dung lượng dự kiến ~150MB.
*   **`cms-admin` (React/Vite):** 
    *   Giao diện quản trị viên.
    *   **Dockerfile:** Build theo 2 stages. Stage 1 dùng Node.js build ra static files. Stage 2 dùng `nginx:alpine` để serve file tĩnh. Dung lượng dự kiến ~25MB.
*   **`frontend` (Next.js):** 
    *   Giao diện người dùng cuối, tích hợp luôn vai trò BFF (Backend-for-Frontend) thông qua Route Handlers.
    *   **Dockerfile:** Build theo 2 stages sử dụng tính năng `output: 'standalone'` của Next.js. Chỉ copy những file thực sự cần thiết vào runner stage. Dung lượng dự kiến ~100MB.

### 2.2. Thư mục `packages/` (Các thư viện dùng chung)
Nơi chứa code được chia sẻ giữa các app. Các package này không thể tự chạy độc lập.

*   **`types`:** Nơi chứa Single Source of Truth cho dữ liệu. Ví dụ: Định nghĩa `User` interface ở đây, cả `cms-api` (để trả data) và `frontend` (để hứng data) đều import chung một type.
*   **`ui`:** Hệ thống component dùng chung (Button, Card, Form Inputs,...) giúp đồng bộ UI giữa `cms-admin` và `frontend`.
*   **`eslint-config` & `typescript-config`:** Chuẩn hóa code style cho toàn bộ dự án, tránh lặp lại cấu hình.

## 3. Chiến lược Build & Đóng gói Docker (Isolation)

Mặc dù chung một repo, các app được đảm bảo tính đóng gói hoàn toàn độc lập thông qua công cụ **`turbo prune`**.

**Luồng hoạt động khi CI/CD build Docker cho một app (Ví dụ: `cms-api`):**

1.  **Cắt tỉa workspace:** CI chạy lệnh `npx turbo prune cms-api --docker`. 
2.  **Tạo thư mục cô lập:** Turborepo sẽ tạo ra một thư mục `out/` chỉ chứa source code của `cms-api` và các package nó phụ thuộc (ví dụ: `packages/types`), loại bỏ hoàn toàn code của `frontend` và `cms-admin`.
3.  **Build Image:** CI chạy lệnh `docker build` bên trong thư mục `out/` này, sử dụng `Dockerfile` đã định nghĩa sẵn của `cms-api`.

Chiến lược này đảm bảo:
*   Thay đổi code ở app nào thì chỉ build lại Docker image của app đó.
*   Image tạo ra cực kỳ tối ưu, không mang theo bất kỳ rác (source code thừa) nào từ các dự án khác trong Monorepo.
*   Sẵn sàng để CI push image lên Container Registry, chờ repo Deployment (K8s/GitOps) kéo về chạy trên các Pod riêng biệt.