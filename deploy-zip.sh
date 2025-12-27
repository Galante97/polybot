#!/bin/bash
# deploy-zip.sh
# Creates a zip file for Elastic Beanstalk deployment with only production dependencies

# Usage:
# chmod +x deploy-zip.sh
# ./deploy-zip.sh

echo "Creating deployment zip..."

# Name of the zip
ZIP_NAME="polybot-deploy.zip"

# Folders/files to include in the zip
INCLUDE_FOLDERS=("dist")   # includes dist/assets, dist/client, dist/server, index.html
INCLUDE_FILES=("package.json" "package-lock.json", "Procfile")

# Remove old zip if it exists
rm -f $ZIP_NAME

# Install only production dependencies in a temp folder
echo "Installing production dependencies..."
rm -rf temp_deploy
mkdir temp_deploy
cp package.json package-lock.json Procfile temp_deploy/ 
cd temp_deploy || exit
npm install --production
cd ..

# Build frontend first (dist will be generated here)
echo "Building Vite..."
npm run build
npm run build:server


# # Move production node_modules to root folder for zip
# mv temp_deploy/node_modules ./

# Clean up temp folder
rm -rf temp_deploy

# Create zip
echo "Zipping deployment package..."
zip -r $ZIP_NAME "${INCLUDE_FOLDERS[@]}" "${INCLUDE_FILES[@]}" 

# Optional: remove node_modules after zipping to keep repo clean
# rm -rf node_modules

echo "Deployment zip created: $ZIP_NAME"
