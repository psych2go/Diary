FROM alpine:3.22

RUN apk add --no-cache curl restic tzdata

COPY crontab /etc/crontabs/root
COPY diary-backup /usr/local/bin/diary-backup
COPY RESTORE.md /instructions/RESTORE.md

RUN chmod 700 /usr/local/bin/diary-backup \
  && mkdir -p /cache

ENV RESTIC_CACHE_DIR=/cache
ENV TZ=Asia/Shanghai

ENTRYPOINT ["/usr/local/bin/diary-backup"]
CMD ["daemon"]
