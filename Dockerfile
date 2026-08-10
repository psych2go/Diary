FROM node:24-alpine

WORKDIR /app
COPY package.json server.js ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DIARY_DATA_DIR=/data

RUN addgroup -S diary && adduser -S diary -G diary \
  && mkdir -p /data \
  && chown -R diary:diary /app /data

USER diary
EXPOSE 3000

CMD ["node", "server.js"]
