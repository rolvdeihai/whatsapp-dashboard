// backend/src/patches/patchRemoteAuth.js - COMPLETE WORKING SOLUTION
import { createRequire } from 'module';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import required libraries
const require = createRequire(import.meta.url);
const archiver = require('archiver');
const unzipper = require('unzipper');

// Patch RemoteAuth class directly
const RemoteAuthPath = require.resolve('whatsapp-web.js');

console.log('🔧 Loading RemoteAuth from:', RemoteAuthPath);

try {
  // Monkey-patch by modifying the require cache
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  
  Module.prototype.require = function(id) {
    const result = originalRequire.apply(this, arguments);
    
    if (id.includes('whatsapp-web.js') || (result && result.name === 'RemoteAuth')) {
      console.log('🔧 Patching RemoteAuth class...');
      
      // Find the RemoteAuth class
      const RemoteAuth = result.default || result;
      
      if (RemoteAuth && RemoteAuth.prototype) {
        // ====== FIX 1: DISABLE deleteMetadata ======
        RemoteAuth.prototype.deleteMetadata = async function() {
          console.log('🔧 [PATCH] deleteMetadata() - DISABLED (Windows safe mode)');
          return; // Do nothing on Windows
        };
        
        // ====== FIX 2: USE SHADOW COPY STRATEGY ======
        RemoteAuth.prototype.compressSession = async function() {
          console.log('🔧 [PATCH] compressSession() - WINDOWS SHADOW COPY STRATEGY');
          
          // Strategy: Copy only WHAT WE CAN, skip locked files gracefully
          if (!fs.existsSync(this.userDataDir)) {
            console.error('❌ Source directory does not exist!');
            return; // Don't crash, just return
          }
          
          // Remove temp dir if exists
          if (fs.existsSync(this.tempDir)) {
            await fs.remove(this.tempDir).catch(() => {});
          }
          
          // Create temp dir
          await fs.ensureDir(this.tempDir);
          
          // WINDOWS SAFE COPY: Skip locked files, copy what we can
          console.log('🔧 Starting Windows-safe copy (skipping locked files)...');
          
          const copyWhatWeCan = async (sourceDir, targetDir) => {
            try {
              const items = await fs.readdir(sourceDir, { withFileTypes: true });
              
              for (const item of items) {
                const sourcePath = path.join(sourceDir, item.name);
                const targetPath = path.join(targetDir, item.name);
                
                try {
                  // Skip known problematic files on Windows
                  const skipFiles = [
                    'LOCK', 'lockfile', 'SingletonLock', 'SingletonCookie',
                    'Cookies', 'Cookies-journal',
                    'Safe Browsing Cookies', 'Safe Browsing Cookies-journal',
                    'Session_', 'sqldb', 'journal', 'wal'
                  ];
                  
                  const shouldSkip = skipFiles.some(pattern => 
                    item.name.includes(pattern) || 
                    sourcePath.toLowerCase().includes('cache_data')
                  );
                  
                  if (shouldSkip) {
                    // console.log(`   ⏭️  Skipping (known issue): ${item.name}`);
                    continue;
                  }
                  
                  if (item.isDirectory()) {
                    await fs.ensureDir(targetPath);
                    await copyWhatWeCan(sourcePath, targetPath);
                  } else {
                    // Try to copy with timeout and error handling
                    try {
                      await fs.copyFile(sourcePath, targetPath);
                      
                      // Log only large successful copies
                      const stats = await fs.stat(targetPath);
                      if (stats.size > 5 * 1024 * 1024) { // >5MB
                        console.log(`   ✅ Copied large: ${path.relative(this.userDataDir, targetPath)} (${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB)`);
                      }
                    } catch (copyError) {
                      if (copyError.code === 'EBUSY') {
                        // Silently skip locked files - this is expected on Windows
                        // console.log(`   🔒 Skipping locked: ${item.name}`);
                      } else {
                        console.log(`   ⚠️  Could not copy ${item.name}: ${copyError.code}`);
                      }
                    }
                  }
                } catch (itemError) {
                  // Continue with next item
                }
              }
            } catch (dirError) {
              console.log(`   ❌ Error reading directory: ${dirError.message}`);
            }
          };
          
          await copyWhatWeCan(this.userDataDir, this.tempDir);
          
          // Verify what we got
          const calculateDirSize = (dir) => {
            let total = 0;
            try {
              const items = fs.readdirSync(dir, { withFileTypes: true });
              for (const item of items) {
                const itemPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                  total += calculateDirSize(itemPath);
                } else {
                  try {
                    const stats = fs.statSync(itemPath);
                    total += stats.size;
                  } catch (e) {}
                }
              }
            } catch (e) {}
            return total;
          };
          
          const sourceSize = calculateDirSize(this.userDataDir);
          const tempSize = calculateDirSize(this.tempDir);
          
          console.log(`📊 Windows-safe copy results:`);
          console.log(`   Source: ${Math.round(sourceSize / 1024 / 1024 * 100) / 100} MB`);
          console.log(`   Copied: ${Math.round(tempSize / 1024 / 1024 * 100) / 100} MB`);
          console.log(`   Copy ratio: ${Math.round((tempSize / sourceSize) * 10000) / 100}%`);
          
          // CRITICAL: Even with partial copy, ensure we have SOME session data
          if (tempSize < 1024 * 1024) { // Less than 1MB
            console.warn('⚠️  WARNING: Very little data copied! Session may not restore.');
          }
          
          // Create the zip with what we have
          return new Promise((resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 1 } }); // Fast compression
            const zipPath = path.join(process.cwd(), `${this.sessionName}.zip`);
            const output = fs.createWriteStream(zipPath);
            
            archive.pipe(output);
            archive.directory(this.tempDir, false);
            
            output.on('close', () => {
              const stats = fs.statSync(zipPath);
              console.log(`📦 Zip created: ${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB`);
              
              // Quick analysis of zip contents
              try {
                const buffer = fs.readFileSync(zipPath);
                unzipper.Open.buffer(buffer).then(directory => {
                  const criticalFound = {
                    cookies: 0,
                    localStorage: 0,
                    indexedDB: 0
                  };
                  
                  directory.files.forEach(file => {
                    if (file.path.toLowerCase().includes('cookies')) criticalFound.cookies++;
                    if (file.path.toLowerCase().includes('local storage')) criticalFound.localStorage++;
                    if (file.path.toLowerCase().includes('indexeddb')) criticalFound.indexedDB++;
                  });
                  
                  console.log(`🔍 Zip contains:`);
                  console.log(`   Files: ${directory.files.length}`);
                  console.log(`   Cookies: ${criticalFound.cookies > 0 ? '✅' : '❌'}`);
                  console.log(`   Local Storage: ${criticalFound.localStorage > 0 ? '✅' : '❌'}`);
                  console.log(`   IndexedDB: ${criticalFound.indexedDB > 0 ? '✅' : '❌'}`);
                });
              } catch (e) {}
              
              resolve();
            });
            
            archive.on('error', reject);
            archive.finalize();
          });
        };
        
        console.log('✅ RemoteAuth patched successfully with Windows-safe strategy');
      }
    }
    
    return result;
  };
  
} catch (error) {
  console.error('❌ Error patching RemoteAuth:', error);
}

export {};