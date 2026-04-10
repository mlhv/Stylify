FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 AS aws-lambda-adapter
FROM oven/bun:debian

COPY --from=aws-lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

ENV PORT=8080
WORKDIR /var/task

COPY package.json bun.lockb ./
RUN bun install --production --frozen-lockfile

COPY server/ ./server/

CMD ["bun", "server/index.ts"]