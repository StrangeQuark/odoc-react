FROM node:26-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 deploy/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --chown=101:101 --from=build /workspace/dist /usr/share/nginx/html
EXPOSE 8080
