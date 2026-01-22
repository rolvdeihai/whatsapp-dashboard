// backend/src/SupabaseRemoteAuthStore.js - UPDATED VERSION
import { supabase } from './supabaseClient.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SupabaseRemoteAuthStore {
  constructor(clientId, endpointId = null) {
    this.clientId = clientId;
    this.endpointId = endpointId; // Store endpoint association
    this.tableName = 'whatsapp_sessions';
    this.chunksTableName = 'whatsapp_session_chunks';
    this.chunkSize = 512 * 1024; // 512KB chunks
    this.initTables();
  }

  // Method to set/update endpoint ID dynamically
  setEndpointId(endpointId) {
    this.endpointId = endpointId;
    console.log(`🔗 Session store now associated with endpoint: ${endpointId}`);
  }

  async initTables() {
    try {
      console.log(`🔄 Initializing Supabase store for endpoint: ${this.endpointId || 'default'}`);
      
      // Check if tables exist (you can run the SQL above if they don't)
      const { error: sessionsError } = await supabase
        .from(this.tableName)
        .select('id')
        .limit(1);

      if (sessionsError && sessionsError.code === '42P01') {
        console.error('⚠️ Sessions table does not exist. Please run the SQL migration.');
      }

      const { error: chunksError } = await supabase
        .from(this.chunksTableName)
        .select('id')
        .limit(1);

      if (chunksError && chunksError.code === '42P01') {
        console.error('⚠️ Chunks table does not exist. Please run the SQL migration.');
      }

      console.log('✅ Supabase store initialized');
    } catch (error) {
      console.error('Error initializing Supabase tables:', error);
    }
  }

  async sessionExists(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      
      // Build query WITH endpoint filter
      let query = supabase
        .from(this.tableName)
        .select('id, chunks_count, total_size, endpoint_id')
        .eq('id', sessionId);

      // ✅ CRITICAL: Only return true if endpoint matches
      if (this.endpointId) {
        query = query.eq('endpoint_id', this.endpointId);
      } else {
        // If no endpoint specified, only return sessions with NULL endpoint
        query = query.is('endpoint_id', null);
      }

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking session:', error);
        return false;
      }

      if (!data) return false;

      // Verify chunks exist (existing code)
      const { data: chunks } = await supabase
        .from(this.chunksTableName)
        .select('chunk_index')
        .eq('session_id', sessionId);

      return chunks && chunks.length === data.chunks_count;
    } catch (error) {
      console.error('Error in sessionExists:', error);
      return false;
    }
  }

  async save(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      const zipFileName = `${options.session}.zip`;
      const zipPath = path.join(process.cwd(), zipFileName);
      
      console.log(`\n💾 SAVE SESSION: ${sessionId}`);
      console.log(`📁 Zip path: ${zipPath}`);
      console.log(`🔗 Associated endpoint: ${this.endpointId || 'none'}`);

      // 1. Verify zip file exists
      if (!fs.existsSync(zipPath)) {
        console.error(`❌ Zip file does not exist: ${zipPath}`);
        return false;
      }

      const stats = fs.statSync(zipPath);
      console.log(`📊 Zip size: ${stats.size} bytes (${Math.round(stats.size / 1024)}KB)`);

      // 2. Read and process zip file
      const zipBuffer = fs.readFileSync(zipPath);
      const checksum = createHash('md5').update(zipBuffer).digest('hex');
      console.log(`🔐 File checksum: ${checksum}`);

      const base64Data = zipBuffer.toString('base64');
      console.log(`📊 Base64 length: ${base64Data.length} chars`);

      // 3. Split into chunks
      const chunks = [];
      let chunkStart = 0;
      let chunkIndex = 0;
      
      while (chunkStart < base64Data.length) {
        let chunkEnd = Math.min(chunkStart + this.chunkSize, base64Data.length);
        
        // Adjust to end at base64 boundary
        const remainder = (chunkEnd - chunkStart) % 4;
        if (remainder !== 0 && chunkEnd < base64Data.length) {
          chunkEnd -= remainder;
        }
        
        const chunkContent = base64Data.substring(chunkStart, chunkEnd);
        chunks.push({
          index: chunkIndex,
          content: chunkContent,
          length: chunkContent.length
        });
        
        chunkStart = chunkEnd;
        chunkIndex++;
      }

      console.log(`📦 Split into ${chunks.length} chunks`);

      // 4. Save metadata with endpoint association
      const sessionData = {
        id: sessionId,
        session: sessionId,
        client_id: this.clientId,
        chunks_count: chunks.length,
        total_size: base64Data.length,
        file_size: stats.size,
        checksum: checksum,
        endpoint_id: this.endpointId, // Store endpoint association
        last_accessed: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: metadataError } = await supabase
        .from(this.tableName)
        .upsert(sessionData, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });

      if (metadataError) {
        console.error('❌ Error saving metadata:', metadataError);
        throw metadataError;
      }
      console.log('✅ Session metadata saved');

      // 5. Delete existing chunks
      const { error: deleteError } = await supabase
        .from(this.chunksTableName)
        .delete()
        .eq('session_id', sessionId);

      if (deleteError) {
        console.error('⚠️ Error deleting old chunks:', deleteError);
      } else {
        console.log('🧹 Cleared old chunks');
      }

      // 6. Save chunks in batches - USING CORRECT COLUMN NAMES
      const BATCH_SIZE = 10;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const chunkInserts = batch.map(chunk => ({
          session_id: sessionId,
          chunk_index: chunk.index,
          chunk_data: chunk.content,
          total_chunks: chunks.length,
          created_at: new Date().toISOString()
          // Removed chunk_size as it doesn't exist in your table
        }));

        const { error: batchError } = await supabase
          .from(this.chunksTableName)
          .insert(chunkInserts);

        if (batchError) {
          console.error(`❌ Error saving batch ${i/BATCH_SIZE + 1}:`, batchError);
          throw batchError;
        }

        console.log(`✅ Saved batch ${i/BATCH_SIZE + 1}: chunks ${i} to ${i + batch.length - 1}`);
      }

      console.log(`✅ Session saved successfully: ${sessionId}`);
      console.log(`   Associated with endpoint: ${this.endpointId || 'none'}`);
      console.log(`   Total chunks: ${chunks.length}`);

      return true;
    } catch (error) {
      console.error('❌ CRITICAL: Error saving session to Supabase:', error);
      return false;
    }
  }

  async extract(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      const outputPath = options.path;
      
      console.log(`\n🔄 EXTRACT SESSION: ${sessionId}`);
      console.log(`📁 Output path: ${outputPath}`);
      console.log(`🔗 Current endpoint: ${this.endpointId || 'any'}`);

      // ✅ CRITICAL: Get session metadata WITH endpoint validation
      let query = supabase
        .from(this.tableName)
        .select('*')
        .eq('id', sessionId);

      // Apply endpoint filter if we have one
      if (this.endpointId) {
        query = query.eq('endpoint_id', this.endpointId);
      } else {
        // If no endpoint specified, only get unbound sessions
        query = query.is('endpoint_id', null);
      }

      const { data: sessionMeta, error: metaError } = await query.single();

      if (metaError) {
        console.error(`❌ Session not found or endpoint mismatch for ${sessionId}`);
        console.error(`   Current endpoint: ${this.endpointId || 'none'}`);
        return null;
      }

      if (!sessionMeta) {
        console.error(`❌ No session found or endpoint mismatch: ${sessionId}`);
        return null;
      }

      console.log(`✅ Session found and endpoint validated`);
      console.log(`   Stored endpoint: ${sessionMeta.endpoint_id || 'none'}`);
      console.log(`   Current endpoint: ${this.endpointId || 'none'}`);
      
      // If endpoints don't match, reject
      if (sessionMeta.endpoint_id !== this.endpointId) {
        console.error(`❌ ENDPOINT MISMATCH!`);
        console.error(`   Session belongs to endpoint: ${sessionMeta.endpoint_id}`);
        console.error(`   Current endpoint: ${this.endpointId}`);
        console.error(`   Access DENIED - session is locked to another endpoint`);
        return null;
      }
      
      return this.extractSessionData(sessionMeta, sessionId, outputPath);
    } catch (error) {
      console.error('❌ Error extracting session:', error);
      return null;
    }
  }

  async extractSessionData(sessionMeta, sessionId, outputPath) {
    try {
      // 2. Get all chunks - USING CORRECT COLUMN NAMES
      const { data: chunks, error: chunksError } = await supabase
        .from(this.chunksTableName)
        .select('chunk_index, chunk_data') // Removed chunk_size
        .eq('session_id', sessionId)
        .order('chunk_index', { ascending: true });

      if (chunksError) {
        console.error('❌ Error fetching chunks:', chunksError);
        return null;
      }

      if (!chunks || chunks.length === 0) {
        console.error('❌ No chunks found for session');
        return null;
      }

      console.log(`📦 Retrieved ${chunks.length} chunks`);

      // 3. Reconstruct base64 string
      let base64Data = '';
      const chunkMap = new Map();
      chunks.forEach(chunk => {
        chunkMap.set(chunk.chunk_index, chunk);
      });

      for (let i = 0; i < sessionMeta.chunks_count; i++) {
        const chunk = chunkMap.get(i);
        if (chunk) {
          base64Data += chunk.chunk_data;
        } else {
          console.error(`❌ Missing chunk ${i}`);
          base64Data += '';
        }
      }

      // 4. Convert to buffer
      let sessionData;
      try {
        sessionData = Buffer.from(base64Data, 'base64');
        console.log(`✅ Converted to buffer: ${sessionData.length} bytes`);
      } catch (bufferError) {
        console.error(`❌ Failed to convert base64 to buffer: ${bufferError.message}`);
        return null;
      }

      // 5. Verify checksum if available
      if (sessionMeta.checksum) {
        const extractedChecksum = createHash('md5').update(sessionData).digest('hex');
        console.log(`🔐 Extracted checksum: ${extractedChecksum}`);
        console.log(`🔐 Expected checksum: ${sessionMeta.checksum}`);
        
        if (extractedChecksum !== sessionMeta.checksum) {
          console.error('❌ CHECKSUM MISMATCH! Session data may be corrupted');
        } else {
          console.log('✅ Checksum verified');
        }
      }

      // 6. Write to file
      await fs.writeFile(outputPath, sessionData);
      console.log(`✅ Session written to: ${outputPath}`);

      // 7. Update last accessed
      await supabase
        .from(this.tableName)
        .update({ 
          last_accessed: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      console.log(`✅ Session extracted successfully: ${sessionId}`);
      return sessionData;
    } catch (error) {
      console.error('❌ Error in extractSessionData:', error);
      return null;
    }
  }

  async delete(options) {
    try {
      const sessionId = `${this.clientId}-${options.session}`;
      
      console.log(`🗑️ Deleting session: ${sessionId}`);
      
      // Delete chunks first
      const { error: chunksError } = await supabase
        .from(this.chunksTableName)
        .delete()
        .eq('session_id', sessionId);

      if (chunksError) {
        console.error('Error deleting chunks:', chunksError);
      }

      // Delete session metadata
      const { error: sessionError } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', sessionId);

      if (sessionError) {
        console.error('Error deleting session metadata:', sessionError);
        throw sessionError;
      }

      console.log(`✅ Session deleted: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  }

  // Get all sessions for a specific endpoint
  async getSessionsByEndpoint(endpointId) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('endpoint_id', endpointId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting sessions by endpoint:', error);
      return [];
    }
  }

  // Migrate session to a different endpoint
  async migrateSession(sessionId, newEndpointId) {
    try {
      const { error } = await supabase
        .from(this.tableName)
        .update({ 
          endpoint_id: newEndpointId,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;
      
      console.log(`✅ Session ${sessionId} migrated to endpoint ${newEndpointId}`);
      return true;
    } catch (error) {
      console.error('Error migrating session:', error);
      return false;
    }
  }
}