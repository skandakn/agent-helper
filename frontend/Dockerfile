FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

# Bind to 0.0.0.0 so the container port mapping (3000:3000) actually reaches the dev server.
CMD ["npm", "run", "dev", "--", "-p", "3000", "-H", "0.0.0.0"]
