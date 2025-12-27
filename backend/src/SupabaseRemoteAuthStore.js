// backend/src/SupabaseRemoteAuthStore.js - COMPLETE DEBUG VERSION
import { supabase } from './supabaseClient.js';
import fs from 'fs-extra'; // Use fs-extra for full functionality
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SupabaseRemoteAuthStore {
  constructor(clientId) {
    this.clientId = clientId;
    this.tableName = 'whatsapp_sessions';
    this.chunksTableName = 'whatsapp_session_chunks';
    this.initTables();
  }

  async initTables() {
    try {
      const { error: sessionsError } = await supabase
        .from(this.tableName)
        .select('*')
        .limit(1);

      if (sessionsError && sessionsError.code === '42P01') {
        console.log('Creating sessions table...');
      }

      const { error: chunksError } = await supabase
        .from(this.chunksTableName)
        .select('*')
        .limit(1);

      if (chunksError && chunksError.code === '42P01') {
        console.log('Creating chunks table...');
      }

      console.log('✅ Supabase store initialized for client:', this.clientId);
    } catch (error) {
      console.error('Error initializing Supabase tables:', error);
    }
  }

  async sessionExists(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      const { data, error } = await supabase
        .from(this.tableName)
        .select('id')
        .eq('id', sessionId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking session:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error in sessionExists:', error);
      return false;
    }
  }

  // ====== ENHANCED DEBUG SAVE METHOD ======
  async save(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      const zipFileName = `${options.session}.zip`;
      const zipPath = path.join(process.cwd(), zipFileName);
      
      console.log(`\n🔄 Save called for session: ${sessionId}`);
      console.log(`📁 Zip path: ${zipPath}`);
      
      // ====== STEP 1: COMPREHENSIVE ZIP ANALYSIS ======
      console.log('\n🔍 ===== ZIP FILE DEBUG ANALYSIS =====');
      
      // 1. Check if zip exists and get stats
      if (!fs.existsSync(zipPath)) {
        console.error(`❌ Zip file does not exist: ${zipPath}`);
        console.log('📂 Current directory contents:');
        const files = fs.readdirSync(process.cwd());
        files.forEach(file => {
          try {
            const stats = fs.statSync(file);
            console.log(`   - ${file} (${stats.size} bytes, ${stats.isDirectory() ? 'DIR' : 'FILE'})`);
          } catch (e) {
            console.log(`   - ${file} (error reading)`);
          }
        });
        return false;
      }
      
      const stats = fs.statSync(zipPath);
      console.log(`📊 Zip file stats:`);
      console.log(`   Size: ${stats.size} bytes (${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB)`);
      console.log(`   Modified: ${stats.mtime}`);
      
      // 2. Read and analyze zip structure
      try {
        const unzipper = await import('unzipper');
        const buffer = fs.readFileSync(zipPath);
        
        // Show hex dump for small files (debug if it's a real zip)
        if (stats.size < 5000) {
          console.log(`🔤 First 200 bytes (hex):`);
          console.log(buffer.slice(0, 200).toString('hex').match(/.{1,32}/g).join('\n   '));
          console.log(`🔤 First 200 bytes (ascii):`);
          console.log(buffer.slice(0, 200).toString('ascii'));
        }
        
        // Try to open as zip
        const directory = await unzipper.Open.buffer(buffer);
        console.log(`\n📦 ZIP CONTENTS (${directory.files.length} files):`);
        
        let totalSizeInZip = 0;
        let fileCount = 0;
        let dirCount = 0;
        
        for (const file of directory.files) {
          totalSizeInZip += file.size;
          const type = file.type === 'Directory' ? '📁' : '📄';
          
          // Show all files for small zips, or summary for large ones
          if (directory.files.length <= 50 || file.size > 0) {
            console.log(`   ${type} ${file.path} (${file.size} bytes)`);
          }
          
          if (file.type === 'Directory') dirCount++;
          else fileCount++;
        }
        
        console.log(`\n📊 ZIP SUMMARY:`);
        console.log(`   Total files: ${fileCount}`);
        console.log(`   Total directories: ${dirCount}`);
        console.log(`   Total size of files in zip: ${totalSizeInZip} bytes`);
        console.log(`   Zip file overhead: ${stats.size - totalSizeInZip} bytes`);
        
        // 3. Check for critical WhatsApp session files
        const criticalFiles = [
          'Default/Cookies',
          'Default/Local Storage',
          'IndexedDB',
          'Local Storage',
          'Session Storage'
        ];
        
        console.log(`\n🔑 CRITICAL FILES CHECK:`);
        for (const criticalFile of criticalFiles) {
          const found = directory.files.find(f => f.path.includes(criticalFile));
          if (found) {
            console.log(`   ✅ ${criticalFile}: FOUND (${found.size} bytes)`);
          } else {
            console.log(`   ❌ ${criticalFile}: MISSING`);
          }
        }
        
        // 4. Show largest files
        console.log(`\n🏆 TOP 10 LARGEST FILES:`);
        const sortedFiles = [...directory.files]
          .filter(f => f.type !== 'Directory')
          .sort((a, b) => b.size - a.size)
          .slice(0, 10);
        
        sortedFiles.forEach((file, i) => {
          console.log(`   ${i + 1}. ${file.path} (${file.size} bytes)`);
        });
        
      } catch (zipError) {
        console.error(`❌ Error analyzing zip: ${zipError.message}`);
        console.log('   This might not be a valid zip file');
        
        // Read raw content for debugging
        const buffer = fs.readFileSync(zipPath);
        console.log(`   First 500 bytes: ${buffer.slice(0, 500).toString('hex')}`);
      }
      
      console.log('🔍 ===== END ZIP ANALYSIS =====\n');
      
      // ====== STEP 2: COMPARE WITH SOURCE DIRECTORY ======
      console.log('🔍 ===== SOURCE DIRECTORY ANALYSIS =====');
      
      const authPath = path.join(__dirname, '../auth');
      const sessionDir = path.join(authPath, 'RemoteAuth-admin');
      const tempDir = path.join(authPath, `wwebjs_temp_session_${this.clientId}`);
      
      console.log(`📁 Session dir: ${sessionDir}`);
      console.log(`📁 Temp dir: ${tempDir}`);
      
      if (fs.existsSync(sessionDir)) {
        const sessionStats = fs.statSync(sessionDir);
        console.log(`   ✅ Session directory exists: ${sessionStats.size} bytes`);
        
        // Calculate total size recursively
        const calculateDirSize = (dir) => {
          let total = 0;
          try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              const itemPath = path.join(dir, item.name);
              if (item.isDirectory()) {
                total += calculateDirSize(itemPath);
              } else {
                const itemStats = fs.statSync(itemPath);
                total += itemStats.size;
              }
            }
          } catch (e) {}
          return total;
        };
        
        const sessionSize = calculateDirSize(sessionDir);
        console.log(`   📊 Total session size: ${sessionSize} bytes (${Math.round(sessionSize / 1024 / 1024 * 100) / 100} MB)`);
        
        // Compare with zip size
        console.log(`\n📊 SIZE COMPARISON:`);
        console.log(`   Session directory: ${sessionSize} bytes`);
        console.log(`   Zip file: ${stats.size} bytes`);
        console.log(`   Compression ratio: ${Math.round((stats.size / sessionSize) * 10000) / 100}%`);
        
        if (sessionSize > 0 && stats.size < sessionSize * 0.1) {
          console.log(`   ⚠️  WARNING: Zip is less than 10% of session size!`);
          console.log(`      Something is missing from the zip!`);
        }
      } else {
        console.log('   ❌ Session directory does not exist');
      }
      
      if (fs.existsSync(tempDir)) {
        const tempStats = fs.statSync(tempDir);
        console.log(`\n📁 Temp directory exists: ${tempStats.size} bytes`);
        
        // List temp dir contents
        try {
          const tempItems = fs.readdirSync(tempDir, { withFileTypes: true });
          console.log(`   Contains ${tempItems.length} items:`);
          tempItems.forEach(item => {
            const itemPath = path.join(tempDir, item.name);
            try {
              const itemStats = fs.statSync(itemPath);
              console.log(`   ${item.isDirectory() ? '📁' : '📄'} ${item.name} (${itemStats.size} bytes)`);
            } catch (e) {
              console.log(`   ? ${item.name} (error)`);
            }
          });
        } catch (e) {
          console.log(`   Error reading temp dir: ${e.message}`);
        }
      } else {
        console.log('\n📁 Temp directory does not exist');
      }
      
      console.log('🔍 ===== END SOURCE ANALYSIS =====\n');
      
      // ====== STEP 3: ACTUALLY SAVE TO SUPABASE ======
      console.log('💾 Saving to Supabase...');
      const sessionData = fs.readFileSync(zipPath);
      console.log(`📦 Read session zip file: ${zipFileName} (${sessionData.length} bytes)`);
      
      if (!sessionData || sessionData.length === 0) {
        console.warn('⚠️ Empty session data in zip file');
        return false;
      }
      
      const base64Data = sessionData.toString('base64');
      const chunkSize = 1024 * 1024;
      const chunks = [];
      
      for (let i = 0; i < base64Data.length; i += chunkSize) {
        chunks.push(base64Data.substring(i, i + chunkSize));
      }

      // Save metadata
      const { error: sessionError } = await supabase
        .from(this.tableName)
        .upsert({
          id: sessionId,
          session: sessionId,
          client_id: this.clientId,
          chunks_count: chunks.length,
          total_size: base64Data.length,
          last_accessed: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (sessionError) throw sessionError;
      console.log(`✅ Session metadata created: ${sessionId}`);

      // Delete existing chunks
      const { error: deleteChunksError } = await supabase
        .from(this.chunksTableName)
        .delete()
        .eq('session_id', sessionId);

      if (deleteChunksError) {
        console.error('Error deleting chunks:', deleteChunksError);
      }

      // Save chunks
      for (let i = 0; i < chunks.length; i++) {
        const { error } = await supabase
          .from(this.chunksTableName)
          .upsert({
            session_id: sessionId,
            chunk_index: i,
            chunk_data: chunks[i],
            total_chunks: chunks.length,
            updated_at: new Date().toISOString()
          }, { onConflict: 'session_id,chunk_index' });

        if (error) {
          console.error(`❌ Error saving chunk ${i}:`, error);
          throw error;
        }
      }

      console.log(`✅ Session saved to Supabase: ${sessionId} (${chunks.length} chunks, ${Math.round(sessionData.length / 1024)}KB)`);
      return true;
      
    } catch (error) {
      console.error('❌ Error saving session to Supabase:', error);
      return false;
    }
  }

  // Extract session from chunks and write to file
  async extract(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      const outputPath = options.path;
      
      console.log(`🔄 Extracting session to: ${outputPath} for session: ${sessionId}`);
      
      // Get all chunks for this session
      const { data: chunks, error } = await supabase
        .from(this.chunksTableName)
        .select('chunk_index, chunk_data, total_chunks')
        .eq('session_id', sessionId)
        .order('chunk_index', { ascending: true });

      if (error) throw error;
      
      if (!chunks || chunks.length === 0) {
        console.log('No session chunks found for:', sessionId);
        return null;
      }

      // Reconstruct the base64 string
      let base64Data = '';
      for (const chunk of chunks) {
        base64Data += chunk.chunk_data;
      }

      // Convert back to Buffer
      const sessionData = Buffer.from(base64Data, 'base64');

      // Write the buffer to the output file
      await fs.writeFile(outputPath, sessionData);
      console.log(`✅ Session extracted to file: ${outputPath} (${sessionData.length} bytes)`);

      // Update last accessed time
      await supabase
        .from(this.tableName)
        .update({ 
          last_accessed: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      console.log(`✅ Session extracted from Supabase: ${sessionId} (${chunks.length} chunks)`);
      return sessionData;
    } catch (error) {
      console.error('❌ Error extracting session from Supabase:', error);
      return null;
    }
  }

  // Delete session and all chunks
  async delete(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      
      // ✅ FIX: Delete chunks first to avoid foreign key constraint issues
      const { error: chunksError } = await supabase
        .from(this.chunksTableName)
        .delete()
        .eq('session_id', sessionId);

      if (chunksError) console.error('Error deleting chunks:', chunksError);

      // Then delete session metadata
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      console.log(`✅ Session deleted from Supabase: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('Error deleting session from Supabase:', error);
      return false;
    }
  }

  // List all sessions for this client
  async list() {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('id, client_id, chunks_count, total_size, last_accessed, updated_at')
        .eq('client_id', this.clientId);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    }
  }

  // Get session info
  async getSessionInfo(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error getting session info:', error);
      return null;
    }
  }

  // Clean up old sessions (older than specified hours)
  async cleanupOldSessions(maxAgeHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000)).toISOString();
      
      // Find old sessions
      const { data: oldSessions, error } = await supabase
        .from(this.tableName)
        .select('id')
        .lt('last_accessed', cutoffTime)
        .eq('client_id', this.clientId);

      if (error) throw error;

      let deletedCount = 0;
      
      // Delete each old session
      for (const session of oldSessions) {
        const sessionId = session.id;
        const baseSession = sessionId.replace(`${this.clientId}-`, '');
        
        await this.delete({ session: baseSession });
        deletedCount++;
      }

      console.log(`🧹 Cleaned up ${deletedCount} old sessions from Supabase`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
      return 0;
    }
  }

  // Get storage statistics
  async getStorageStats() {
    try {
      const { data: sessions, error } = await supabase
        .from(this.tableName)
        .select('total_size, chunks_count')
        .eq('client_id', this.clientId);

      if (error) throw error;

      const totalSize = sessions.reduce((sum, session) => sum + (session.total_size || 0), 0);
      const totalChunks = sessions.reduce((sum, session) => sum + (session.chunks_count || 0), 0);
      
      return {
        sessionsCount: sessions.length,
        totalSize: totalSize,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
        totalChunks: totalChunks,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        sessionsCount: 0,
        totalSize: 0,
        totalSizeMB: 0,
        totalChunks: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }
}