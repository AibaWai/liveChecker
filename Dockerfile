FROM node:18-alpine

WORKDIR /app

# Copy package file
COPY app/package.json package.json

# Install dependencies
RUN npm install --only=production

# Copy main file
COPY app/main.js main.js

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]