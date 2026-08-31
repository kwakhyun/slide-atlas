FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 atlas
COPY --from=build --chown=atlas:nodejs /app/.next/standalone ./
COPY --from=build --chown=atlas:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=atlas:nodejs /app/public ./public
COPY --from=build --chown=atlas:nodejs /app/db ./db
RUN mkdir -p /app/.data && chown atlas:nodejs /app/.data
USER atlas
EXPOSE 3000
CMD ["node", "server.js"]
