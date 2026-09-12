FROM node:22-alpine AS builder
WORKDIR /repo
COPY app/package.json app/pnpm-lock.yaml ./app/
RUN cd app && npm install -g pnpm && pnpm install --frozen-lockfile --ignore-scripts
COPY app ./app
COPY shared ./shared
RUN cd app && pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /repo/app/.next/standalone ./
COPY --from=builder /repo/app/.next/static ./.next/static
COPY --from=builder /repo/app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
