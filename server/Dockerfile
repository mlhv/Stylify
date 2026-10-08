FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 AS aws-lambda-adapter
FROM oven/bun:1.3.13-debian

COPY --from=aws-lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

ENV PORT=8080
WORKDIR /var/task

# Bun needs the manifest of every workspace listed in the root package.json,
# or it fails with "Workspace not found". --filter installs only server's deps.
# --omit=peer is required: the Kinde SDK has an optional peer (expo-secure-store)
# that mobile/ puts in the lockfile, and without it Expo and React Native are
# installed into this image.
COPY package.json bun.lockb ./
COPY server/package.json ./server/
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/
COPY mobile/package.json ./mobile/
RUN bun install --production --frozen-lockfile --omit=peer --filter server

COPY server/ ./server/
COPY shared/ ./shared/

CMD ["bun", "server/index.ts"]
