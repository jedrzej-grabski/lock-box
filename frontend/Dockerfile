FROM node:20-alpine
WORKDIR /app

# Install deps (force to resolve conflicts)
COPY package*.json ./
RUN npm install --force

# Copy app source
COPY . .

ENV NODE_ENV=development
EXPOSE 3000

# Run Next.js dev server directly
CMD ["npm", "run", "dev"]