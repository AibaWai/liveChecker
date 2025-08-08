FROM node:18-alpine

WORKDIR /app

# Copy package file (只需要discord.js)
COPY app/package-http.json package.json

# Install dependencies
RUN npm install --only=production

# Copy HTTP version main file
COPY app/http-main.js main.js

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]