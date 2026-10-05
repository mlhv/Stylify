FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 AS aws-lambda-adapter
FROM oven/bun:1.3.13-debian

COPY --from=aws-lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

ENV PORT=8080
WORKDIR /var/task

# Bun needs the manifest of every workspace listed in the root package.json,
# or it fails with "Workspace not found". --filter installs only server's deps.
COPY package.json bun.lockb ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
RUN bun install --production --frozen-lockfile --filter server

COPY server/ ./server/
COPY shared/ ./shared/

CMD ["bun", "server/index.ts"]
