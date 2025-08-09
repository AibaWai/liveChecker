FROM node:18-alpine

WORKDIR /app

# Copy package file
COPY app/package.json package.json

# Install dependencies
RUN npm install --only=production

# Copy all application files
COPY app/main.js main.js
COPY app/html-analyzer.js html-analyzer.js

# Create directory for debug files
RUN mkdir -p /app/debug-files

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]