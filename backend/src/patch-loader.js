// backend/src/patch-loader.js
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🛠️ Loading RemoteAuth patch...');

try {
  // Direct require to ensure patch applies
  const require = createRequire(import.meta.url);
  
  // Clear the require cache for whatsapp-web.js to force reload
  const whatsappPath = require.resolve('whatsapp-web.js');
  console.log('🔧 Found whatsapp-web.js at:', whatsappPath);
  
  // Delete from cache so it gets reloaded
  delete require.cache[whatsappPath];
  
  // Now load the patch
  const patchPath = path.join(__dirname, 'patches', 'patchRemoteAuth.js');
  delete require.cache[patchPath];
  
  console.log('🔧 Applying patch from:', patchPath);
  require(patchPath);
  
  // Force reload whatsapp-web.js to ensure patch takes effect
  delete require.cache[whatsappPath];
  
  console.log('✅ Patch applied successfully');
  
} catch (error) {
  console.error('❌ Failed to load patch:', error);
  console.error(error.stack);
}