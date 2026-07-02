import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { PORT, getLocalIPAddress } from './src/config/network.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

// Add HTTP Request Logging
app.use((req, res, next) => {
    console.log(`🌐 [HTTP] ${req.method} ${req.url}`);
    next();
});

// Serve static assets out of your public workspace directory
app.use(express.static(path.join(__dirname, 'public')));

// Map local node_modules packages to avoid CDN dependencies
app.use('/fonts/press-start-2p', express.static(path.join(__dirname, 'node_modules/@fontsource/press-start-2p')));

// MODULE 2: Dynamic ROM Folder Scanning API
app.get('/api/games', async (req, res) => {
    console.log(`📂 [API] Scanning ROM directories...`);
    const romsDir = path.join(__dirname, 'public', 'roms');
    const gamesList = [];
    
    try {
        const consoles = await fs.readdir(romsDir, { withFileTypes: true });
        for (const consoleDir of consoles) {
            if (consoleDir.isDirectory()) {
                const consolePath = path.join(romsDir, consoleDir.name);
                const files = await fs.readdir(consolePath);
                
                // Process playable files, ignoring hidden system files, metadata jsons, and images
                const roms = files.filter(f => !f.startsWith('.') && !f.endsWith('.json') && !f.match(/\.(png|jpg|jpeg|webp)$/i));
                
                for (const rom of roms) {
                    const baseName = rom.replace(/\.[^/.]+$/, "");
                    const jsonName = `${baseName}.json`;
                    let meta = {};

                    // Scan for adjacent metadata .json file of the exact same name
                    if (files.includes(jsonName)) {
                        try {
                            const jsonContent = await fs.readFile(path.join(consolePath, jsonName), 'utf-8');
                            meta = JSON.parse(jsonContent);
                        } catch (err) {
                            console.error(`Failed to parse metadata for ${rom}:`, err);
                        }
                    }

                    let imagePath = null;
                    if (meta.image) {
                        // If an image is specified in the JSON, use it. Assumes it's relative to the console's rom folder.
                        imagePath = `/roms/${consoleDir.name}/${meta.image}`;
                    } else {
                        // Otherwise, auto-scan for a matching image file
                        const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
                        for (const ext of imageExtensions) {
                            const potentialImageFile = `${baseName}${ext}`;
                            if (files.includes(potentialImageFile)) {
                                imagePath = `/roms/${consoleDir.name}/${potentialImageFile}`;
                                break;
                            }
                        }
                    }

                    gamesList.push({
                        console: meta.console || consoleDir.name.toUpperCase(),
                        layout: meta.layout || null,
                        image: imagePath,
                        filename: rom,
                        path: `/roms/${consoleDir.name}/${rom}`,
                        title: meta.title || baseName,
                        description: meta.description || 'No description available.',
                        release: meta.release || 'Unknown'
                    });
                }
            }
        }
        res.json(gamesList);
    } catch (error) {
        if (error.code === 'ENOENT') res.json([]);
        else res.status(500).json({ error: 'Failed to scan ROMs directory' });
    }
});

const SYSTEM_IP = getLocalIPAddress();

server.listen(PORT, () => {
    console.log(`\n🕹️  ================================================ 🕹️`);
    console.log(`🚀 PRODUCTION-READY INTEGRATION HOOKS STANDING BY:`);
    console.log(`🖥️  Console Main Frame View:  http://localhost:${PORT}/tv.html`);
    console.log(`📱 Target Mobile Link Host:  ${SYSTEM_IP}:${PORT}`);
    console.log(`🕹️  ================================================ 🕹️\n`);
});