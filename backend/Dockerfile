FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY backend/assets/questoes ./assets/questoes

EXPOSE 3000

CMD ["npm", "start"]
