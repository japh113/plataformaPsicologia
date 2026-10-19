FROM node:24-bookworm-slim
ARG REVIEW_RUN
LABEL io.psicopanel.contact-review.run=$REVIEW_RUN
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN mkdir /review && npm install --prefix /review --save-exact playwright@1.64.0
ENV CHROMIUM_EXECUTABLE=/usr/bin/chromium
WORKDIR /review
