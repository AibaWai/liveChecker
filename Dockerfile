FROM node:18-slim

WORKDIR /app

# Copy package files (only need discord.js for simple version)
COPY app/package-simple.json package.json

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY app/simple-main.js main.js

# Expose port
EXPOSE 3000

CMD ["node", "simple-main.js"]