FROM node:20-alpine

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy application source
COPY . .

# Expose Fastify port
EXPOSE 3000

# Run migrations at container start (NOT build time)
#CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm start"]
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]