# Use multi-stage build for smaller final image
FROM node:18 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Create entrypoint script with actual frontend environment variables
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'echo "BOT_TOKEN=$BOT_TOKEN" > .env' >> /app/entrypoint.sh && \
    echo 'echo "GENERATE_SOURCEMAP=$GENERATE_SOURCEMAP" >> .env' >> /app/entrypoint.sh && \
    echo 'echo "REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL" >> .env' >> /app/entrypoint.sh && \
    echo 'npm run build' >> /app/entrypoint.sh && \
    echo 'npm run start' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3000

# Set the entrypoint
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"] 