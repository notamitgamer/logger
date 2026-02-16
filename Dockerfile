FROM node:20-slim

# Install system dependencies
# We add git because some npm packages require it to fetch dependencies.
# We add python3, make, and g++ because some crypto libraries used by Baileys 
# might need to compile native code.
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start command
CMD [ "node", "index.js" ]
