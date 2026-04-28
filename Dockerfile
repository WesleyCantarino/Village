FROM node:20-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY src/ ./src/

# Copy sql.js wasm file
RUN mkdir -p /app/node_modules/sql.js/dist && \
    cp /app/node_modules/sql.js/dist/sql-wasm.wasm /app/node_modules/sql.js/dist/sql-wasm.wasm 2>/dev/null || true

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/server.js"]
