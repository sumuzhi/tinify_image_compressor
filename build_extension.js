const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// Configuration
const DIST_DIR = path.join(__dirname, 'dist');
const ICONS = [
    'check-circle',
    'warning-circle',
    'image',
    'download-simple',
    'trash',
    'images',
    'key',
    'cloud-arrow-up',
    'folder',
    'spinner',
    'play',
    'download'
];

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR);
}

// Helper: Download file with redirect support
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const get = (link) => {
            https.get(link, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const newUrl = new URL(response.headers.location, link).toString();
                    get(newUrl);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download ${link}: ${response.statusCode}`));
                    return;
                }
                const file = fs.createWriteStream(dest);
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });
        };
        get(url);
    });
}

// Helper: Fetch URL content as string with redirect support
function fetchContent(url) {
    return new Promise((resolve, reject) => {
        const get = (link) => {
            https.get(link, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    const newUrl = new URL(response.headers.location, link).toString();
                    get(newUrl);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to fetch ${link}: ${response.statusCode}`));
                    return;
                }
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => resolve(data));
            }).on('error', reject);
        };
        get(url);
    });
}

async function build() {
    console.log('🚀 Starting build process...');

    // 1. Install Dependencies (Tailwind CSS)
    console.log('📦 Installing build dependencies...');
    try {
        execSync('npm install --no-save tailwindcss@3', { stdio: 'inherit' });
    } catch (e) {
        console.warn('Warning: npm install failed, trying to proceed...');
    }

    // 2. Copy static files
    console.log('📂 Copying static files...');
    const filesToCopy = [
        'manifest.json',
        'background.js'
    ];
    
    // Copy icons directory if exists
    if (fs.existsSync('icons')) {
        execSync(`cp -r icons "${DIST_DIR}/"`);
    }

    // Copy _locales directory if exists
    if (fs.existsSync('_locales')) {
        execSync(`cp -r _locales "${DIST_DIR}/"`);
    }

    filesToCopy.forEach(file => {
        if (fs.existsSync(file)) {
            fs.copyFileSync(file, path.join(DIST_DIR, file));
        }
    });

    // 3. Download Libraries & Icons
    console.log('⬇️ Downloading libraries...');
    const libraries = [
        { url: 'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js', name: 'react.js' },
        { url: 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js', name: 'react-dom.js' },
        { url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', name: 'jszip.min.js' }
    ];

    for (const lib of libraries) {
        const destPath = path.join(DIST_DIR, lib.name);
        try {
            await downloadFile(lib.url, destPath);
            if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
                throw new Error(`File ${lib.name} is empty or missing after download`);
            }
            console.log(`   ✅ Downloaded ${lib.name} (${fs.statSync(destPath).size} bytes)`);
        } catch (error) {
            console.error(`   ❌ Failed to download ${lib.name}: ${error.message}`);
            process.exit(1);
        }
    }

    // 3.1 Download Phosphor Icons (SVGs only) and prepare for injection
    console.log('⬇️ Downloading Phosphor Icons (SVGs)...');
    const iconsObj = {};
    const iconBaseUrl = 'https://unpkg.com/@phosphor-icons/core@2.1.1/assets/regular';
    
    for (const iconName of ICONS) {
        try {
            console.log(`   Fetching ${iconName}...`);
            let svgContent = await fetchContent(`${iconBaseUrl}/${iconName}.svg`);
            
            // Optimize SVG: remove width/height, add fill="currentColor"
            // Default phosphor SVG: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"/><path d="..."/></svg>
            // We want to remove width/height from root, or set them to 1em.
            // And ensure path uses currentColor if it's not set (usually they are black).
            
            // Replace <svg ...> tag attributes to be standard for inline icon
            svgContent = svgContent.replace(/<svg[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" width="1em" height="1em">');
            
            // Minify slightly by removing newlines
            svgContent = svgContent.replace(/\n/g, '');
            
            iconsObj[iconName] = svgContent;
        } catch (e) {
            console.error(`Failed to download icon: ${iconName}`, e.message);
        }
    }
    
    // We will inject icons directly into index.html instead of creating a separate file
    // to avoid loading issues.
    
    // Also update icons.js in root for development environment
    const iconsJsContent = `window.TINIFY_ICONS = ${JSON.stringify(iconsObj)};`;
    fs.writeFileSync('icons.js', iconsJsContent);
    // Also write to dist/icons.js to solve CSP issue
    fs.writeFileSync(path.join(DIST_DIR, 'icons.js'), iconsJsContent);
    console.log('✅ Updated icons.js in root and dist');



    // 4. Build Tailwind CSS
    console.log('🎨 Building Tailwind CSS...');
    // We need to specify content path so Tailwind knows where to look for classes
    execSync(`npx tailwindcss -i ./style.css -o ./dist/style.css --content "./app.jsx,./index.html" --minify`, { stdio: 'inherit' });

    // 5. Compile JSX to JS using Babel CLI
    console.log('⚛️ Compiling JSX...');
    console.log('   Installing Babel dependencies...');
    // Install babel dependencies if not present (using --no-save to avoid modifying package.json if not needed, but here we might need them)
    // We use npx to run babel, so we need the packages installed in node_modules
    execSync('npm install @babel/core @babel/cli @babel/preset-react --no-save', { stdio: 'inherit' });
    
    console.log('   Running Babel...');
    execSync('npx babel app.jsx --out-file dist/app.js --presets @babel/preset-react', { stdio: 'inherit' });

    // 6. Update index.html
    console.log('📄 Updating index.html...');
    let htmlContent = fs.readFileSync('index.html', 'utf8');
    
    // Remove local development scripts/links if any
    // Note: The original index.html might have different structure. 
    // We assume it has a body/head.
    
    // We need to inject the scripts: react, react-dom, jszip, icons.js, app.js
    // And style.css
    
    // Simple approach: Replace the development scripts with production ones
    // Or just rewrite the file based on a template.
    // Given the user refactored index.html, let's read it and inject.
    
    // Regex to remove existing script tags that might be for dev
    // But better to just look for the end of body and inject ours.
    // However, we need to ensure we don't have duplicates if index.html already has them.
    // The user's index.html likely has: <script type="text/babel" src="app.jsx"></script>
    
    // Remove <script type="text/babel" ...>
    htmlContent = htmlContent.replace(/<script[^>]*type=["']text\/babel["'][^>]*>[\s\S]*?<\/script>/g, '');
    
    // Remove any CDN links
    htmlContent = htmlContent.replace(/<script[^>]*src=["']https?:\/\/.*["'][^>]*>[\s\S]*?<\/script>/g, '');

    // Remove existing local scripts that we are going to inject (jszip.min.js)
    htmlContent = htmlContent.replace(/<script[^>]*src=["']jszip\.min\.js["'][^>]*>[\s\S]*?<\/script>/g, '');

    // Inject CSS
    if (!htmlContent.includes('href="style.css"')) {
        htmlContent = htmlContent.replace('</head>', '    <link rel="stylesheet" href="style.css">\n</head>');
    }
    
    // Prepare scripts
    const scripts = `
    <script src="react.js"></script>
    <script src="react-dom.js"></script>
    <script src="jszip.min.js"></script>
    <script src="icons.js"></script>
    <script src="app.js"></script>
    `;
    
    htmlContent = htmlContent.replace('</body>', `${scripts}</body>`);
    
    // Clean up any potential phosphor CSS links that might be in the source index.html
    htmlContent = htmlContent.replace(/<link[^>]*href=["'].*phosphor.*["'][^>]*>/g, '');

    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), htmlContent);

    // 7. Create ZIP file
    console.log('🤐 Zipping extension...');
    
    try {
        // Use system zip command for reliability
        // Remove existing zip if any
        if (fs.existsSync('tinify-extension.zip')) {
            fs.unlinkSync('tinify-extension.zip');
        }
        
        // cd into dist and zip everything to ../tinify-extension.zip
        execSync('cd dist && zip -r ../tinify-extension.zip .', { stdio: 'inherit' });
        console.log('✅ Build Complete! Created tinify-extension.zip');
    } catch (error) {
        console.error('❌ Failed to create zip file:', error.message);
        
        // Fallback to JSZip if system zip fails (e.g. on Windows without zip in path)
        console.log('⚠️ System zip failed, trying JSZip fallback...');
        
        let JSZip;
        try {
            JSZip = require(path.join(__dirname, 'node_modules', 'jszip'));
        } catch (e) {
            try {
                JSZip = require('jszip');
            } catch (e2) {
                 console.log('⚠️ JSZip not found, trying to install...');
                 execSync('npm install --no-save jszip', { stdio: 'inherit' });
                 JSZip = require(path.join(__dirname, 'node_modules', 'jszip'));
            }
        }

        const zip = new JSZip();
        
        function addFileToZip(filePath, zipPath) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath);
                zip.file(zipPath, content);
            }
        }
        
        // Add files from dist
        const files = fs.readdirSync(DIST_DIR);
        
        function addDirToZip(dirPath, zipDir) {
            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
                const fullPath = path.join(dirPath, file);
                const zipPath = path.join(zipDir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    addDirToZip(fullPath, zipPath);
                } else {
                    addFileToZip(fullPath, zipPath);
                }
            });
        }

        addDirToZip(DIST_DIR, '');

        zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
            .pipe(fs.createWriteStream('tinify-extension.zip'))
            .on('finish', () => {
                console.log('✅ Build Complete! Created tinify-extension.zip (fallback)');
            });
    }
}

build().catch(console.error);
