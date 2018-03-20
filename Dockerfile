FROM node:alpine

WORKDIR /app

COPY package.json .
COPY package-lock.json .

RUN npm install --registry https://registry.npm.taobao.org/

COPY index.js .

CMD ["node", "."]