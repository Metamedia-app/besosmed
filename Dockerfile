FROM node:20-alpine

# Set working directory di dalam container
WORKDIR /app

# Copy daftar dependensi package.json
COPY package*.json ./

# Install dependensi (hanya production agar image ringan)
RUN npm install --omit=dev

# Copy seluruh kode sumber backend
COPY . .

# Buka port 3000 untuk backend
EXPOSE 3000

# Script/perintah untuk menjalankan backend
CMD ["node", "src/server.js"]
