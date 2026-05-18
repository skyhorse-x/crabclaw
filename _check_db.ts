import { Database } from 'bun:sqlite';
const db = new Database('D:/Desktop/项目/crabclaw/server/data.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', JSON.stringify(tables));
try {
  const rows = db.prepare('SELECT COUNT(*) as count FROM conversations').all();
  console.log('Conversations count:', rows[0].count);
  const sample = db.prepare('SELECT id, title FROM conversations LIMIT 5').all();
  console.log('Sample conversations:', JSON.stringify(sample));
} catch(e) {
  console.log('No conversations table:', e.message);
}
db.close();
