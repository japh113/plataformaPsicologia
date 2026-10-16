FROM node:24-bookworm-slim

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --include=dev
COPY --chown=node:node . .

EXPOSE 5000
CMD ["npm", "run", "dev", "--", "--legacy-watch", "--watch", "src", "--ext", "js,json"]
