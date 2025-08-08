# Use Node.js image with browser dependencies
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Set working directory
WORKDIR /app

# Copy package file
COPY app/package.json package.json

# Install dependencies
RUN npm install --only=production

# Install Playwright browsers
RUN npx playwright install chromium

# Copy main file
COPY app/main.js main.js

# Create tmp directory for screenshots
RUN mkdir -p /tmp

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]