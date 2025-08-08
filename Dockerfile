FROM node:18-alpine

WORKDIR /app

# Copy package file (只需要discord.js)
COPY app/package.json package.json

# Install dependencies
RUN npm install --only=production

# Copy HTTP version main file
COPY app/main.js main.js

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]