# frontend/Dockerfile
# Stage de desarrollo con hot reload de Vite

FROM node:20-alpine AS development

WORKDIR /app

# Instala dependencias primero (capa cacheada si package.json no cambia)
COPY package.json package-lock.json* ./
RUN npm install

# Copia el resto del código fuente
# En docker-compose.dev.yml el src/ se monta como volumen, así que
# este COPY sirve principalmente para la imagen de producción
COPY . .

EXPOSE 5173

# Vite escucha en 0.0.0.0 para ser accesible desde fuera del contenedor
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ─────────────────────────────────────────────
# Stage de producción (build estático + servidor ligero)
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
