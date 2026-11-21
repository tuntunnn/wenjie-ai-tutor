import mysql from 'mysql2/promise';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const config=fileURLToPath(new URL('.env.mysql',import.meta.url));
if(existsSync(config))process.loadEnvFile(config);
const pool=process.env.WENJIE_DB_USER ? mysql.createPool({
 host:'127.0.0.1',port:Number(process.env.WENJIE_DB_PORT||3306),
 user:process.env.WENJIE_DB_USER,password:process.env.WENJIE_DB_PASSWORD,
 database:'wenjie',charset:'utf8mb4',connectionLimit:4,connectTimeout:4000
}) : null;
export async function recordTurn({id,turn,problem,student,tutor,done,mode}){
 if(!pool) return;
 if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id)||!Number.isInteger(turn)||turn<0||turn>100||
  typeof problem!=='string'||!problem.trim()||problem.length>5000||
  typeof student!=='string'||student.length>2000||typeof tutor!=='string'||!tutor.trim()||tutor.length>10000||
  typeof done!=='boolean')throw Error('对话记录格式无效，请重新开始。');
 const fields=[id,turn,problem,student,tutor,done,mode];
 try{
  await pool.execute('INSERT INTO learning_turns (conversation_id,turn_number,problem,student_text,tutor_text,completed,mode) VALUES (?,?,?,?,?,?,?)',fields);
 }catch(err){
  if(err.code!=='ER_DUP_ENTRY')throw Error('本机数据库写入失败，请检查 MySQL 服务后重试。');
  const [rows]=await pool.execute('SELECT problem,student_text,tutor_text,completed FROM learning_turns WHERE conversation_id=? AND turn_number=?',[id,turn]);
  const old=rows[0];
  if(!old||old.problem!==problem||old.student_text!==student)throw Error('本轮与已保存内容冲突，请重新开始。');
  return {message:old.tutor_text,done:!!old.completed};
 }
 return {message:tutor,done};
}
