# Build frontend
FROM node:18 AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Build backend
FROM node:18 AS backend
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --legacy-peer-deps
COPY backend ./backend
COPY --from=frontend /app/build ./build

# Set environment variables (if needed)
ENV NODE_ENV=production

# Expose backend port
EXPOSE 3001

# Start backend (which serves frontend)
CMD ["node", "backend/server.js"] 