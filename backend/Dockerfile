# Use multi-stage build for smaller final image
FROM node:18 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Create entrypoint script with actual backend environment variables
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'echo "TARGET_WALLET=$TARGET_WALLET" > .env' >> /app/entrypoint.sh && \
    echo 'echo "PRIVATE_KEY=$PRIVATE_KEY" >> .env' >> /app/entrypoint.sh && \
    echo 'echo "TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN" >> .env' >> /app/entrypoint.sh && \
    echo 'echo "TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID" >> .env' >> /app/entrypoint.sh && \
    echo 'echo "RECEIVER_WALLET=$RECEIVER_WALLET" >> .env' >> /app/entrypoint.sh && \
    echo 'echo "PORT=$PORT" >> .env' >> /app/entrypoint.sh && \
    echo 'echo "HEDERA_NETWORK=$HEDERA_NETWORK" >> .env' >> /app/entrypoint.sh && \
    echo 'npm start' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3001

# Set the entrypoint
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"] 