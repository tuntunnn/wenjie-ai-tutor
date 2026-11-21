import mysql from 'mysql2/promise';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const config=fileURLToPath(new URL('.env.mysql',import.meta.url));
if(existsSync(config))process.loadEnvFile(config);
export const pool=process.env.WENJIE_DB_USER ? mysql.createPool({
 host:'127.0.0.1',port:Number(process.env.WENJIE_DB_PORT||3306),
 user:process.env.WENJIE_DB_USER,password:process.env.WENJIE_DB_PASSWORD,
 database:'wenjie',charset:'utf8mb4',connectionLimit:4,connectTimeout:4000
}) : null;
export async function recordTurn({id,turn,problem,student,tutor,done,mode},accountId=null){
 if(!pool) return;
 if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id)||!Number.isInteger(turn)||turn<0||turn>100||
  typeof problem!=='string'||!problem.trim()||problem.length>5000||
  typeof student!=='string'||student.length>2000||typeof tutor!=='string'||!tutor.trim()||tutor.length>10000||
  typeof done!=='boolean')throw Error('对话记录格式无效，请重新开始。');
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();
  // A single ownership row serializes first writes and simultaneous retries.
  // Existing conversations without an owner were created in guest mode.
  await db.execute(`INSERT INTO conversations (id,account_id)
   VALUES (?,IF(EXISTS(SELECT 1 FROM learning_turns WHERE conversation_id=? LIMIT 1),NULL,?))
   ON DUPLICATE KEY UPDATE id=conversations.id`,[id,id,accountId]);
  const [[owner]]=await db.execute('SELECT account_id FROM conversations WHERE id=? FOR UPDATE',[id]);
  if(owner.account_id!==accountId)throw Error('这段对话不属于当前账号。');
  const [[latest]]=await db.execute('SELECT turn_number,problem FROM learning_turns WHERE conversation_id=? ORDER BY turn_number DESC LIMIT 1',[id]);
  // Anonymous records from earlier versions must never be claimed by a new account.
  if(latest && latest.problem!==problem)throw Error('题目已变更，请开始新对话。');
  let result={message:tutor,done};
  if(latest && turn<=latest.turn_number){
   const [[old]]=await db.execute('SELECT student_text,tutor_text,completed FROM learning_turns WHERE conversation_id=? AND turn_number=?',[id,turn]);
   if(!old||old.student_text!==student)throw Error('记录已更新，请重新打开这段对话。');
   result={message:old.tutor_text,done:!!old.completed};
  }else{
   if(turn!==(latest?latest.turn_number+1:0))throw Error('对话轮次不连续，请重新打开历史记录。');
   await db.execute('INSERT INTO learning_turns (conversation_id,turn_number,problem,student_text,tutor_text,completed,mode) VALUES (?,?,?,?,?,?,?)',[id,turn,problem,student,tutor,done,mode]);
  }
  await db.commit();
  return result;
 }catch(err){
  await db.rollback();
  if(err.code)throw Error('数据库写入失败，请检查数据库连接与权限。');
  throw err;
 }finally{db.release();}
}

export async function listHistory(accountId){
 const [rows]=await pool.execute(`SELECT t.conversation_id AS id, LEFT(t.problem,120) AS title, t.completed, t.created_at AS updated
 FROM conversations c JOIN learning_turns t ON t.conversation_id=c.id
 WHERE c.account_id=? AND t.turn_number=(SELECT MAX(s.turn_number) FROM learning_turns s WHERE s.conversation_id=c.id)
 ORDER BY t.created_at DESC, c.id`,[accountId]);
 return rows;
}

export async function readHistory(accountId,id){
 const [rows]=await pool.execute(`SELECT t.turn_number,t.problem,t.student_text,t.tutor_text,t.completed,t.mode
 FROM conversations c JOIN learning_turns t ON t.conversation_id=c.id
 WHERE c.account_id=? AND c.id=? ORDER BY t.turn_number`,[accountId,id]);
 return rows;
}
