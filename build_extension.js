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
        'app.jsx', // We will compile this later, but copying for ref serves as backup or source map reference if needed? Actually we don't need to copy app.jsx to dist, we compile it. But the original script might have. Let's stick to compiling.
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
        { url: 'https://unpkg.com/react@18/umd/react.production.min.js', name: 'react.js' },
        { url: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', name: 'react-dom.js' },
        { url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', name: 'jszip.min.js' }
    ];

    for (const lib of libraries) {
        await downloadFile(lib.url, path.join(DIST_DIR, lib.name));
    }

    // 3.1 Download Phosphor Icons (SVGs only) and generate icons.js
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
    
    const iconsJsContent = `window.TINIFY_ICONS = ${JSON.stringify(iconsObj)};`;
    fs.writeFileSync(path.join(DIST_DIR, 'icons.js'), iconsJsContent);

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
    
    // Attempt to require JSZip (needs npm install jszip)
    let JSZip;
    try {
        // Try to require from local node_modules first
        JSZip = require(path.join(__dirname, 'node_modules', 'jszip'));
    } catch (e) {
        try {
            JSZip = require('jszip');
        } catch (e2) {
             console.log('⚠️ JSZip not found, trying to install...');
             execSync('npm install --no-save jszip', { stdio: 'inherit' });
             // After install, we must require using absolute path or reload module logic
             // But simpler is to rely on standard require resolution after install
             // However, in some envs, require cache or resolution might need help
             JSZip = require(path.join(__dirname, 'node_modules', 'jszip'));
        }
    }

    const zip = new JSZip();
    
    // Helper to add file to zip
    function addFileToZip(filePath, zipPath) {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath);
            zip.file(zipPath, content);
        }
    }
    
    // Add files
    addFileToZip(path.join(DIST_DIR, 'manifest.json'), 'manifest.json');
    addFileToZip(path.join(DIST_DIR, 'index.html'), 'index.html');
    addFileToZip(path.join(DIST_DIR, 'background.js'), 'background.js');
    addFileToZip(path.join(DIST_DIR, 'style.css'), 'style.css');
    addFileToZip(path.join(DIST_DIR, 'app.js'), 'app.js');
    // Also include app.jsx for reference if needed? No, user only needs compiled.
    addFileToZip(path.join(DIST_DIR, 'app.jsx'), 'app.jsx'); // Keeping it as per previous build
    addFileToZip(path.join(DIST_DIR, 'icons.js'), 'icons.js');
    addFileToZip(path.join(DIST_DIR, 'react.js'), 'react.js');
    addFileToZip(path.join(DIST_DIR, 'react-dom.js'), 'react-dom.js');
    addFileToZip(path.join(DIST_DIR, 'jszip.min.js'), 'jszip.min.js');
    
    // Add icons folder
    if (fs.existsSync(path.join(DIST_DIR, 'icons'))) {
        const iconFiles = fs.readdirSync(path.join(DIST_DIR, 'icons'));
        const iconsFolder = zip.folder('icons');
        iconFiles.forEach(file => {
            const content = fs.readFileSync(path.join(DIST_DIR, 'icons', file));
            iconsFolder.file(file, content);
        });
    }

    // Add _locales folder
    if (fs.existsSync(path.join(DIST_DIR, '_locales'))) {
        const localesFolder = zip.folder('_locales');
        const localeDirs = fs.readdirSync(path.join(DIST_DIR, '_locales'));
        localeDirs.forEach(locale => {
            if (fs.statSync(path.join(DIST_DIR, '_locales', locale)).isDirectory()) {
                const localeFolder = localesFolder.folder(locale);
                const msgFile = path.join(DIST_DIR, '_locales', locale, 'messages.json');
                if (fs.existsSync(msgFile)) {
                    localeFolder.file('messages.json', fs.readFileSync(msgFile));
                }
            }
        });
    }

    zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
        .pipe(fs.createWriteStream('tinify-extension.zip'))
        .on('finish', () => {
            console.log('✅ Build Complete! Created tinify-extension.zip');
        });
}

build().catch(console.error);
