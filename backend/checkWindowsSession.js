// save as checkWindowsSession.js
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

async function checkWindowsSession() {
    console.log('🔍 Checking Windows session locations...');
    
    // Common Windows Chrome session locations
    const possiblePaths = [
        // Your current auth path
        path.join(process.cwd(), 'auth', 'RemoteAuth-admin'),
        // Windows AppData local
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default'),
        // Windows AppData roaming
        path.join(os.homedir(), 'AppData', 'Roaming', 'Google', 'Chrome', 'User Data', 'Default'),
        // Temp directory
        path.join(os.tmpdir(), 'RemoteAuth-admin'),
        // System drive
        path.join('C:', 'Users', os.userInfo().username, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
    ];
    
    for (const sessionPath of possiblePaths) {
        console.log(`\nChecking: ${sessionPath}`);
        try {
            if (await fs.pathExists(sessionPath)) {
                const stats = await fs.stat(sessionPath);
                const files = await fs.readdir(sessionPath);
                console.log(`✅ EXISTS: ${stats.size} bytes, ${files.length} files`);
                
                // Check for key files
                const keyFiles = ['Cookies', 'Local Storage', 'IndexedDB'];
                for (const keyFile of keyFiles) {
                    const keyPath = path.join(sessionPath, keyFile);
                    if (await fs.pathExists(keyPath)) {
                        const keyStats = await fs.stat(keyPath);
                        console.log(`   📁 ${keyFile}: ${keyStats.size} bytes`);
                    } else {
                        console.log(`   ❌ ${keyFile}: missing`);
                    }
                }
            } else {
                console.log('❌ Does not exist');
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
}

checkWindowsSession().catch(console.error);